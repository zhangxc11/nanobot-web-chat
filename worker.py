#!/usr/bin/env python3
"""
nanobot Web Chat Worker v3 — Concurrent SDK-based agent execution.

Each task gets its own AgentRunner instance for full concurrency safety.
Multiple sessions can execute tasks simultaneously.

Supports:
  POST /execute        — blocking JSON response (legacy)
  POST /execute-stream — SSE stream with real-time progress
  GET  /tasks/<key>    — query background task status
  POST /tasks/<key>/kill — cancel a running task
  POST /tasks/<key>/inject — inject user message into running task

Usage: python3 worker.py [--port 8082] [--daemonize]
"""

import asyncio
import http.server
import json
import logging
import os
import queue
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

LOG_DIR = os.path.join(os.path.expanduser('~'), '.nanobot', 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, 'worker.log')

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


# ── ProviderPool singleton — runtime-switchable provider state ──
# The pool holds all configured providers and tracks the active one.
# Each task reads the pool's active state at creation time.

_provider_pool = None  # ProviderPool instance
_pool_lock = threading.Lock()


def _build_pool():
    """Build a ProviderPool from nanobot config (called once at startup)."""
    from nanobot.config.loader import load_config
    from nanobot.cli.commands import _make_provider
    config = load_config()
    pool = _make_provider(config)
    logger.info(f"ProviderPool built: active={pool.active_provider}/{pool.active_model}, "
                f"available={[p['name'] for p in pool.available]}")
    return pool


def _get_pool():
    """Get or create the module-level ProviderPool singleton."""
    global _provider_pool
    if _provider_pool is None:
        with _pool_lock:
            if _provider_pool is None:
                _provider_pool = _build_pool()
    return _provider_pool


def _has_running_tasks() -> bool:
    """Check if any tasks are currently running."""
    with _tasks_lock:
        return any(t['status'] == 'running' for t in _tasks.values())


# ── Subagent Task Keeper ──
# Module-level set that holds strong references to subagent asyncio.Tasks.
# Without this, when a web worker request's AgentLoop/SubagentManager is GC'd
# after process_direct() returns, the subagent tasks lose their only strong
# reference and get cancelled by the GC.
_subagent_tasks: set[asyncio.Task] = set()


def _keep_subagent_task(task: asyncio.Task) -> None:
    """Register a subagent task in the module-level set to prevent GC."""
    _subagent_tasks.add(task)

    def _remove(t: asyncio.Task) -> None:
        _subagent_tasks.discard(t)

    task.add_done_callback(_remove)
    logger.debug(f"Subagent task registered in keeper (total: {len(_subagent_tasks)})")


# ── WorkerSessionMessenger — Phase 30 inter-session messaging ──


class WorkerSessionMessenger:
    """SessionMessenger for web-chat worker — inject into running tasks or trigger new ones.

    Implements the SessionMessenger protocol for the web-chat worker context.
    When a subagent completes, it uses this messenger to deliver results back
    to the parent session — either by injecting into a running task or by
    triggering a new task execution.
    """

    async def send_to_session(self, target_session_key, content, source_session_key=None):
        if source_session_key:
            prefixed = f"[Message from session {source_session_key}]\n{content}"
        else:
            prefixed = content

        with _tasks_lock:
            task = _tasks.get(target_session_key)

        if task and task['status'] == 'running':
            # Running → inject into the task's inject queue as system role dict
            task['_inject_queue'].put({"role": "user", "content": prefixed})
            logger.info(f"SessionMessenger: injected into running task {target_session_key}")
            return True

        # Idle → trigger new task execution with session_messenger channel
        _run_task_sdk(target_session_key, prefixed, channel='session_messenger')
        logger.info(f"SessionMessenger: triggered new task for {target_session_key}")
        return True


# ── §47: WorkerSubagentCallback — subagent lifecycle tracking ──


class WorkerSubagentCallback:
    """Implements SubagentEventCallback protocol for web-chat worker.

    Maintains a _registry dict mapping task_id → status info, queryable
    via HTTP API endpoints for frontend consumption.
    """

    def __init__(self):
        self._registry: dict[str, dict] = {}  # task_id -> status info
        self._lock = threading.Lock()

    def on_subagent_spawned(self, meta) -> None:
        with self._lock:
            self._registry[meta.task_id] = {
                "task_id": meta.task_id,
                "label": meta.label,
                "status": "queued" if meta.status == "queued" else "running",
                "session_key": meta.subagent_session_key,
                "parent_session_key": meta.parent_session_key,
                "iteration": 0,
                "max_iterations": meta.max_iterations,
                "last_tool": None,
                "created_at": meta.created_at,
                "error": None,
            }

    def on_subagent_progress(self, task_id: str, iteration: int, max_iterations: int, last_tool: str | None) -> None:
        with self._lock:
            if task_id in self._registry:
                self._registry[task_id].update({
                    "status": "running",
                    "iteration": iteration,
                    "max_iterations": max_iterations,
                    "last_tool": last_tool,
                })

    def on_subagent_retry(self, task_id: str, attempt: int, max_retries: int, delay: float, error: str, is_fast: bool) -> None:
        with self._lock:
            if task_id in self._registry:
                self._registry[task_id].update({
                    "status": "retrying",
                    "retry_info": {
                        "attempt": attempt,
                        "max_retries": max_retries,
                        "delay": delay,
                        "error": error,
                        "is_fast": is_fast,
                    },
                })

    def on_subagent_done(self, task_id: str, status: str, error: str | None) -> None:
        with self._lock:
            if task_id in self._registry:
                self._registry[task_id].update({
                    "status": status,  # "completed" / "failed" / "stopped" / "max_iterations"
                    "error": error,
                    "finished_at": datetime.now().isoformat(),
                })

    def get_subagents_for_parent(self, parent_session_key: str) -> list[dict]:
        """Return all subagent statuses for a given parent session."""
        with self._lock:
            return [
                dict(info) for info in self._registry.values()
                if info.get("parent_session_key") == parent_session_key
            ]

    def get_all_running_session_keys(self) -> list[str]:
        """Return session keys of all currently running (non-terminal) sessions.

        Includes both regular tasks from _tasks registry and subagent tasks.
        """
        running_keys: list[str] = []
        # 1. Regular tasks from _tasks registry
        with _tasks_lock:
            for key, task in _tasks.items():
                if task['status'] == 'running':
                    running_keys.append(key)
        # 2. Subagent tasks from our registry
        with self._lock:
            for info in self._registry.values():
                if info["status"] in ("running", "queued", "retrying"):
                    sk = info.get("session_key")
                    if sk and sk not in running_keys:
                        running_keys.append(sk)
        return running_keys


# Module-level singleton
_subagent_callback = WorkerSubagentCallback()


# ── §40: SubagentManager singleton ──
# Shared across all AgentLoop instances within this worker process.
# Ensures subagent metadata (_task_meta, _session_tasks) persists across
# HTTP requests, enabling cross-turn follow_up/status/stop/list.

_subagent_manager = None   # SubagentManager instance
_subagent_manager_lock = threading.Lock()


def _get_subagent_manager():
    """Get or create the module-level SubagentManager singleton."""
    global _subagent_manager
    if _subagent_manager is not None:
        return _subagent_manager
    with _subagent_manager_lock:
        if _subagent_manager is not None:
            return _subagent_manager

        from nanobot.config.loader import load_config
        from nanobot.agent.subagent import SubagentManager
        from nanobot.session.manager import SessionManager
        from nanobot.bus.queue import MessageBus
        from nanobot.usage.recorder import UsageRecorder

        pool = _get_pool()
        config = load_config()

        _subagent_manager = SubagentManager(
            provider=pool,
            workspace=config.workspace_path,
            bus=MessageBus(),
            model=pool.active_model,
            temperature=config.agents.defaults.temperature,
            max_tokens=config.agents.defaults.max_tokens,
            exec_config=config.tools.exec,
            restrict_to_workspace=config.tools.restrict_to_workspace,
            usage_recorder=UsageRecorder(),  # §40 fix: subagent usage needs its own recorder
            session_manager=SessionManager(config.workspace_path),
            task_keeper=_keep_subagent_task,
            session_messenger=WorkerSessionMessenger(),
            event_callback=_subagent_callback,  # §47: lifecycle tracking
        )
        logger.info("SubagentManager singleton created")
        return _subagent_manager


# ── AgentRunner factory — one runner per task for concurrency safety ──
# Each concurrent task gets its own AgentRunner with independent tool context,
# so that _set_tool_context() in one task doesn't clobber another.


def _create_runner():
    """Create a fresh AgentRunner instance for a task.
    
    Reads the ProviderPool's current active provider/model state
    and builds a runner configured for that provider.
    Each task gets its own runner for concurrency safety.
    """
    from nanobot.sdk import AgentRunner
    from nanobot.config.loader import load_config, get_data_dir
    from nanobot.bus.queue import MessageBus
    from nanobot.agent.loop import AgentLoop
    from nanobot.session.manager import SessionManager
    from nanobot.cron.service import CronService
    from nanobot.usage.recorder import UsageRecorder
    from nanobot.usage.detail_logger import LLMDetailLogger
    from nanobot.audit.logger import AuditLogger
    from nanobot.providers.pool import ProviderPool

    pool = _get_pool()
    config = load_config()
    data_dir = get_data_dir()

    # Create a snapshot of the pool for this task:
    # The runner gets the full pool (so /provider command works within the task),
    # but the active state is read at task creation time.
    provider = pool

    bus = MessageBus()
    session_manager = SessionManager(config.workspace_path)
    cron = CronService(data_dir / "cron")
    usage_recorder = UsageRecorder()
    detail_logger = LLMDetailLogger()
    audit_logger = AuditLogger()

    messenger = WorkerSessionMessenger()

    agent_loop = AgentLoop(
        bus=bus,
        provider=provider,
        workspace=config.workspace_path,
        model=pool.active_model,
        temperature=config.agents.defaults.temperature,
        max_tokens=config.agents.defaults.max_tokens,
        max_iterations=config.agents.defaults.max_tool_iterations,
        memory_window=config.agents.defaults.memory_window,
        brave_api_key=config.tools.web.search.api_key or None,
        exec_config=config.tools.exec,
        cron_service=cron,
        restrict_to_workspace=config.tools.restrict_to_workspace,
        session_manager=session_manager,
        mcp_servers=config.tools.mcp_servers,
        channels_config=config.channels,
        usage_recorder=usage_recorder,
        detail_logger=detail_logger,
        audit_logger=audit_logger,
        subagent_task_keeper=_keep_subagent_task,
        session_messenger=messenger,
        subagent_manager=_get_subagent_manager(),  # §40: shared singleton
    )

    runner = AgentRunner(agent_loop)
    logger.info(f"AgentRunner created for task (provider={pool.active_provider}, model={pool.active_model})")
    return runner


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


def _run_task_sdk(session_key: str, message: str, images: list[str] | None = None, channel: str = 'web'):
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
        '_inject_queue': queue.Queue(),  # Thread-safe queue for user injection
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
            content = message.get('content', '')

            # Detect subagent / system inject messages by content prefix,
            # regardless of role (supports both old system role and new user role).
            if isinstance(content, str) and content.startswith('[Message from session'):
                import re as _re
                _m = _re.match(r'^\[Message from session (.+?)\]\n(.*)', content, _re.DOTALL)
                if _m:
                    source, body = _m.group(1), _m.group(2)
                else:
                    source, body = 'system', content
                progress_text = f"🤖 {source}: {body[:80]}"
                task['progress'].append(progress_text)
                _notify_sse(task, 'progress', {
                    'text': progress_text,
                    'type': 'system_inject',
                    'content': content,
                })
                return

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

            elif role == 'system':
                # Legacy system messages that don't match the prefix pattern
                # (should be rare after the prefix check above)
                progress_text = f"🤖 system: {content[:80]}"
                task['progress'].append(progress_text)
                _notify_sse(task, 'progress', {
                    'text': progress_text,
                    'type': 'system_inject',
                    'content': content,
                })

            elif role == 'user':
                # Injected user message — show in progress
                content = message.get('content', '')
                # Parse source from prefix (e.g. "[Message from user during execution]\n...")
                import re as _re
                _m = _re.match(r'^\[Message from (.+?)(?:\s+during execution)?\]\n(.*)', content, _re.DOTALL)
                if _m:
                    source, display = _m.group(1), _m.group(2)
                else:
                    source, display = 'user', content
                progress_text = f"📝 {source}: {display[:80]}"
                task['progress'].append(progress_text)
                _notify_sse(task, 'progress', {
                    'text': progress_text,
                    'type': 'user_inject',
                })

        async def check_user_input(self) -> str | dict | None:
            """Non-blocking check for pending user injection messages."""
            try:
                return task['_inject_queue'].get_nowait()
            except queue.Empty:
                return None

        async def on_usage(self, usage: dict) -> None:
            task['_usage'] = {
                'session_key': session_key,
                'model': usage.get('model', 'unknown'),
                'prompt_tokens': usage.get('prompt_tokens', 0),
                'completion_tokens': usage.get('completion_tokens', 0),
                'total_tokens': usage.get('total_tokens', 0),
                'llm_calls': usage.get('llm_calls', 0),
                'cache_creation_input_tokens': usage.get('cache_creation_input_tokens', 0),
                'cache_read_input_tokens': usage.get('cache_read_input_tokens', 0),
                'started_at': usage.get('started_at', ''),
                'finished_at': usage.get('finished_at', ''),
            }
            logger.info(f"Usage: {usage.get('total_tokens', 0)} tokens, "
                        f"{usage.get('llm_calls', 0)} calls, "
                        f"cache_create={usage.get('cache_creation_input_tokens', 0)}, "
                        f"cache_read={usage.get('cache_read_input_tokens', 0)}")

        async def on_done(self, result: AgentResult) -> None:
            pass  # Handled in the wrapper below

        async def on_error(self, error: Exception) -> None:
            pass  # Handled in the wrapper below

    async def _execute():
        runner = _create_runner()
        try:
            result = await runner.run(
                message=message,
                session_key=session_key,
                channel=channel,
                chat_id=session_key.split(':', 1)[-1] if ':' in session_key else session_key,
                media=images,
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
            # Guard: if kill already marked the task, don't overwrite
            if task['_finished_ts'] == 0:
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
            elif task['status'] == 'error':
                _notify_sse(task, 'error', {'message': task.get('error', 'Unknown error')})

            # Clear SSE clients
            with task['_sse_lock']:
                task['_sse_clients'] = []

            # Close runner to release MCP connections
            try:
                await runner.close()
            except Exception:
                pass

            _cleanup_old_tasks()

    # Schedule on the async event loop
    future = asyncio.run_coroutine_threadsafe(_execute(), _async_loop)
    # Store the asyncio task for cancellation (via the future)
    task['_future'] = future


def _notify_sse(task, event: str, data: dict):
    """Notify all SSE clients of an event (thread-safe)."""
    with task['_sse_lock']:
        client_count = len(task['_sse_clients'])
        if event in ('done', 'error'):
            logger.debug(f"_notify_sse: sending '{event}' to {client_count} SSE client(s)")
        alive = []
        for i, sse_fn in enumerate(task['_sse_clients']):
            try:
                sse_fn(event, data)
                alive.append(sse_fn)
                if event in ('done', 'error'):
                    logger.debug(f"_notify_sse: client {i} accepted '{event}'")
            except Exception as e:
                if event in ('done', 'error'):
                    logger.warning(f"_notify_sse: client {i} failed for '{event}': {e}")
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
        elif path == '/provider/reload':
            self._handle_reload_provider()
        elif path.startswith('/tasks/') and path.endswith('/kill'):
            session_key = path[7:-5]
            session_key = session_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_kill_task(session_key)
        elif path.startswith('/tasks/') and path.endswith('/inject'):
            session_key = path[7:-7]
            session_key = session_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_inject(session_key)
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_PUT(self):
        path = self.path.rstrip('/')
        if path == '/provider':
            self._handle_set_provider()
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_GET(self):
        path = self.path.rstrip('/')
        if path == '/health':
            # Count running tasks
            with _tasks_lock:
                running_count = sum(1 for t in _tasks.values() if t['status'] == 'running')
            pool = _get_pool()
            self._send_json({
                'status': 'ok',
                'service': 'worker',
                'mode': 'sdk-concurrent',
                'running_tasks': running_count,
                'active_provider': pool.active_provider,
                'active_model': pool.active_model,
            })
            return
        if path == '/provider':
            self._handle_get_provider()
            return
        if path.startswith('/tasks/'):
            session_key = path[7:]
            session_key = session_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_get_task(session_key)
            return
        # §47: Subagent status endpoints
        if path == '/sessions/running':
            self._handle_get_running_sessions()
            return
        if path.startswith('/subagents/'):
            parent_key = path[11:]  # len('/subagents/') == 11
            parent_key = parent_key.replace('%3A', ':').replace('%3a', ':')
            self._handle_get_subagents(parent_key)
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
            runner = _create_runner()
            async def _blocking_run():
                try:
                    return await runner.run(
                        message=message,
                        session_key=session_key,
                        channel='web',
                        chat_id=session_key.split(':', 1)[-1] if ':' in session_key else session_key,
                    )
                finally:
                    await runner.close()
            future = asyncio.run_coroutine_threadsafe(_blocking_run(), _async_loop)
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
        images = data.get('images') or None  # list of file paths or None

        logger.info(f"Stream: session={session_key}, message={message[:80]}..., images={len(images) if images else 0}")

        # Check if there's already a running task for this session
        # NOTE: Do NOT call _attach_to_existing_task inside the lock!
        # It blocks in a while-loop, which would deadlock all other requests.
        existing = None
        with _tasks_lock:
            t = _tasks.get(session_key)
            if t and t['status'] == 'running':
                existing = t

        if existing:
            logger.warning(f"Task already running for session={session_key}, attaching SSE")
            self._attach_to_existing_task(existing)
            return

        # Start SDK task
        _run_task_sdk(session_key, message, images=images)

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
        done_sent = threading.Event()  # Track if done/error event was sent

        def sse_writer(event, data):
            if disconnected.is_set():
                raise BrokenPipeError("Client disconnected")
            payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            self.wfile.write(payload.encode('utf-8'))
            self.wfile.flush()
            if event in ('done', 'error'):
                done_sent.set()

        with task['_sse_lock']:
            task['_sse_clients'].append(sse_writer)

        # Block until task finishes or client disconnects.
        # Send SSE keepalive comments every ~15s to prevent upstream
        # proxy/socket read timeouts (webserver urllib timeout=330s).
        KEEPALIVE_INTERVAL = 15  # seconds
        try:
            last_keepalive = time.time()
            while task['status'] == 'running':
                time.sleep(0.5)
                now = time.time()
                if now - last_keepalive >= KEEPALIVE_INTERVAL:
                    last_keepalive = now
                    try:
                        self.wfile.write(b': keepalive\n\n')
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        break  # Client disconnected

            logger.debug(f"SSE wait loop exited: task status={task['status']}, waiting for done_sent...")

            # Task finished — wait for _notify_sse to send done/error event
            # via sse_writer callback (runs in asyncio thread's finally block).
            # The race: task['status'] changes BEFORE _notify_sse is called,
            # so our while-loop exits before the done event is sent.
            # Wait up to 2s for the done event to arrive.
            done_sent.wait(timeout=2.0)

            logger.debug(f"done_sent.wait returned: is_set={done_sent.is_set()}")

            # Safety net: send done/error ourselves if _notify_sse didn't
            # (e.g. due to timing or sse_writer already removed).
            if not done_sent.is_set():
                logger.debug("Safety net: sending done/error ourselves")
                try:
                    with task['_sse_lock']:
                        if task['status'] == 'done':
                            done_payload = {'success': True}
                            if task.get('usage'):
                                done_payload['usage'] = task['usage']
                            sse_writer('done', done_payload)
                        elif task['status'] == 'error':
                            sse_writer('error', {'message': task.get('error', 'Unknown error')})
                    logger.debug(f"Safety net: done_sent is now {done_sent.is_set()}")
                except (BrokenPipeError, ConnectionResetError, OSError) as e:
                    logger.debug(f"Safety net: write failed: {e}")

        except Exception as e:
            logger.warning(f"_attach_to_existing_task: unexpected exception: {e}")
        finally:
            logger.debug(f"_attach_to_existing_task: cleaning up, done_sent={done_sent.is_set()}")
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

        # Immediately mark task as cancelled so that SSE waiters and
        # new requests don't keep treating it as "running".
        task['status'] = 'error'
        task['error'] = 'Cancelled by user'
        task['finished_at'] = datetime.now().isoformat()
        task['_finished_ts'] = time.time()
        _notify_sse(task, 'error', {'message': 'Cancelled by user'})

        self._send_json({'status': 'cancelled', 'message': 'Task cancellation requested'})

    # ── User message injection ──

    def _handle_inject(self, session_key):
        """POST /tasks/<session_key>/inject — inject user message into running task."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_json({'error': 'Invalid JSON'}, 400)
            return

        message = data.get('message', '').strip()
        if not message:
            self._send_json({'error': 'Empty message'}, 400)
            return

        with _tasks_lock:
            task = _tasks.get(session_key)

        if not task:
            self._send_json({'status': 'unknown', 'message': 'No task found'}, 404)
            return

        if task['status'] != 'running':
            self._send_json({'status': task['status'], 'message': 'Task not running'}, 409)
            return

        # Put message into the inject queue — will be picked up by check_user_input()
        task['_inject_queue'].put(f"[Message from user during execution]\n{message}")
        logger.info(f"Injected message into task: session={session_key}, message={message[:80]}...")

        self._send_json({'status': 'injected', 'message': 'Message queued for injection'})

    # ── Provider management ──

    def _handle_get_provider(self):
        """GET /provider — query current active provider and available list."""
        pool = _get_pool()
        self._send_json({
            'active': {
                'name': pool.active_provider,
                'model': pool.active_model,
            },
            'available': pool.available,
        })

    def _handle_set_provider(self):
        """PUT /provider — switch active provider. Rejected if tasks are running."""
        # Check for running tasks
        if _has_running_tasks():
            self._send_json({
                'error': 'Task running, cannot switch provider',
            }, 409)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_json({'error': 'Invalid JSON'}, 400)
            return

        provider_name = data.get('provider', '').strip()
        model = data.get('model', '').strip() or None

        if not provider_name:
            self._send_json({'error': 'Missing provider name'}, 400)
            return

        pool = _get_pool()
        try:
            pool.switch(provider_name, model)
            logger.info(f"Provider switched: {pool.active_provider}/{pool.active_model}")
            self._send_json({
                'active': {
                    'name': pool.active_provider,
                    'model': pool.active_model,
                },
            })
        except ValueError as e:
            self._send_json({'error': str(e)}, 400)

    def _handle_reload_provider(self):
        """POST /provider/reload — rebuild ProviderPool from config.
        
        Reloads config.json and rebuilds the ProviderPool singleton.
        Tries to preserve the current active provider if still available.
        Rejected if tasks are running (409).
        """
        global _provider_pool

        if _has_running_tasks():
            self._send_json({
                'error': 'Tasks running, cannot reload provider pool',
            }, 409)
            return

        with _pool_lock:
            old_active = _provider_pool.active_provider if _provider_pool else None
            old_model = _provider_pool.active_model if _provider_pool else None
            try:
                new_pool = _build_pool()
                # Try to preserve active provider
                available_names = [p['name'] for p in new_pool.available]
                if old_active and old_active in available_names:
                    try:
                        new_pool.switch(old_active, old_model)
                        logger.info(f"Provider pool reloaded, preserved active: {old_active}/{old_model}")
                    except ValueError:
                        # old_model might not be valid, use provider's default
                        new_pool.switch(old_active)
                        logger.info(f"Provider pool reloaded, preserved provider: {old_active}, model reset to default")
                else:
                    logger.info(f"Provider pool reloaded, active changed: {old_active} → {new_pool.active_provider}")
                _provider_pool = new_pool
            except Exception as e:
                logger.error(f"Failed to reload provider pool: {e}")
                self._send_json({'error': f'Reload failed: {e}'}, 500)
                return

        pool = _provider_pool
        self._send_json({
            'status': 'reloaded',
            'active': {
                'name': pool.active_provider,
                'model': pool.active_model,
            },
            'available': pool.available,
        })

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

    # ── §47: Subagent status endpoints ──

    def _handle_get_running_sessions(self):
        """GET /sessions/running — return currently running session keys."""
        running_keys = _subagent_callback.get_all_running_session_keys()
        self._send_json({'running': running_keys})

    def _handle_get_subagents(self, parent_session_key):
        """GET /subagents/<parent_session_key> — return subagent statuses."""
        subagents = _subagent_callback.get_subagents_for_parent(parent_session_key)
        self._send_json({'subagents': subagents})

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
        stderr_log = LOG_FILE.replace('.log', '-stderr.log')
        sys.stderr = open(stderr_log, 'a')
        devnull_fd = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull_fd, 0)
        os.dup2(devnull_fd, 1)
        os.close(devnull_fd)
        stderr_fd = os.open(stderr_log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        os.dup2(stderr_fd, 2)
        os.close(stderr_fd)

    # Start async event loop
    _start_async_loop()
    logger.info("Async event loop started")

    # Verify config is loadable (fail fast on misconfiguration)
    try:
        pool = _get_pool()
        logger.info(f"Config verified: ProviderPool active={pool.active_provider}/{pool.active_model}")
    except Exception as e:
        logger.error(f"Failed to build ProviderPool: {e}", exc_info=True)
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
        if _async_loop:
            _async_loop.call_soon_threadsafe(_async_loop.stop)
