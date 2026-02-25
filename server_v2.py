#!/usr/bin/env python3
"""
nanobot Web Chat Server V2
New backend API server for the React frontend.
Runs on port 8081 (separate from existing server.py on 8080).

Usage: python3 server_v2.py [--port 8081]
"""

import http.server
import json
import subprocess
import sys
import os
import glob
import re
import urllib.parse

PORT = 8081
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])

SESSIONS_DIR = os.path.expanduser('~/.nanobot/workspace/sessions')


class APIHandler(http.server.BaseHTTPRequestHandler):
    """REST API handler for nanobot Web Chat V2."""

    def log_message(self, format, *args):
        if args:
            print(f"[{self.log_date_time_string()}] {args[0]}")

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
        """Parse URL path and query params."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')
        params = urllib.parse.parse_qs(parsed.query)
        return path, params

    def _read_body(self):
        """Read and parse JSON request body."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        return json.loads(body) if body else {}

    # ── Route matching helpers ──

    def _match_route(self, path, pattern):
        """
        Match path against pattern with :param placeholders.
        Returns dict of params or None.
        E.g. _match_route('/api/sessions/abc/messages', '/api/sessions/:id/messages')
        → {'id': 'abc'}
        """
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
            self._send_json({'status': 'ok', 'version': 'v2'})
            return

        if path == '/api/sessions':
            self._handle_get_sessions(params)
            return

        route_params = self._match_route(path, '/api/sessions/:id/messages')
        if route_params:
            self._handle_get_messages(route_params['id'], params)
            return

        self._send_json({'error': 'Not found'}, 404)

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

    # ── API handlers (stubs for now, will be implemented in T2.2-T2.5) ──

    def _handle_get_sessions(self, params):
        """GET /api/sessions — list all sessions with summary and metadata."""
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

                    # Capture first user message for summary
                    if role == 'user' and not first_user_content:
                        content = obj.get('content', '')
                        # Strip [Runtime Context] block
                        content = re.split(r'\n\s*\[Runtime Context\]', content)[0].strip()
                        first_user_content = content[:80] if content else ''

            summary = first_user_content or session_id
            last_active = metadata.get('updated_at', '')
            if not last_active:
                # Fallback: file modification time
                mtime = os.path.getmtime(filepath)
                from datetime import datetime
                last_active = datetime.fromtimestamp(mtime).isoformat()

            sessions.append({
                'id': session_id,
                'summary': summary,
                'lastActiveAt': last_active,
                'messageCount': message_count,
            })

        # Sort by lastActiveAt descending
        sessions.sort(key=lambda s: s['lastActiveAt'], reverse=True)
        self._send_json({'sessions': sessions})

    def _handle_get_messages(self, session_id, params):
        """GET /api/sessions/:id/messages — paginated messages.

        Query params:
          - limit: max messages to return (default 30)
          - before: only return messages with timestamp < this value (for pagination)
        """
        # Validate session_id
        if '/' in session_id or '..' in session_id:
            self._send_json({'error': 'Invalid session id'}, 400)
            return

        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        if not os.path.exists(filepath):
            self._send_json({'error': 'Session not found'}, 404)
            return

        limit = int(params.get('limit', ['30'])[0])
        before = params.get('before', [''])[0]  # ISO timestamp string

        # Read all messages from file
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

                # Include tool_calls for assistant messages
                if obj.get('tool_calls'):
                    msg['toolCalls'] = []
                    for tc in obj['tool_calls']:
                        msg['toolCalls'].append({
                            'id': tc.get('id', ''),
                            'name': tc.get('function', {}).get('name', ''),
                            'arguments': tc.get('function', {}).get('arguments', ''),
                        })

                # Include tool call metadata for tool messages
                if role == 'tool':
                    msg['toolCallId'] = obj.get('tool_call_id', '')
                    msg['name'] = obj.get('name', '')

                # Strip [Runtime Context] from user messages for display
                if role == 'user':
                    content = msg['content']
                    msg['content'] = re.split(r'\n\s*\[Runtime Context\]', content)[0].strip()

                all_messages.append(msg)

        # Apply pagination: if 'before' is specified, filter messages before that timestamp
        if before:
            all_messages = [m for m in all_messages if m['timestamp'] < before]

        # Return the last `limit` messages (most recent)
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

        # Create an empty session file (nanobot will populate metadata on first message)
        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        os.makedirs(SESSIONS_DIR, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            meta = {
                '_type': 'metadata',
                'key': f'cli:{session_id}',
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

    def _handle_send_message(self, session_id):
        """POST /api/sessions/:id/messages — send message via nanobot CLI."""
        # Validate session_id
        if '/' in session_id or '..' in session_id:
            self._send_json({'error': 'Invalid session id'}, 400)
            return

        data = self._read_body()
        message = data.get('message', '').strip()
        if not message:
            self._send_json({'error': 'Empty message'}, 400)
            return

        try:
            # Call nanobot CLI with the session key
            result = subprocess.run(
                ['nanobot', 'agent', '-m', message, '--no-markdown', '-s', f'cli:{session_id}'],
                capture_output=True,
                text=True,
                timeout=120,
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
        except subprocess.TimeoutExpired:
            reply = '⏱️ 请求超时，请稍后重试'
        except Exception as e:
            reply = f'❌ 错误: {str(e)}'

        self._send_json({'reply': reply})


if __name__ == '__main__':
    server = http.server.HTTPServer(('127.0.0.1', PORT), APIHandler)
    print(f"🐈 nanobot Web Chat API V2 running at http://localhost:{PORT}")
    print(f"   Health check: http://localhost:{PORT}/api/health")
    print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Bye!")
        server.server_close()
