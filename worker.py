#!/usr/bin/env python3
"""
nanobot Web Chat Worker — Minimal service for executing nanobot agent.

Supports two modes:
  POST /execute        — blocking JSON response (legacy)
  POST /execute-stream — SSE stream with real-time progress

Usage: python3 worker.py [--port 8082]
"""

import http.server
import json
import logging
import os
import subprocess
import sys

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


class WorkerHandler(http.server.BaseHTTPRequestHandler):
    """Handles nanobot agent execution requests."""

    def log_message(self, format, *args):
        if args:
            logger.info(args[0])

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

    # ── POST dispatcher ──

    def do_POST(self):
        path = self.path.rstrip('/')
        if path == '/execute':
            self._handle_execute()
        elif path == '/execute-stream':
            self._handle_execute_stream()
        else:
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

        # Send SSE headers
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()

        proc = None
        try:
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'

            proc = subprocess.Popen(
                ['nanobot', 'agent', '-m', message, '--no-markdown', '-s', session_key],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1,  # line-buffered
                start_new_session=True,
                env=env,
            )

            logger.debug(f"Spawned nanobot agent PID={proc.pid} for session={session_key}")

            # Read stdout line by line, send progress events
            progress_count = 0
            for line in proc.stdout:
                line = line.rstrip('\n')
                if not line:
                    continue

                # Progress lines: "  ↳ content"
                if line.lstrip().startswith('↳'):
                    content = line.lstrip()
                    if content.startswith('↳'):
                        content = content[1:].lstrip()  # remove ↳ prefix
                    self._send_sse('progress', {'text': content})
                    progress_count += 1
                # Skip nanobot header and final response lines
                # (we'll read the actual result from JSONL)

            proc.wait(timeout=300)

            if proc.returncode == 0:
                logger.info(f"Stream done: session={session_key}, progress_steps={progress_count}")
                self._send_sse('done', {'success': True})
            else:
                stderr_out = proc.stderr.read() if proc.stderr else ''
                logger.error(f"Stream failed: session={session_key}, code={proc.returncode}, stderr={stderr_out[:200]}")
                self._send_sse('error', {
                    'message': f'nanobot exited with code {proc.returncode}',
                    'stderr': stderr_out.strip()[-500:] if stderr_out else '',
                })

        except subprocess.TimeoutExpired:
            if proc:
                proc.kill()
            logger.error(f"Stream timeout: session={session_key}")
            self._send_sse('error', {'message': '⏱️ 请求超时，请稍后重试'})
        except BrokenPipeError:
            logger.warning(f"Client disconnected during stream: session={session_key}")
            # Client disconnected — kill the subprocess
            if proc:
                try:
                    proc.kill()
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Stream error: session={session_key}, error={e}")
            try:
                self._send_sse('error', {'message': f'❌ 错误: {str(e)}'})
            except BrokenPipeError:
                pass

    def _send_sse(self, event, data):
        """Send a single SSE event."""
        payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        self.wfile.write(payload.encode('utf-8'))
        self.wfile.flush()

    # ── GET ──

    def do_GET(self):
        if self.path.rstrip('/') == '/health':
            self._send_json({'status': 'ok', 'service': 'worker'})
            return
        self._send_json({'error': 'Not found'}, 404)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    server = http.server.HTTPServer(('127.0.0.1', PORT), WorkerHandler)
    logger.info(f"Worker starting on http://localhost:{PORT}")
    logger.info(f"Log file: {LOG_FILE}")
    print(f"🔧 nanobot Worker running at http://localhost:{PORT}")
    print(f"   Health: http://localhost:{PORT}/health")
    print(f"   Log: {LOG_FILE}")
    print(f"   Endpoints: POST /execute, POST /execute-stream (SSE)")
    print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Worker stopped.")
        logger.info("Worker stopped by user")
        server.server_close()
