#!/usr/bin/env python3
"""
nanobot Web Chat Worker v2 — SDK-based agent execution.

Replaces subprocess-based worker with in-process SDK calls.
Uses asyncio event loop in a dedicated thread for agent execution.

Supports:
  POST /execute        — blocking JSON response (legacy)
  POST /execute-stream — SSE stream with real-time progress
  GET  /tasks/<key>    — query background task status
  POST /tasks/<key>/kill — cancel a running task

Usage: python3 worker.py [--port 8082] [--daemonize]
"""

import asyncio
import http.server
import json
import logging
import os
import socketserver
import sys
import threading
import time
from datetime import datetime


PORT = 8082
DAEMONIZE = False
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
    elif arg == '--daemonize':
        DAEMONIZE = True

LOG_FILE = '/tmp/nanobot-worker.log'

# ── Logging setup ──
logger = logging.getLogger('worker')
logger.setLevel(logging.DEBUG)
_fmt = logging.Formatter('[%(asctime)s] %(levelname)s %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
_fh = logging.FileHandler(LOG_FILE, encoding='utf-8')
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(_fmt)
_sh = logging.StreamHandler(sys.stderr)
_sh.setLevel(logging.INFO)
_sh.setFormatter(_fmt)
logger.addHandler(_fh)
logger.addHandler(_sh)


# ── Async event loop in a dedicated thread ──
_async_loop: asyncio.AbstractEventLoop | None = None
_async_thread: threading.Thread | None = None


def _start_async_loop():
    """Start a dedicated asyncio event loop in a background thread."""
    global _async_loop, _async_thread

    def _run_loop():
        global _async_loop
        _async_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_async_loop)
        _async_loop.run_forever()

    _async_thread = threading.Thread(target=_run_loop, daemon=True)
    _async_thread.start()
    # Wait for loop to be ready
    while _async_loop is None:
        time.sleep(0.01)


# ── AgentRunner singleton ──
_runner = None
_runner_lock = threading.Lock()


def _get_runner():
    """Lazy-init AgentRunner singleton."""
    global _runner
    if _runner is not None:
        return _runner
    with _runner_lock:
        if _runner is not None:
            return _runner
        from nanobot.sdk import AgentRunner
        _runner = AgentRunner.from_config()
        logger.info("AgentRunner initialized")
        return _runner


# ── Task Registry ──
_tasks = {}       # session_key -> task dict
_tasks_lock = threading.Lock()
TASK_TTL = 600    # Keep completed tasks for 10 minutes


def _truncate_tool_output(content: str, max_len: int = 80) -> str:
    """Truncate tool output to a short summary (first meaningful line)."""
    if not content:
        return '(无输出)'
    first_line = ''
    for line in content.split('\n'):
        stripped = line.strip()
        if stripped:
            first_line = stripped
            break
    if not first_line:
        return content[:max_len] + '…' if len(content) > max_len else content
    if len(first_line) <= max_len:
        return first_line
    return first_line[:max_len] + '…'


def _cleanup_old_tasks():
    """Remove completed tasks older than TASK_TTL."""
    now = time.time()
    with _tasks_lock:
        expired = [k for k, v in _tasks.items()
                   if v['status'] in ('done', 'error')
                   and now - v.get('_finished_ts', 0) > TASK_TTL]
        for k in expired:
            del _tasks[k]


def _run_task_sdk(session_key: str, message: str):
    """Run nanobot agent via SDK in the async event loop. Updates task registry."""
    from nanobot.agent.callbacks import DefaultCallbacks, AgentResult

    task = {
        'status': 'running',
        'started_at': datetime.now().isoformat(),
        'finished_at': None,
        'progress': [],
        'error': None,
        '_finished_ts': 0,
        '_sse_clients': [],
        '_sse_lock': threading.Lock(),
        '_usage': None,
        '_async_task': None,  # asyncio.Task for cancellation
    }
    with _tasks_lock:
        _tasks[session_key] = task

    class WorkerCallbacks(DefaultCallbacks):
        """Callbacks that bridge async agent events to the task registry + SSE."""

        async def on_progress(self, text: str, *, tool_hint: bool = False) -> None:
            task['progress'].append(text)
            payload = {'text': text}
            if tool_hint:
                payload['type'] = 'tool_hint'
            _notify_sse(task, 'progress', payload)

        async def on_message(self, message: dict) -> None:
            """Forward tool results and assistant thinking text as progress events."""
            role = message.get('role', '')

            if role == 'tool':
                # Tool execution result — show as "↳ tool_name → summary"
                tool_name = message.get('name', 'unknown')
                content = message.get('content', '')
                # Truncate to first meaningful line for summary
                summary = _truncate_tool_output(content, max_len=80)
                progress_text = f"{tool_name} → {summary}"
                task['progress'].append(progress_text)
                _notify_sse(task, 'progress', {
                    'text': progress_text,
                    'type': 'tool_result',
                    'name': tool_name,
                    'content': content,
                })

        async def on_usage(self, usage: dict) -> None:
            task['_usage'] = {
                'session_key': session_key,
                'model': usage.get('model', 'unknown'),
                'prompt_tokens': usage.get('prompt_tokens', 0),
                'completion_tokens': usage.get('completion_tokens', 0),
                'total_tokens': usage.get('total_tokens', 0),
                'llm_calls': usage.get('llm_calls', 0),
                'started_at': usage.get('started_at', ''),
                'finished_at': usage.get('finished_at', ''),
            }
            logger.info(f"Usage: {usage.get('total_tokens', 0)} tokens, "
                        f"{usage.get('llm_calls', 0)} calls")

        async def on_done(self, result: AgentResult) -> None:
            pass  # Handled in the wrapper below

        async def on_error(self, error: Exception) -> None:
            pass  # Handled in the wrapper below

    async def _execute():
        runner = _get_runner()
        try:
            result = await runner.run(
                message=message,
                session_key=session_key,
                channel='web',
                chat_id=session_key.split(':', 1)[-1] if ':' in session_key else session_key,
                callbacks=WorkerCallbacks(),
            )
            task['status'] = 'done'
            logger.info(f"Task done: session={session_key}, steps={len(task['progress'])}")
        except asyncio.CancelledError:
            task['status'] = 'error'
            task['error'] = 'Cancelled by user'
            logger.info(f"Task cancelled: session={session_key}")
        except Exception as e:
            task['status'] = 'error'
            task['error'] = str(e)
            logger.error(f"Task error: session={session_key}, error={e}", exc_info=True)
        finally:
            task['finished_at'] = datetime.now().isoformat()
            task['_finished_ts'] = time.time()

            usage_data = task.get('_usage')
            if usage_data:
                task['usage'] = usage_data

            # Notify SSE clients of completion
            if task['status'] == 'done':
                done_payload = {'success': True}
                if usage_data:
                    done_payload['usage'] = usage_data
                _notify_sse(task, 'done', done_payload)
            else:
                _notify_sse(task, 'error', {'message': task.get('error', 'Unknown error')})

            # Clear SSE clients
            with task['_sse_lock']:
                task['_sse_clients'] = []

            _cleanup_old_tasks()

    # Schedule on the async event loop
    future = asyncio.run_coroutine_threadsafe(_execute(), _async_loop)
    # Store the asyncio task for cancellation (via the future)
    task['_future'] = future


def _notify_sse(task, event: str, data: dict):
    """Notify all SSE clients of an event (thread-safe)."""
    with task['_sse_lock']:
        alive = []
        for sse_fn in task['_sse_clients']:
            try:
                sse_fn(event, data)
                alive.append(sse_fn)
            except Exception:
                pass  # Client disconnected
        task['_sse_clients'] = alive


class WorkerHandler(http.server.BaseHTTPRequestHandler):
    """Handles nanobot agent execution requests."""

    def log_message(self, format, *args):
        if args:
            logger.debug(args[0])

    def _read_json_body(self):
        """Read and parse JSON request body. Returns (data, error_sent)."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_json({'error': 'Invalid JSON'}, 400)
            return None, True

        session_key = data.get('session_key', '').strip()
        message = data.get('message', '').strip()

        if not session_key or not message:
            self._send_json({'error': 'Missing session_key or message'}, 400)
            return None, True

        return data, False

    # ── Routing ──

    def do_POST(self):
        path = self.path.rstrip('/')
        if path == '/execute':
            self._handle_execute()
        elif path == '/execute-stream':
            self._handle_execute_stream()
        elif path.startswith('/tasks/') and path.endswith('/kill'):
            session_key = path[7:-5]
            session_key = session_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_kill_task(session_key)
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_GET(self):
        path = self.path.rstrip('/')
        if path == '/health':
            self._send_json({'status': 'ok', 'service': 'worker', 'mode': 'sdk'})
            return
        if path.startswith('/tasks/'):
            session_key = path[7:]
            session_key = session_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_get_task(session_key)
            return
        self._send_json({'error': 'Not found'}, 404)

    # ── Legacy blocking endpoint ──

    def _handle_execute(self):
        data, err = self._read_json_body()
        if err:
            return
        session_key = data['session_key'].strip()
        message = data['message'].strip()

        logger.info(f"Execute (blocking): session={session_key}, message={message[:80]}...")

        try:
            runner = _get_runner()
            future = asyncio.run_coroutine_threadsafe(
                runner.run(
                    message=message,
                    session_key=session_key,
                    channel='web',
                    chat_id=session_key.split(':', 1)[-1] if ':' in session_key else session_key,
                ),
                _async_loop,
            )
            reply = future.result(timeout=300)
            if not reply:
                reply = '(无回复)'
            logger.info(f"Execute done: session={session_key}, reply_len={len(reply)}")
            self._send_json({'reply': reply, 'success': True})
        except TimeoutError:
            logger.error(f"Execute timeout: session={session_key}")
            self._send_json({'reply': '⏱️ 请求超时，请稍后重试', 'success': False}, 504)
        except Exception as e:
            logger.error(f"Execute error: session={session_key}, error={e}")
            self._send_json({'reply': f'❌ 错误: {str(e)}', 'success': False}, 500)

    # ── SSE streaming endpoint ──

    def _handle_execute_stream(self):
        data, err = self._read_json_body()
        if err:
            return
        session_key = data['session_key'].strip()
        message = data['message'].strip()

        logger.info(f"Stream: session={session_key}, message={message[:80]}...")

        # Check if there's already a running task for this session
        with _tasks_lock:
            existing = _tasks.get(session_key)
            if existing and existing['status'] == 'running':
                logger.warning(f"Task already running for session={session_key}, attaching SSE")
                self._attach_to_existing_task(existing)
                return

        # Start SDK task
        _run_task_sdk(session_key, message)

        # Wait briefly for task to register
        time.sleep(0.05)

        # Attach as SSE client
        with _tasks_lock:
            task = _tasks.get(session_key)
        if task:
            self._attach_to_existing_task(task)
        else:
            self._send_json({'error': 'Failed to start task'}, 500)

    def _attach_to_existing_task(self, task):
        """Attach current HTTP connection as SSE client to an existing task."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()

        # Send any progress that already happened (catch-up)
        for step in list(task['progress']):
            try:
                self._send_sse('progress', {'text': step})
            except BrokenPipeError:
                logger.warning("Client disconnected during catch-up")
                return

        # If task already finished, send final event
        if task['status'] == 'done':
            try:
                done_payload = {'success': True}
                if task.get('usage'):
                    done_payload['usage'] = task['usage']
                self._send_sse('done', done_payload)
            except BrokenPipeError:
                pass
            return
        elif task['status'] == 'error':
            try:
                self._send_sse('error', {'message': task.get('error', 'Unknown error')})
            except BrokenPipeError:
                pass
            return

        # Task still running — register as SSE client
        disconnected = threading.Event()

        def sse_writer(event, data):
            if disconnected.is_set():
                raise BrokenPipeError("Client disconnected")
            payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            self.wfile.write(payload.encode('utf-8'))
            self.wfile.flush()

        with task['_sse_lock']:
            task['_sse_clients'].append(sse_writer)

        # Block until task finishes or client disconnects
        try:
            while task['status'] == 'running':
                time.sleep(0.5)
        except Exception:
            pass
        finally:
            disconnected.set()
            with task['_sse_lock']:
                if sse_writer in task['_sse_clients']:
                    task['_sse_clients'].remove(sse_writer)

    # ── Task kill ──

    def _handle_kill_task(self, session_key):
        """POST /tasks/<session_key>/kill — cancel a running task."""
        with _tasks_lock:
            task = _tasks.get(session_key)

        if not task:
            self._send_json({'status': 'unknown', 'message': 'No task found'})
            return

        if task['status'] != 'running':
            self._send_json({'status': task['status'], 'message': 'Task not running'})
            return

        # Cancel the asyncio future
        future = task.get('_future')
        if future:
            future.cancel()
            logger.info(f"Cancelled task: session={session_key}")
        else:
            logger.warning(f"No future to cancel: session={session_key}")

        self._send_json({'status': 'cancelled', 'message': 'Task cancellation requested'})

    # ── Task status query ──

    def _handle_get_task(self, session_key):
        """GET /tasks/<session_key> — query task status."""
        with _tasks_lock:
            task = _tasks.get(session_key)

        if not task:
            self._send_json({
                'status': 'unknown',
                'message': 'No task found for this session',
            })
            return

        result = {
            'status': task['status'],
            'started_at': task.get('started_at'),
            'finished_at': task.get('finished_at'),
            'progress_count': len(task.get('progress', [])),
            'progress': list(task.get('progress', [])),
        }
        if task['status'] == 'error':
            result['error'] = task.get('error', '')
        if task.get('usage'):
            result['usage'] = task['usage']
        self._send_json(result)

    def _send_sse(self, event, data):
        """Send a single SSE event."""
        payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        self.wfile.write(payload.encode('utf-8'))
        self.wfile.flush()

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    if DAEMONIZE:
        pid = os.fork()
        if pid > 0:
            print(f"Worker daemonized (pid={pid})")
            sys.exit(0)
        os.setsid()
        pid2 = os.fork()
        if pid2 > 0:
            sys.exit(0)
        sys.stdin = open(os.devnull, 'r')
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        devnull_fd = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull_fd, 0)
        os.dup2(devnull_fd, 1)
        os.dup2(devnull_fd, 2)
        os.close(devnull_fd)

    # Start async event loop
    _start_async_loop()
    logger.info("Async event loop started")

    # Pre-initialize AgentRunner (loads config, connects to MCP, etc.)
    try:
        _get_runner()
    except Exception as e:
        logger.error(f"Failed to initialize AgentRunner: {e}", exc_info=True)
        sys.exit(1)

    class ThreadedWorkerServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
    server = ThreadedWorkerServer(('127.0.0.1', PORT), WorkerHandler)
    logger.info(f"Worker starting on http://localhost:{PORT} (SDK mode)")
    logger.info(f"Log file: {LOG_FILE}")
    if not DAEMONIZE:
        print(f"🔧 nanobot Worker (SDK) running at http://localhost:{PORT}")
        print(f"   Health: http://localhost:{PORT}/health")
        print(f"   Log: {LOG_FILE}")
        print(f"   Endpoints: POST /execute, POST /execute-stream (SSE), GET /tasks/<key>")
        print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        if not DAEMONIZE:
            print("\n👋 Worker stopped.")
        logger.info("Worker stopped by user")
        server.server_close()
        # Cleanup: close the runner
        if _runner:
            asyncio.run_coroutine_threadsafe(_runner.close(), _async_loop).result(timeout=5)
        if _async_loop:
            _async_loop.call_soon_threadsafe(_async_loop.stop)
