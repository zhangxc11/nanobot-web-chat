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
        """GET /api/sessions — list all sessions."""
        # TODO: T2.2 - implement real session listing
        self._send_json({'sessions': [], '_todo': 'T2.2'})

    def _handle_get_messages(self, session_id, params):
        """GET /api/sessions/:id/messages — paginated messages."""
        # TODO: T2.3 - implement real message loading
        self._send_json({
            'messages': [],
            'hasMore': False,
            '_todo': 'T2.3',
            '_session_id': session_id
        })

    def _handle_create_session(self):
        """POST /api/sessions — create new session."""
        # TODO: T2.5 - implement session creation
        self._send_json({'error': 'Not implemented'}, 501)

    def _handle_send_message(self, session_id):
        """POST /api/sessions/:id/messages — send message."""
        # TODO: T2.4 - implement message sending
        self._send_json({'error': 'Not implemented'}, 501)


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
