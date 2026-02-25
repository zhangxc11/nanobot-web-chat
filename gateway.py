#!/usr/bin/env python3
"""
nanobot Web Chat Gateway — API server + static file serving.

Handles all frontend requests. Chat messages are forwarded to the Worker
service (default: localhost:8082) for nanobot agent execution.

Usage: python3 gateway.py [--port 8081] [--worker-url http://127.0.0.1:8082]
"""

import http.server
import json
import sys
import os
import glob
import re
import urllib.parse
import urllib.request
import mimetypes

PORT = 8081
WORKER_URL = 'http://127.0.0.1:8082'

# Parse CLI args
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
    elif arg == '--worker-url' and i + 1 < len(sys.argv):
        WORKER_URL = sys.argv[i + 1]

SESSIONS_DIR = os.path.expanduser('~/.nanobot/workspace/sessions')
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(SCRIPT_DIR, 'frontend', 'dist')


class GatewayHandler(http.server.BaseHTTPRequestHandler):
    """REST API handler for nanobot Web Chat — Gateway."""

    def log_message(self, format, *args):
        if args:
            print(f"[gateway {self.log_date_time_string()}] {args[0]}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _parse_path(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')
        params = urllib.parse.parse_qs(parsed.query)
        return path, params

    def _read_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        return json.loads(body) if body else {}

    def _match_route(self, path, pattern):
        pattern_parts = pattern.split('/')
        path_parts = path.split('/')
        if len(pattern_parts) != len(path_parts):
            return None
        params = {}
        for pp, pathp in zip(pattern_parts, path_parts):
            if pp.startswith(':'):
                params[pp[1:]] = pathp
            elif pp != pathp:
                return None
        return params

    # ── GET routes ──

    def do_GET(self):
        path, params = self._parse_path()

        if path == '/api/health':
            self._send_json({'status': 'ok', 'version': 'v2', 'service': 'gateway'})
            return

        if path == '/api/sessions':
            self._handle_get_sessions(params)
            return

        route_params = self._match_route(path, '/api/sessions/:id/messages')
        if route_params:
            self._handle_get_messages(route_params['id'], params)
            return

        if path.startswith('/api/'):
            self._send_json({'error': 'Not found'}, 404)
            return

        self._serve_static(path)

    # ── POST routes ──

    def do_POST(self):
        path, params = self._parse_path()

        if path == '/api/sessions':
            self._handle_create_session()
            return

        route_params = self._match_route(path, '/api/sessions/:id/messages')
        if route_params:
            self._handle_send_message(route_params['id'])
            return

        self._send_json({'error': 'Not found'}, 404)

    # ── API handlers ──

    def _handle_get_sessions(self, params):
        """GET /api/sessions — list all sessions."""
        sessions = []
        if not os.path.isdir(SESSIONS_DIR):
            self._send_json({'sessions': sessions})
            return

        for filepath in glob.glob(os.path.join(SESSIONS_DIR, '*.jsonl')):
            session_id = os.path.basename(filepath).replace('.jsonl', '')
            metadata = {}
            first_user_content = ''
            message_count = 0

            with open(filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if obj.get('_type') == 'metadata':
                        metadata = obj
                        continue

                    role = obj.get('role', '')
                    if role in ('user', 'assistant', 'tool'):
                        message_count += 1

                    if role == 'user' and not first_user_content:
                        content = obj.get('content', '')
                        content = re.split(r'\n\s*\[Runtime Context\]', content)[0].strip()
                        first_user_content = content[:80] if content else ''

            summary = first_user_content or session_id
            last_active = metadata.get('updated_at', '')
            if not last_active:
                mtime = os.path.getmtime(filepath)
                from datetime import datetime
                last_active = datetime.fromtimestamp(mtime).isoformat()

            sessions.append({
                'id': session_id,
                'summary': summary,
                'lastActiveAt': last_active,
                'messageCount': message_count,
            })

        sessions.sort(key=lambda s: s['lastActiveAt'], reverse=True)
        self._send_json({'sessions': sessions})

    def _handle_get_messages(self, session_id, params):
        """GET /api/sessions/:id/messages — paginated messages."""
        if '/' in session_id or '..' in session_id:
            self._send_json({'error': 'Invalid session id'}, 400)
            return

        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        if not os.path.exists(filepath):
            self._send_json({'error': 'Session not found'}, 404)
            return

        limit = int(params.get('limit', ['30'])[0])
        before = params.get('before', [''])[0]

        all_messages = []
        with open(filepath, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if obj.get('_type') == 'metadata':
                    continue

                role = obj.get('role', '')
                if role not in ('user', 'assistant', 'tool'):
                    continue

                msg = {
                    'id': f'msg_{line_num}',
                    'role': role,
                    'content': obj.get('content', ''),
                    'timestamp': obj.get('timestamp', ''),
                }

                if obj.get('tool_calls'):
                    msg['toolCalls'] = []
                    for tc in obj['tool_calls']:
                        msg['toolCalls'].append({
                            'id': tc.get('id', ''),
                            'name': tc.get('function', {}).get('name', ''),
                            'arguments': tc.get('function', {}).get('arguments', ''),
                        })

                if role == 'tool':
                    msg['toolCallId'] = obj.get('tool_call_id', '')
                    msg['name'] = obj.get('name', '')

                if role == 'user':
                    content = msg['content']
                    msg['content'] = re.split(r'\n\s*\[Runtime Context\]', content)[0].strip()

                all_messages.append(msg)

        if before:
            all_messages = [m for m in all_messages if m['timestamp'] < before]

        has_more = len(all_messages) > limit
        messages = all_messages[-limit:] if has_more else all_messages

        self._send_json({
            'messages': messages,
            'hasMore': has_more,
        })

    def _handle_create_session(self):
        """POST /api/sessions — create new session."""
        from datetime import datetime
        timestamp = int(datetime.now().timestamp())
        session_id = f'webchat_{timestamp}'
        session_key = f'webchat:{timestamp}'

        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        os.makedirs(SESSIONS_DIR, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            meta = {
                '_type': 'metadata',
                'key': session_key,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'metadata': {},
                'last_consolidated': 0,
            }
            f.write(json.dumps(meta, ensure_ascii=False) + '\n')

        self._send_json({
            'id': session_id,
            'summary': '新对话',
            'lastActiveAt': datetime.now().isoformat(),
            'messageCount': 0,
        })

    def _get_session_key(self, session_id):
        """Read the session key from the JSONL metadata line."""
        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if obj.get('_type') == 'metadata' and 'key' in obj:
                            return obj['key']
                    except json.JSONDecodeError:
                        continue
        # Fallback: reconstruct key
        parts = session_id.split('_', 1)
        if len(parts) == 2:
            return f'{parts[0]}:{parts[1]}'
        return f'cli:{session_id}'

    def _handle_send_message(self, session_id):
        """POST /api/sessions/:id/messages — forward to Worker as SSE stream."""
        if '/' in session_id or '..' in session_id:
            self._send_json({'error': 'Invalid session id'}, 400)
            return

        data = self._read_body()
        message = data.get('message', '').strip()
        if not message:
            self._send_json({'error': 'Empty message'}, 400)
            return

        session_key = self._get_session_key(session_id)

        # Forward to worker's SSE streaming endpoint
        try:
            worker_data = json.dumps({
                'session_key': session_key,
                'message': message,
            }).encode('utf-8')

            req = urllib.request.Request(
                f'{WORKER_URL}/execute-stream',
                data=worker_data,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )

            # SSE response headers
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('X-Accel-Buffering', 'no')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

            # Stream worker's SSE response line by line
            with urllib.request.urlopen(req, timeout=330) as resp:
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    self.wfile.write(line)
                    # Flush after each blank line (SSE event boundary)
                    if line.strip() == b'':
                        self.wfile.flush()

        except urllib.error.URLError as e:
            # If headers not yet sent, send JSON error
            try:
                self._send_json({
                    'reply': f'❌ Worker 服务不可用: {str(e.reason)}'
                }, 502)
            except Exception:
                pass
        except BrokenPipeError:
            pass  # Client disconnected
        except Exception as e:
            try:
                self._send_json({
                    'reply': f'❌ 转发失败: {str(e)}'
                }, 500)
            except Exception:
                pass

    def _serve_static(self, path):
        """Serve static files from frontend/dist with SPA fallback."""
        if not os.path.isdir(STATIC_DIR):
            self._send_json({'error': 'Frontend not built. Run: cd frontend && npm run build'}, 500)
            return

        if path == '' or path == '/':
            file_path = os.path.join(STATIC_DIR, 'index.html')
        else:
            rel_path = path.lstrip('/')
            file_path = os.path.join(STATIC_DIR, rel_path)

        real_path = os.path.realpath(file_path)
        real_static = os.path.realpath(STATIC_DIR)
        if not real_path.startswith(real_static):
            self._send_json({'error': 'Forbidden'}, 403)
            return

        if not os.path.isfile(file_path):
            file_path = os.path.join(STATIC_DIR, 'index.html')

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            content_type, _ = mimetypes.guess_type(file_path)
            if content_type is None:
                content_type = 'application/octet-stream'

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            if '/assets/' in file_path:
                self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
            self.end_headers()
            self.wfile.write(content)
        except IOError:
            self._send_json({'error': 'File not found'}, 404)


if __name__ == '__main__':
    import socketserver
    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
    server = ThreadedHTTPServer(('127.0.0.1', PORT), GatewayHandler)
    print(f"🐈 nanobot Gateway running at http://localhost:{PORT}")
    print(f"   Worker: {WORKER_URL}")
    print(f"   Health: http://localhost:{PORT}/api/health")
    print(f"   Threaded: yes (concurrent requests supported)")
    print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Gateway stopped.")
        server.server_close()
