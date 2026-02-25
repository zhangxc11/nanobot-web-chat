#!/usr/bin/env python3
"""
nanobot Web Chat Worker — Minimal service for executing nanobot agent.

This service is intentionally kept minimal (~50 lines of logic) so it
rarely needs modification, making self-modification safe.

Usage: python3 worker.py [--port 8082]
"""

import http.server
import json
import subprocess
import sys

PORT = 8082
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])


class WorkerHandler(http.server.BaseHTTPRequestHandler):
    """Handles POST /execute — runs nanobot agent and returns the reply."""

    def log_message(self, format, *args):
        if args:
            print(f"[worker {self.log_date_time_string()}] {args[0]}")

    def do_POST(self):
        if self.path.rstrip('/') != '/execute':
            self._send_json({'error': 'Not found'}, 404)
            return

        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_json({'error': 'Invalid JSON'}, 400)
            return

        session_key = data.get('session_key', '').strip()
        message = data.get('message', '').strip()

        if not session_key or not message:
            self._send_json({'error': 'Missing session_key or message'}, 400)
            return

        # Execute nanobot agent
        try:
            result = subprocess.run(
                ['nanobot', 'agent', '-m', message, '--no-markdown', '-s', session_key],
                capture_output=True,
                text=True,
                timeout=300,
                start_new_session=True,
            )
            reply = result.stdout.strip()
            # Remove nanobot header line if present (e.g., "🐈 nanobot ...")
            lines = reply.split('\n')
            if lines and '🐈' in lines[0]:
                reply = '\n'.join(lines[1:]).strip()
            if not reply and result.stderr:
                reply = f'(stderr) {result.stderr.strip()}'
            if not reply:
                reply = '(无回复)'
            self._send_json({'reply': reply, 'success': True})
        except subprocess.TimeoutExpired:
            self._send_json({'reply': '⏱️ 请求超时，请稍后重试', 'success': False}, 504)
        except Exception as e:
            self._send_json({'reply': f'❌ 错误: {str(e)}', 'success': False}, 500)

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
    print(f"🔧 nanobot Worker running at http://localhost:{PORT}")
    print(f"   Health: http://localhost:{PORT}/health")
    print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Worker stopped.")
        server.server_close()
