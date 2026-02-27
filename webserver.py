#!/usr/bin/env python3
"""
nanobot Web Chat Server — API server + static file serving.

Handles all frontend requests. Chat messages are forwarded to the Worker
service (default: localhost:8082) for nanobot agent execution.

Usage: python3 webserver.py [--port 8081] [--worker-url http://127.0.0.1:8082]
"""

import http.server
import json
import logging
import sys
import os
import glob
import re
import threading
import time
import urllib.parse
import urllib.request
import mimetypes

PORT = 8081
WORKER_URL = 'http://127.0.0.1:8082'
DAEMONIZE = False

# Parse CLI args
for i, arg in enumerate(sys.argv):
    if arg == '--port' and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
    elif arg == '--worker-url' and i + 1 < len(sys.argv):
        WORKER_URL = sys.argv[i + 1]
    elif arg == '--daemonize':
        DAEMONIZE = True

SESSIONS_DIR = os.path.expanduser('~/.nanobot/workspace/sessions')
MEMORY_DIR = os.path.expanduser('~/.nanobot/workspace/memory')
CONFIG_FILE = os.path.expanduser('~/.nanobot/config.json')
USER_SKILLS_DIR = os.path.expanduser('~/.nanobot/workspace/skills')
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(SCRIPT_DIR, 'frontend', 'dist')
LOG_FILE = '/tmp/nanobot-webserver.log'

# Analytics DB (SQLite)
from analytics import AnalyticsDB
analytics_db = AnalyticsDB()  # ~/.nanobot/workspace/analytics.db

# Find builtin skills directory
BUILTIN_SKILLS_DIR = None
try:
    import importlib.util
    spec = importlib.util.find_spec('nanobot')
    if spec and spec.origin:
        BUILTIN_SKILLS_DIR = os.path.join(os.path.dirname(spec.origin), 'skills')
        if not os.path.isdir(BUILTIN_SKILLS_DIR):
            BUILTIN_SKILLS_DIR = None
except Exception:
    pass

# ── Logging setup ──
logger = logging.getLogger('webserver')
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


class WebServerHandler(http.server.BaseHTTPRequestHandler):
    """REST API handler for nanobot Web Chat Server."""

    def log_message(self, format, *args):
        # Redirect http.server default logging to our logger
        if args:
            logger.info(args[0])

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _parse_path(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path).rstrip('/')
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
            self._send_json({'status': 'ok', 'version': 'v2', 'service': 'webserver'})
            return

        if path == '/api/sessions':
            self._handle_get_sessions(params)
            return

        if path == '/api/sessions/search':
            self._handle_search_sessions(params)
            return

        if path == '/api/config':
            self._handle_get_config()
            return

        if path == '/api/memory/files':
            self._handle_get_memory_files()
            return

        if path.startswith('/api/memory/files/'):
            filename = path[len('/api/memory/files/'):]
            self._handle_get_memory_file(filename)
            return

        if path == '/api/skills':
            self._handle_get_skills()
            return

        if path == '/api/usage':
            self._handle_get_usage(params)
            return

        if path == '/api/usage/daily':
            self._handle_get_daily_usage(params)
            return

        if path.startswith('/api/skills/'):
            self._handle_skill_routes(path)
            return

        route_params = self._match_route(path, '/api/sessions/:id/messages')
        if route_params:
            self._handle_get_messages(route_params['id'], params)
            return

        route_params = self._match_route(path, '/api/sessions/:id/task-status')
        if route_params:
            self._handle_get_task_status(route_params['id'])
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

        route_params = self._match_route(path, '/api/sessions/:id/task-kill')
        if route_params:
            self._handle_kill_task(route_params['id'])
            return

        route_params = self._match_route(path, '/api/sessions/:id/task-inject')
        if route_params:
            self._handle_inject_message(route_params['id'])
            return

        self._send_json({'error': 'Not found'}, 404)

    # ── PUT routes ──

    def do_PUT(self):
        path, params = self._parse_path()

        if path == '/api/config':
            self._handle_put_config()
            return

        self._send_json({'error': 'Not found'}, 404)

    # ── PATCH routes ──

    def do_PATCH(self):
        path, params = self._parse_path()

        route_params = self._match_route(path, '/api/sessions/:id')
        if route_params:
            self._handle_rename_session(route_params['id'])
            return

        self._send_json({'error': 'Not found'}, 404)

    # ── DELETE routes ──

    def do_DELETE(self):
        path, params = self._parse_path()

        route_params = self._match_route(path, '/api/sessions/:id')
        if route_params:
            self._handle_delete_session(route_params['id'])
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

            try:
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
            except Exception as e:
                logger.error(f"Failed to read session {session_id}: {e}")
                continue

            summary = metadata.get('custom_name') or (metadata.get('metadata') or {}).get('custom_name') or first_user_content or session_id
            last_active = metadata.get('updated_at', '')
            if not last_active:
                mtime = os.path.getmtime(filepath)
                from datetime import datetime
                last_active = datetime.fromtimestamp(mtime).isoformat()

            # Read session key from metadata
            session_key = metadata.get('key', '')

            sessions.append({
                'id': session_id,
                'summary': summary,
                'filename': session_id + '.jsonl',
                'sessionKey': session_key,
                'lastActiveAt': last_active,
                'messageCount': message_count,
            })

        sessions.sort(key=lambda s: s['lastActiveAt'], reverse=True)
        logger.debug(f"Listed {len(sessions)} sessions")
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

        logger.debug(f"Messages for {session_id}: {len(messages)} returned, hasMore={has_more}")
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

        logger.info(f"Created session: {session_id}")
        self._send_json({
            'id': session_id,
            'summary': '新对话',
            'filename': session_id + '.jsonl',
            'sessionKey': session_key,
            'lastActiveAt': datetime.now().isoformat(),
            'messageCount': 0,
        })

    def _handle_rename_session(self, session_id):
        """PATCH /api/sessions/:id — rename a session.
        
        Request body: { "summary": "新名称" }
        Updates the metadata line in the JSONL file to include a custom_name field.
        """
        if '/' in session_id or '..' in session_id:
            self._send_json({'error': 'Invalid session id'}, 400)
            return

        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        if not os.path.exists(filepath):
            self._send_json({'error': 'Session not found'}, 404)
            return

        data = self._read_body()
        new_name = data.get('summary', '').strip()
        if not new_name:
            self._send_json({'error': 'Empty summary'}, 400)
            return

        # Read all lines, update metadata line with custom_name
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            updated = False
            for i, line in enumerate(lines):
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    obj = json.loads(stripped)
                    if obj.get('_type') == 'metadata':
                        obj['custom_name'] = new_name
                        # Also store in nested metadata so nanobot session save preserves it
                        if 'metadata' not in obj or not isinstance(obj.get('metadata'), dict):
                            obj['metadata'] = {}
                        obj['metadata']['custom_name'] = new_name
                        from datetime import datetime
                        obj['updated_at'] = datetime.now().isoformat()
                        lines[i] = json.dumps(obj, ensure_ascii=False) + '\n'
                        updated = True
                        break
                except json.JSONDecodeError:
                    continue

            if not updated:
                logger.error(f"Metadata not found in session {session_id}")
                self._send_json({'error': 'Metadata not found in session file'}, 500)
                return

            with open(filepath, 'w', encoding='utf-8') as f:
                f.writelines(lines)

            logger.info(f"Renamed session {session_id} to '{new_name}'")
            self._send_json({'id': session_id, 'summary': new_name})
        except Exception as e:
            logger.error(f"Failed to rename session {session_id}: {e}")
            self._send_json({'error': f'Rename failed: {str(e)}'}, 500)

    def _handle_delete_session(self, session_id):
        """DELETE /api/sessions/:id — move session JSONL to trash directory."""
        if '/' in session_id or '..' in session_id:
            self._send_json({'error': 'Invalid session id'}, 400)
            return

        filepath = os.path.join(SESSIONS_DIR, session_id + '.jsonl')
        if not os.path.exists(filepath):
            self._send_json({'error': 'Session not found'}, 404)
            return

        try:
            # Move to trash instead of deleting
            trash_dir = os.path.join(SESSIONS_DIR, '.trash')
            os.makedirs(trash_dir, exist_ok=True)
            trash_path = os.path.join(trash_dir, session_id + '.jsonl')
            # If a file with the same name already exists in trash, add timestamp suffix
            if os.path.exists(trash_path):
                from datetime import datetime
                ts = datetime.now().strftime('%Y%m%d%H%M%S')
                trash_path = os.path.join(trash_dir, f"{session_id}_{ts}.jsonl")
            os.rename(filepath, trash_path)
            logger.info(f"Moved session to trash: {session_id} → {os.path.basename(trash_path)}")
            self._send_json({'id': session_id, 'deleted': True})
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            self._send_json({'error': f'Delete failed: {str(e)}'}, 500)

    def _handle_search_sessions(self, params):
        """GET /api/sessions/search?q=keyword — search sessions by title and user messages."""
        query = params.get('q', [''])[0].strip().lower()
        if not query:
            self._send_json({'results': []})
            return

        try:
            results = []
            for filename in os.listdir(SESSIONS_DIR):
                if not filename.endswith('.jsonl'):
                    continue
                filepath = os.path.join(SESSIONS_DIR, filename)
                session_id = filename[:-6]  # remove .jsonl
                summary = session_id
                custom_name = None
                matches = []  # matched user message snippets

                with open(filepath, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        # Extract metadata
                        if obj.get('_type') == 'metadata':
                            meta = obj.get('metadata', {})
                            custom_name = obj.get('custom_name') or meta.get('custom_name')
                            continue

                        role = obj.get('role', '')
                        content = obj.get('content', '')
                        if not content or not isinstance(content, str):
                            continue

                        # Get summary from first user message
                        if role == 'user' and summary == session_id:
                            # Strip [Runtime Context] block
                            text = content.split('\n[Runtime Context]')[0].strip()
                            if text:
                                summary = text[:80]

                        # Search in user messages
                        if role == 'user' and query in content.lower():
                            # Extract a snippet around the match
                            text = content.split('\n[Runtime Context]')[0].strip()
                            if text and len(matches) < 3:  # max 3 matches per session
                                snippet = text[:100]
                                matches.append(snippet)

                display_name = custom_name or summary
                # Check if title matches
                title_match = query in display_name.lower()

                if title_match or matches:
                    results.append({
                        'id': session_id,
                        'summary': display_name,
                        'filename': filename,
                        'titleMatch': title_match,
                        'matches': matches,
                    })

            # Sort: title matches first, then by number of content matches
            results.sort(key=lambda r: (not r['titleMatch'], -len(r['matches'])))
            self._send_json({'results': results[:20]})  # max 20 results
        except Exception as e:
            logger.error(f"Failed to search sessions: {e}")
            self._send_json({'error': str(e)}, 500)

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

    # ── Config API handlers ──

    def _handle_get_config(self):
        """GET /api/config — read config.json."""
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
            self._send_json(config)
        except FileNotFoundError:
            self._send_json({'error': 'Config file not found'}, 404)
        except json.JSONDecodeError as e:
            self._send_json({'error': f'Invalid JSON: {e}'}, 500)
        except Exception as e:
            logger.error(f"Failed to read config: {e}")
            self._send_json({'error': str(e)}, 500)

    def _handle_put_config(self):
        """PUT /api/config — write config.json."""
        try:
            data = self._read_body()
            if not isinstance(data, dict):
                self._send_json({'error': 'Invalid config: expected JSON object'}, 400)
                return

            # Write with pretty formatting
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write('\n')

            logger.info("Config updated successfully")
            self._send_json({'success': True, 'message': 'Config saved'})
        except Exception as e:
            logger.error(f"Failed to write config: {e}")
            self._send_json({'error': str(e)}, 500)

    # ── Memory API handlers ──

    def _handle_get_memory_files(self):
        """GET /api/memory/files — list memory directory files."""
        try:
            if not os.path.isdir(MEMORY_DIR):
                self._send_json({'files': []})
                return

            files = []
            for name in sorted(os.listdir(MEMORY_DIR)):
                filepath = os.path.join(MEMORY_DIR, name)
                if os.path.isfile(filepath) and not name.startswith('.'):
                    stat = os.stat(filepath)
                    from datetime import datetime
                    files.append({
                        'name': name,
                        'size': stat.st_size,
                        'modifiedAt': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })

            self._send_json({'files': files})
        except Exception as e:
            logger.error(f"Failed to list memory files: {e}")
            self._send_json({'error': str(e)}, 500)

    def _handle_get_memory_file(self, filename):
        """GET /api/memory/files/:filename — read a memory file."""
        # Security: prevent path traversal
        if '/' in filename or '..' in filename:
            self._send_json({'error': 'Invalid filename'}, 400)
            return

        filepath = os.path.join(MEMORY_DIR, filename)
        if not os.path.isfile(filepath):
            self._send_json({'error': 'File not found'}, 404)
            return

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            stat = os.stat(filepath)
            from datetime import datetime
            self._send_json({
                'name': filename,
                'content': content,
                'size': stat.st_size,
                'modifiedAt': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
        except Exception as e:
            logger.error(f"Failed to read memory file {filename}: {e}")
            self._send_json({'error': str(e)}, 500)

    # ── Usage API handlers ──

    def _handle_get_usage(self, params):
        """GET /api/usage[?session=<key>] — usage from SQLite analytics DB."""
        session_key = params.get('session', [None])[0]
        try:
            if session_key:
                # Per-session usage
                result = analytics_db.get_session_usage(session_key)
                self._send_json(result)
            else:
                # Global usage
                result = analytics_db.get_global_usage()
                self._enrich_session_summaries(result)
                self._send_json(result)
        except Exception as e:
            logger.error(f"Failed to get usage from analytics DB: {e}")
            if session_key:
                self._send_json({
                    'session_key': session_key,
                    'prompt_tokens': 0,
                    'completion_tokens': 0,
                    'total_tokens': 0,
                    'llm_calls': 0,
                    'records': [],
                })
            else:
                self._send_json({
                    'total_prompt_tokens': 0,
                    'total_completion_tokens': 0,
                    'total_tokens': 0,
                    'total_llm_calls': 0,
                    'by_model': {},
                    'by_session': [],
                })

    def _handle_get_daily_usage(self, params):
        """GET /api/usage/daily?days=30 — daily aggregated usage."""
        try:
            days = int(params.get('days', ['30'])[0])
            days = max(1, min(days, 365))  # Clamp to 1-365
            result = analytics_db.get_daily_usage(days)
            self._send_json({'days': result})
        except Exception as e:
            logger.error(f"Failed to get daily usage: {e}")
            self._send_json({'days': []})

    def _enrich_session_summaries(self, result):
        """Enrich by_session entries with human-readable summary names.
        
        Also marks sessions whose JSONL file has been deleted with 'deleted': True.
        """
        for session_entry in result.get('by_session', []):
            session_id = session_entry['session_id']
            filename = session_id.replace(':', '_') + '.jsonl'
            filepath = os.path.join(SESSIONS_DIR, filename)
            summary = session_id
            deleted = False
            if os.path.isfile(filepath):
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        first_user_content = ''
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                obj = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            if obj.get('_type') == 'metadata':
                                summary = (
                                    obj.get('custom_name')
                                    or (obj.get('metadata') or {}).get('custom_name')
                                    or ''
                                )
                                if summary:
                                    break
                                continue
                            if obj.get('role') == 'user' and not first_user_content:
                                content = obj.get('content', '')
                                content = re.split(r'\n\s*\[Runtime Context\]', content)[0].strip()
                                first_user_content = content[:80] if content else ''
                        if not summary:
                            summary = first_user_content or session_id
                except Exception:
                    pass
            else:
                # JSONL file has been deleted — mark as deleted
                deleted = True
                summary = f'(已删除) {session_id}'
            session_entry['summary'] = summary
            session_entry['deleted'] = deleted

    # ── Skills API handlers ──

    def _handle_get_skills(self):
        """GET /api/skills — list all skills (user + builtin)."""
        skills = []

        # User skills
        if os.path.isdir(USER_SKILLS_DIR):
            for name in sorted(os.listdir(USER_SKILLS_DIR)):
                skill_dir = os.path.join(USER_SKILLS_DIR, name)
                if os.path.isdir(skill_dir) and not name.startswith('.'):
                    skill_md = os.path.join(skill_dir, 'SKILL.md')
                    desc = ''
                    if os.path.isfile(skill_md):
                        desc = self._parse_skill_description(skill_md)
                    skills.append({
                        'name': name,
                        'description': desc,
                        'location': skill_dir,
                        'source': 'user',
                        'available': True,
                    })

        # Builtin skills
        if BUILTIN_SKILLS_DIR and os.path.isdir(BUILTIN_SKILLS_DIR):
            for name in sorted(os.listdir(BUILTIN_SKILLS_DIR)):
                skill_dir = os.path.join(BUILTIN_SKILLS_DIR, name)
                if os.path.isdir(skill_dir) and not name.startswith('.') and name != '__pycache__':
                    # Skip if already in user skills (user overrides builtin)
                    if any(s['name'] == name for s in skills):
                        continue
                    skill_md = os.path.join(skill_dir, 'SKILL.md')
                    desc = ''
                    if os.path.isfile(skill_md):
                        desc = self._parse_skill_description(skill_md)
                    skills.append({
                        'name': name,
                        'description': desc,
                        'location': skill_dir,
                        'source': 'builtin',
                        'available': True,
                    })

        self._send_json({'skills': skills})

    def _parse_skill_description(self, skill_md_path):
        """Parse description from SKILL.md YAML frontmatter."""
        try:
            with open(skill_md_path, 'r', encoding='utf-8') as f:
                content = f.read()
            # Parse YAML frontmatter between --- markers
            if content.startswith('---'):
                end = content.find('---', 3)
                if end != -1:
                    frontmatter = content[3:end]
                    for line in frontmatter.split('\n'):
                        line = line.strip()
                        if line.startswith('description:'):
                            return line[len('description:'):].strip().strip('"').strip("'")
            return ''
        except Exception:
            return ''

    def _handle_skill_routes(self, path):
        """Route /api/skills/:name/... requests."""
        # Remove /api/skills/ prefix
        rest = path[len('/api/skills/'):]
        parts = rest.split('/', 1)
        skill_name = parts[0]

        if len(parts) == 1:
            # GET /api/skills/:name — skill detail
            self._handle_get_skill_detail(skill_name)
            return

        sub_path = parts[1]
        if sub_path == 'tree':
            # GET /api/skills/:name/tree
            self._handle_get_skill_tree(skill_name)
            return

        if sub_path.startswith('files/'):
            # GET /api/skills/:name/files/... 
            file_path = sub_path[len('files/'):]
            self._handle_get_skill_file(skill_name, file_path)
            return

        self._send_json({'error': 'Not found'}, 404)

    def _find_skill_dir(self, skill_name):
        """Find skill directory (user skills first, then builtin)."""
        if '/' in skill_name or '..' in skill_name:
            return None
        # User skills first
        user_dir = os.path.join(USER_SKILLS_DIR, skill_name)
        if os.path.isdir(user_dir):
            return user_dir
        # Builtin skills
        if BUILTIN_SKILLS_DIR:
            builtin_dir = os.path.join(BUILTIN_SKILLS_DIR, skill_name)
            if os.path.isdir(builtin_dir):
                return builtin_dir
        return None

    def _handle_get_skill_detail(self, skill_name):
        """GET /api/skills/:name — read SKILL.md content."""
        skill_dir = self._find_skill_dir(skill_name)
        if not skill_dir:
            self._send_json({'error': 'Skill not found'}, 404)
            return

        skill_md = os.path.join(skill_dir, 'SKILL.md')
        content = ''
        if os.path.isfile(skill_md):
            try:
                with open(skill_md, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception as e:
                logger.error(f"Failed to read SKILL.md for {skill_name}: {e}")

        source = 'user' if skill_dir.startswith(USER_SKILLS_DIR) else 'builtin'
        self._send_json({
            'name': skill_name,
            'content': content,
            'location': skill_dir,
            'source': source,
        })

    def _handle_get_skill_tree(self, skill_name):
        """GET /api/skills/:name/tree — directory tree."""
        skill_dir = self._find_skill_dir(skill_name)
        if not skill_dir:
            self._send_json({'error': 'Skill not found'}, 404)
            return

        tree = []
        for root, dirs, files in os.walk(skill_dir):
            # Skip hidden dirs and __pycache__
            dirs[:] = [d for d in sorted(dirs) if not d.startswith('.') and d != '__pycache__']
            rel_root = os.path.relpath(root, skill_dir)

            if rel_root != '.':
                tree.append({'path': rel_root, 'type': 'dir'})

            for fname in sorted(files):
                if fname.startswith('.'):
                    continue
                rel_path = os.path.join(rel_root, fname) if rel_root != '.' else fname
                fpath = os.path.join(root, fname)
                try:
                    size = os.path.getsize(fpath)
                except OSError:
                    size = 0
                tree.append({'path': rel_path, 'type': 'file', 'size': size})

        self._send_json({'name': skill_name, 'tree': tree})

    def _handle_get_skill_file(self, skill_name, file_path):
        """GET /api/skills/:name/files/:path — read a file in skill directory."""
        skill_dir = self._find_skill_dir(skill_name)
        if not skill_dir:
            self._send_json({'error': 'Skill not found'}, 404)
            return

        # Security: prevent path traversal
        if '..' in file_path:
            self._send_json({'error': 'Invalid path'}, 400)
            return

        full_path = os.path.join(skill_dir, file_path)
        real_path = os.path.realpath(full_path)
        real_skill = os.path.realpath(skill_dir)
        if not real_path.startswith(real_skill):
            self._send_json({'error': 'Forbidden'}, 403)
            return

        if not os.path.isfile(full_path):
            self._send_json({'error': 'File not found'}, 404)
            return

        try:
            # Try reading as text; if it fails, report as binary
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            self._send_json({
                'path': file_path,
                'content': content,
                'size': os.path.getsize(full_path),
                'binary': False,
            })
        except UnicodeDecodeError:
            self._send_json({
                'path': file_path,
                'content': '(binary file)',
                'size': os.path.getsize(full_path),
                'binary': True,
            })
        except Exception as e:
            logger.error(f"Failed to read skill file {skill_name}/{file_path}: {e}")
            self._send_json({'error': str(e)}, 500)

    # ── Task Status handler ──

    def _handle_get_task_status(self, session_id):
        """GET /api/sessions/:id/task-status — query background task status from worker."""
        session_key = self._get_session_key(session_id)
        encoded_key = urllib.parse.quote(session_key, safe='')
        try:
            req = urllib.request.Request(
                f'{WORKER_URL}/tasks/{encoded_key}',
                method='GET',
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))

            # Opportunistic usage recording: if task is done and has usage data,
            # record it to analytics DB (idempotent — dedup by finished_at + model + tokens).
            if data.get('status') == 'done' and data.get('usage'):
                self._try_record_usage(data['usage'])

            self._send_json(data)
        except urllib.error.URLError as e:
            logger.error(f"Worker unavailable for task status: {e.reason}")
            self._send_json({'status': 'unknown', 'message': 'Worker unavailable'}, 502)
        except Exception as e:
            logger.error(f"Task status error: {e}")
            self._send_json({'status': 'unknown', 'message': str(e)}, 500)

    def _handle_kill_task(self, session_id):
        """POST /api/sessions/:id/task-kill — forward kill request to worker."""
        session_key = self._get_session_key(session_id)
        encoded_key = urllib.parse.quote(session_key, safe='')
        try:
            req = urllib.request.Request(
                f'{WORKER_URL}/tasks/{encoded_key}/kill',
                data=b'',
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            self._send_json(data)
        except urllib.error.URLError as e:
            logger.error(f"Worker unavailable for task kill: {e.reason}")
            self._send_json({'status': 'error', 'message': 'Worker unavailable'}, 502)
        except Exception as e:
            logger.error(f"Task kill error: {e}")
            self._send_json({'status': 'error', 'message': str(e)}, 500)

    def _handle_inject_message(self, session_id):
        """POST /api/sessions/:id/task-inject — forward inject request to worker."""
        data = self._read_body()
        message = data.get('message', '').strip()
        if not message:
            self._send_json({'error': 'Empty message'}, 400)
            return

        session_key = self._get_session_key(session_id)
        encoded_key = urllib.parse.quote(session_key, safe='')
        logger.info(f"Inject message into task: session={session_id}, message={message[:80]}...")

        try:
            body = json.dumps({'message': message}).encode('utf-8')
            req = urllib.request.Request(
                f'{WORKER_URL}/tasks/{encoded_key}/inject',
                data=body,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                result = json.loads(resp.read().decode('utf-8'))
            self._send_json(result)
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='replace')
            try:
                result = json.loads(body)
            except Exception:
                result = {'status': 'error', 'message': body}
            self._send_json(result, e.code)
        except urllib.error.URLError as e:
            logger.error(f"Worker unavailable for inject: {e.reason}")
            self._send_json({'status': 'error', 'message': 'Worker unavailable'}, 502)
        except Exception as e:
            logger.error(f"Inject error: {e}")
            self._send_json({'status': 'error', 'message': str(e)}, 500)

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
        logger.info(f"Send message to session {session_id} (key={session_key}): {message[:80]}...")

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
                current_event = ''
                current_data = ''
                while True:
                    line = resp.readline()
                    if not line:
                        break
                    self.wfile.write(line)

                    # Parse SSE events to extract usage from 'done' event
                    decoded = line.decode('utf-8', errors='replace').rstrip('\n')
                    if decoded.startswith('event: '):
                        current_event = decoded[7:].strip()
                    elif decoded.startswith('data: '):
                        current_data = decoded[6:]
                    elif decoded == '':
                        # Event boundary — process and flush
                        if current_event == 'done' and current_data:
                            try:
                                done_payload = json.loads(current_data)
                                usage = done_payload.get('usage')
                                if usage:
                                    self._try_record_usage(usage)
                            except Exception as e:
                                logger.error(f"Failed to process done event: {e}")
                        current_event = ''
                        current_data = ''
                        self.wfile.flush()

            logger.info(f"SSE stream completed for session {session_id}")

        except urllib.error.URLError as e:
            logger.error(f"Worker unavailable for session {session_id}: {e.reason}")
            try:
                self._send_json({
                    'reply': f'❌ Worker 服务不可用: {str(e.reason)}'
                }, 502)
            except Exception:
                pass
        except BrokenPipeError:
            logger.warning(f"Client disconnected during SSE stream for session {session_id}")
            # Client disconnected but task may still be running/completed.
            # Try to recover usage from worker in background.
            self._try_recover_usage(session_key)
        except Exception as e:
            logger.error(f"SSE stream error for session {session_id}: {e}")
            # Also try to recover usage on other stream errors (e.g. timeout)
            self._try_recover_usage(session_key)
            try:
                self._send_json({
                    'reply': f'❌ 转发失败: {str(e)}'
                }, 500)
            except Exception:
                pass

    def _try_recover_usage(self, session_key):
        """Try to recover usage data from worker when SSE stream was interrupted.
        
        Polls worker task-status up to 3 times with delay, since the task may
        still be running when the SSE stream breaks.
        """
        def _poll():
            encoded_key = urllib.parse.quote(session_key, safe='')
            for attempt in range(3):
                time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s
                try:
                    req = urllib.request.Request(
                        f'{WORKER_URL}/tasks/{encoded_key}',
                        method='GET',
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode('utf-8'))

                    if data.get('status') in ('done', 'error') and data.get('usage'):
                        self._try_record_usage(data['usage'])
                        return
                    elif data.get('status') == 'running':
                        continue  # Still running, try again
                    else:
                        return  # Task done but no usage, or unknown
                except Exception as e:
                    logger.debug(f"Usage recovery attempt {attempt+1} failed for {session_key}: {e}")

        threading.Thread(target=_poll, daemon=True).start()

    # Set of recently recorded usage keys to avoid duplicate DB writes.
    # Key: (session_key, finished_at, model, total_tokens)
    _recorded_usage = set()
    _recorded_usage_lock = threading.Lock()

    def _try_record_usage(self, usage):
        """Record usage to analytics DB with deduplication.

        NOTE: Since nanobot core v2 (unified UsageRecorder), the agent loop
        writes usage directly to SQLite.  Webserver no longer needs to record
        usage from SSE/worker.  This method is now a no-op to avoid duplicate
        rows.  The /api/usage read routes remain unchanged.
        """
        # No-op: usage is now recorded by nanobot core (UsageRecorder in agent/loop.py).
        if usage:
            logger.debug(
                f"Skipping webserver-side usage recording for {usage.get('session_key', '?')} "
                f"(handled by nanobot core UsageRecorder)"
            )
        return

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

    if DAEMONIZE:
        # Double-fork to fully detach from parent process.
        # This avoids PIPE fd inheritance issues when launched via exec tool.
        pid = os.fork()
        if pid > 0:
            # Parent: print PID and exit immediately
            print(f"Webserver daemonized (pid={pid})")
            sys.exit(0)
        # Child: new session, second fork
        os.setsid()
        pid2 = os.fork()
        if pid2 > 0:
            sys.exit(0)
        # Grandchild: redirect stdio to /dev/null
        sys.stdin = open(os.devnull, 'r')
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        # Redirect low-level fds too
        devnull_fd = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull_fd, 0)
        os.dup2(devnull_fd, 1)
        os.dup2(devnull_fd, 2)
        os.close(devnull_fd)

    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
    server = ThreadedHTTPServer(('127.0.0.1', PORT), WebServerHandler)
    logger.info(f"Webserver starting on http://localhost:{PORT}")
    logger.info(f"Worker: {WORKER_URL}")
    logger.info(f"Log file: {LOG_FILE}")
    if not DAEMONIZE:
        print(f"🐈 nanobot Web Chat running at http://localhost:{PORT}")
        print(f"   Worker: {WORKER_URL}")
        print(f"   Health: http://localhost:{PORT}/api/health")
        print(f"   Log: {LOG_FILE}")
        print(f"   Threaded: yes (concurrent requests supported)")
        print(f"   Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        if not DAEMONIZE:
            print("\n👋 Webserver stopped.")
        logger.info("Webserver stopped by user")
        server.server_close()
