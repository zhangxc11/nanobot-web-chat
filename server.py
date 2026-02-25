#!/usr/bin/env python3
"""
nanobot Web Chat Server
A local web interface that proxies messages to nanobot CLI and shows session history.
Usage: python3 server.py [--port 8080]
"""

import http.server
import json
import subprocess
import sys
import os
import glob
import urllib.parse

PORT = 8080
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(SCRIPT_DIR, 'index.html')
SESSIONS_DIR = os.path.expanduser('~/.nanobot/workspace/sessions')


class ChatHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        if args:
            print(f"[{self.log_date_time_string()}] {args[0]}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path in ('/', '/index.html'):
            with open(HTML_FILE, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)

        elif path == '/sessions':
            sessions = []
            if os.path.isdir(SESSIONS_DIR):
                for f in sorted(glob.glob(os.path.join(SESSIONS_DIR, '*.jsonl'))):
                    name = os.path.basename(f).replace('.jsonl', '')
                    sessions.append(name)
            self._send_json({'sessions': sessions})

        elif path == '/history':
            session = params.get('session', [''])[0]
            if not session or '/' in session or '..' in session:
                self._send_json({'error': 'Invalid session'}, 400)
                return
            filepath = os.path.join(SESSIONS_DIR, session + '.jsonl')
            if not os.path.exists(filepath):
                self._send_json({'error': 'Session not found'}, 404)
                return
            messages = []
            with open(filepath, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if '_type' in obj:
                            continue  # skip metadata
                        role = obj.get('role', '')
                        if role in ('user', 'assistant', 'tool'):
                            messages.append({
                                'role': role,
                                'content': obj.get('content', ''),
                                'timestamp': obj.get('timestamp', '')
                            })
                    except json.JSONDecodeError:
                        continue
            self._send_json({'messages': messages})

        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/chat':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            message = data.get('message', '')

            try:
                result = subprocess.run(
                    ['nanobot', 'agent', '-m', message, '--no-markdown', '-s', 'cli:webchat'],
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                reply = result.stdout.strip()
                # Remove nanobot header line if present
                lines = reply.split('\n')
                if lines and '🐈' in lines[0]:
                    reply = '\n'.join(lines[1:]).strip()
                if not reply and result.stderr:
                    reply = f"(stderr) {result.stderr.strip()}"
                if not reply:
                    reply = "(无回复)"
            except subprocess.TimeoutExpired:
                reply = "⏱️ 请求超时，请稍后重试"
            except Exception as e:
                reply = f"❌ 错误: {str(e)}"

            self._send_json({'reply': reply})
        else:
            self.send_error(404)


if __name__ == '__main__':
    server = http.server.HTTPServer(('127.0.0.1', PORT), ChatHandler)
    print(f"🐈 nanobot Web Chat running at http://localhost:{PORT}")
    print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Bye!")
        server.server_close()
