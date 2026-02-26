#!/usr/bin/env python3
"""
nanobot Web Chat Worker — Minimal service for executing nanobot agent.

Supports:
  POST /execute        — blocking JSON response (legacy)
  POST /execute-stream — SSE stream with real-time progress
  GET  /tasks/<key>    — query background task status

Key design: nanobot subprocess runs in a background thread, decoupled from
the HTTP connection. If the SSE stream breaks (e.g. gateway restart), the
subprocess continues running and results are persisted to JSONL.

Usage: python3 worker.py [--port 8082]
"""

import http.server
import json
import logging
import os
import subprocess
import sys
import threading
import time
from datetime import datetime


PORT = 8082
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])

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

# ── Task Registry ──
# Tracks running/completed nanobot tasks, keyed by session_key.
# Each entry: { status, pid, started_at, finished_at, progress, return_code, error }
_tasks = {}       # session_key -> task dict
_tasks_lock = threading.Lock()
TASK_TTL = 600    # Keep completed tasks for 10 minutes


def _cleanup_old_tasks():
    """Remove completed tasks older than TASK_TTL."""
    now = time.time()
    with _tasks_lock:
        expired = [k for k, v in _tasks.items()
                   if v['status'] in ('done', 'error')
                   and now - v.get('_finished_ts', 0) > TASK_TTL]
        for k in expired:
            del _tasks[k]


def _run_task_background(session_key, message):
    """Run nanobot agent in a background thread. Updates task registry."""
    task = {
        'status': 'running',
        'pid': None,
        'started_at': datetime.now().isoformat(),
        'finished_at': None,
        'progress': [],       # list of progress text lines
        'return_code': None,
        'error': None,
        '_finished_ts': 0,
        '_sse_clients': [],   # list of SSE write functions (can be empty)
        '_sse_lock': threading.Lock(),
        '_usage': None,       # usage data extracted from stderr
    }
    with _tasks_lock:
        _tasks[session_key] = task

    proc = None
    try:
        env = os.environ.copy()
        env['PYTHONUNBUFFERED'] = '1'

        proc = subprocess.Popen(
            ['nanobot', 'agent', '-m', message, '--no-markdown', '-s', session_key],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
            start_new_session=True,
            env=env,
        )
        task['pid'] = proc.pid
        logger.info(f"Task started: session={session_key}, PID={proc.pid}")

        # Read stderr in a separate thread to capture usage JSON
        def _read_stderr():
            for line in proc.stderr:
                line = line.rstrip('\n')
                if not line:
                    continue
                # Check for __usage__ JSON marker from nanobot agent loop
                try:
                    obj = json.loads(line)
                    if obj.get('__usage__'):
                        task['_usage'] = {
                            'session_key': session_key,
                            'model': obj.get('model', 'unknown'),
                            'prompt_tokens': obj.get('prompt_tokens', 0),
                            'completion_tokens': obj.get('completion_tokens', 0),
                            'total_tokens': obj.get('total_tokens', 0),
                            'llm_calls': obj.get('llm_calls', 0),
                            'started_at': obj.get('started_at', ''),
                            'finished_at': obj.get('finished_at', ''),
                        }
                        logger.info(f"Usage extracted from stderr: {obj.get('total_tokens', 0)} tokens")
                        continue
                except (json.JSONDecodeError, ValueError):
                    pass
                # Log other stderr lines for debugging
                logger.debug(f"stderr: {line[:200]}")

        stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
        stderr_thread.start()

        # Read stdout line by line
        for line in proc.stdout:
            line = line.rstrip('\n')
            if not line:
                continue

            # Progress lines: "  ↳ content"
            if line.lstrip().startswith('↳'):
                content = line.lstrip()
                if content.startswith('↳'):
                    content = content[1:].lstrip()
                task['progress'].append(content)

                # Notify SSE clients (best-effort, ignore errors)
                with task['_sse_lock']:
                    alive = []
                    for sse_fn in task['_sse_clients']:
                        try:
                            sse_fn('progress', {'text': content})
                            alive.append(sse_fn)
                        except Exception:
                            pass  # Client disconnected
                    task['_sse_clients'] = alive

        proc.wait(timeout=300)
        stderr_thread.join(timeout=5)  # Wait for stderr thread to finish

        if proc.returncode == 0:
            task['status'] = 'done'
            task['return_code'] = 0
            logger.info(f"Task done: session={session_key}, steps={len(task['progress'])}")
        else:
            task['status'] = 'error'
            task['return_code'] = proc.returncode
            task['error'] = f'exit code {proc.returncode}'
            logger.error(f"Task failed: session={session_key}, code={proc.returncode}")

    except subprocess.TimeoutExpired:
        if proc:
            proc.kill()
        task['status'] = 'error'
        task['error'] = 'Timeout (300s)'
        logger.error(f"Task timeout: session={session_key}")
    except Exception as e:
        task['status'] = 'error'
        task['error'] = str(e)
        logger.error(f"Task exception: session={session_key}, error={e}")
    finally:
        task['finished_at'] = datetime.now().isoformat()
        task['_finished_ts'] = time.time()

        # Get usage data extracted from stderr
        usage_data = task.get('_usage')
        if usage_data:
            task['usage'] = usage_data

        # Notify SSE clients of completion
        with task['_sse_lock']:
            for sse_fn in task['_sse_clients']:
                try:
                    if task['status'] == 'done':
                        done_payload = {'success': True}
                        if usage_data:
                            done_payload['usage'] = usage_data
                        sse_fn('done', done_payload)
                    else:
                        sse_fn('error', {'message': task.get('error', 'Unknown error')})
                except Exception:
                    pass
            task['_sse_clients'] = []

        _cleanup_old_tasks()


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
            # POST /tasks/<key>/kill
            session_key = path[7:-5]  # between "/tasks/" and "/kill"
            session_key = session_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_kill_task(session_key)
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_GET(self):
        path = self.path.rstrip('/')
        if path == '/health':
            self._send_json({'status': 'ok', 'service': 'worker'})
            return
        if path.startswith('/tasks/'):
            session_key = path[7:]  # after "/tasks/"
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
            result = subprocess.run(
                ['nanobot', 'agent', '-m', message, '--no-markdown', '-s', session_key],
                capture_output=True, text=True, timeout=300,
                start_new_session=True,
            )
            reply = result.stdout.strip()
            lines = reply.split('\n')
            if lines and '🐈' in lines[0]:
                reply = '\n'.join(lines[1:]).strip()
            if not reply and result.stderr:
                reply = f'(stderr) {result.stderr.strip()}'
            if not reply:
                reply = '(无回复)'
            logger.info(f"Execute done: session={session_key}, reply_len={len(reply)}")
            self._send_json({'reply': reply, 'success': True})
        except subprocess.TimeoutExpired:
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
                # Attach to existing task as SSE client
                self._attach_to_existing_task(existing)
                return

        # Start background task
        thread = threading.Thread(
            target=_run_task_background,
            args=(session_key, message),
            daemon=True,
        )
        thread.start()

        # Wait briefly for task to register
        time.sleep(0.1)

        # Attach as SSE client
        with _tasks_lock:
            task = _tasks.get(session_key)
        if task:
            self._attach_to_existing_task(task)
        else:
            # Task didn't start (shouldn't happen)
            self._send_json({'error': 'Failed to start task'}, 500)

    def _attach_to_existing_task(self, task):
        """Attach current HTTP connection as SSE client to an existing task."""
        # Send SSE headers
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
                self._send_sse('done', {'success': True})
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
        # We do this by polling — the background thread will call sse_writer
        # which will raise BrokenPipeError if client disconnected
        try:
            while task['status'] == 'running':
                time.sleep(0.5)
            # Task finished — the background thread already sent done/error via sse_writer
        except Exception:
            pass
        finally:
            disconnected.set()
            with task['_sse_lock']:
                if sse_writer in task['_sse_clients']:
                    task['_sse_clients'].remove(sse_writer)

    # ── Task kill ──

    def _handle_kill_task(self, session_key):
        """POST /tasks/<session_key>/kill — kill a running task."""
        with _tasks_lock:
            task = _tasks.get(session_key)

        if not task:
            self._send_json({'status': 'unknown', 'message': 'No task found'})
            return

        if task['status'] != 'running':
            self._send_json({'status': task['status'], 'message': 'Task not running'})
            return

        pid = task.get('pid')
        if pid:
            try:
                import signal
                os.killpg(os.getpgid(pid), signal.SIGTERM)
                logger.info(f"Killed task: session={session_key}, PID={pid}")
            except ProcessLookupError:
                logger.warning(f"Process already gone: PID={pid}")
            except Exception as e:
                logger.error(f"Failed to kill PID={pid}: {e}")
                try:
                    os.kill(pid, signal.SIGKILL)
                except Exception:
                    pass

        task['status'] = 'error'
        task['error'] = 'Killed by user'
        task['finished_at'] = datetime.now().isoformat()
        task['_finished_ts'] = time.time()

        # Notify SSE clients
        with task['_sse_lock']:
            for sse_fn in task['_sse_clients']:
                try:
                    sse_fn('error', {'message': 'Task killed by user'})
                except Exception:
                    pass
            task['_sse_clients'] = []

        self._send_json({'status': 'killed', 'message': 'Task killed'})

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
            'pid': task.get('pid'),
            'started_at': task.get('started_at'),
            'finished_at': task.get('finished_at'),
            'progress_count': len(task.get('progress', [])),
            'progress': list(task.get('progress', [])),  # full progress history
        }
        if task['status'] == 'error':
            result['error'] = task.get('error', '')
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
    import socketserver
    class ThreadedWorkerServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
    server = ThreadedWorkerServer(('127.0.0.1', PORT), WorkerHandler)
    logger.info(f"Worker starting on http://localhost:{PORT}")
    logger.info(f"Log file: {LOG_FILE}")
    print(f"🔧 nanobot Worker running at http://localhost:{PORT}")
    print(f"   Health: http://localhost:{PORT}/health")
    print(f"   Log: {LOG_FILE}")
    print(f"   Endpoints: POST /execute, POST /execute-stream (SSE), GET /tasks/<key>")
    print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Worker stopped.")
        logger.info("Worker stopped by user")
        server.server_close()
