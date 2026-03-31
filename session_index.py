"""Session index cache for fast session listing.

Maintains a JSON index file that caches per-session metadata (summary,
message_count, key, etc.) alongside the file's mtime and size.  On each
list_sessions() call, only files whose mtime/size changed since the last
index build are re-read — the rest are served from cache.

Typical performance:
  - Cold start (no index): ~1.7s for 1300 files / 134MB
  - Warm (all cached):     ~0.03s (stat-only + index load)
  - Incremental (1 file changed): ~0.03s + cost of that 1 file
"""

import json
import logging
import os
import re
import threading
import time
from pathlib import Path

logger = logging.getLogger('webserver')

# ── Runtime Context stripping (imported from webserver at init) ──
_RC_PATTERN = re.compile(r'(?:^|\n)\s*\[Runtime Context\].*', re.DOTALL)


def _strip_runtime_context(content):
    """Strip [Runtime Context] block from content."""
    if isinstance(content, str):
        return _RC_PATTERN.split(content)[0].strip()
    if isinstance(content, list):
        cleaned = []
        for block in content:
            if block.get('type') == 'text' and block.get('text'):
                cleaned_text = _RC_PATTERN.split(block['text'])[0].strip()
                if cleaned_text:
                    cleaned.append({**block, 'text': cleaned_text})
            else:
                cleaned.append(block)
        return cleaned
    return content


class SessionIndex:
    """In-memory + on-disk session index cache.

    Thread-safe.  The index is loaded from disk on first access and
    persisted after each incremental update.

    Index entry format per session_id::

        {
            "mtime": 1711900000.0,
            "size": 12345,
            "key": "webchat:1234567890",
            "first_user": "Hello, how are you?",
            "message_count": 42
        }
    """

    def __init__(self, sessions_dir: str):
        self._sessions_dir = sessions_dir
        self._index_path = os.path.join(sessions_dir, '.session_index.json')
        self._lock = threading.Lock()
        self._index: dict[str, dict] = {}
        self._loaded = False

    def _load_index(self) -> None:
        """Load index from disk (once)."""
        if self._loaded:
            return
        if os.path.isfile(self._index_path):
            try:
                with open(self._index_path, 'r', encoding='utf-8') as f:
                    self._index = json.load(f)
                logger.info(f"Session index loaded: {len(self._index)} entries")
            except Exception as e:
                logger.warning(f"Failed to load session index, rebuilding: {e}")
                self._index = {}
        self._loaded = True

    def _save_index(self) -> None:
        """Persist index to disk (atomic write)."""
        try:
            tmp_path = self._index_path + '.tmp'
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(self._index, f, ensure_ascii=False)
            os.replace(tmp_path, self._index_path)
        except Exception as e:
            logger.warning(f"Failed to save session index: {e}")

    def invalidate(self, session_id: str) -> None:
        """Invalidate a single session's index entry.

        Call this when a session file is modified externally (e.g. rename,
        delete).  The next list_sessions() will re-read that file.
        """
        with self._lock:
            self._load_index()
            if session_id in self._index:
                del self._index[session_id]

    def list_sessions(self, session_names: dict[str, str]) -> list[dict]:
        """Return session list, using cache where possible.

        Args:
            session_names: Dict from session_names.json {session_id: display_name}.

        Returns:
            List of session dicts sorted by lastActiveAt (newest first).
        """
        with self._lock:
            return self._list_sessions_locked(session_names)

    def _list_sessions_locked(self, session_names: dict[str, str]) -> list[dict]:
        self._load_index()

        if not os.path.isdir(self._sessions_dir):
            return []

        sessions = []
        updated = False
        current_ids = set()

        for filename in os.listdir(self._sessions_dir):
            if not filename.endswith('.jsonl'):
                continue

            session_id = filename[:-6]  # strip .jsonl
            current_ids.add(session_id)
            filepath = os.path.join(self._sessions_dir, filename)

            try:
                stat = os.stat(filepath)
            except OSError:
                continue

            mtime = stat.st_mtime
            size = stat.st_size

            # Check if cached entry is still valid
            cached = self._index.get(session_id)
            if cached and cached.get('mtime') == mtime and cached.get('size') == size:
                # Cache hit — use cached data
                entry = cached
            else:
                # Cache miss — re-read the file
                entry = self._read_session_file(filepath, session_id, mtime, size)
                if entry is None:
                    continue
                self._index[session_id] = entry
                updated = True

            # Build response using cached data + live session_names
            display_name = session_names.get(session_id) or entry.get('first_user') or session_id
            from datetime import datetime
            last_active = datetime.fromtimestamp(mtime).isoformat()

            sessions.append({
                'id': session_id,
                'summary': display_name,
                'filename': filename,
                'sessionKey': entry.get('key', ''),
                'lastActiveAt': last_active,
                'messageCount': entry.get('message_count', 0),
            })

        # Prune deleted sessions from index
        stale_ids = set(self._index.keys()) - current_ids
        if stale_ids:
            for sid in stale_ids:
                del self._index[sid]
            updated = True

        # Persist index if anything changed
        if updated:
            self._save_index()

        sessions.sort(key=lambda s: s['lastActiveAt'], reverse=True)
        return sessions

    @staticmethod
    def _read_session_file(filepath: str, session_id: str,
                           mtime: float, size: int) -> dict | None:
        """Read a session JSONL file and extract index-worthy data.

        Returns an index entry dict, or None on failure.
        """
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
                        content = _strip_runtime_context(content)
                        if isinstance(content, list):
                            text_parts = [c.get('text', '') for c in content
                                          if c.get('type') == 'text']
                            content = ' '.join(text_parts)
                        first_user_content = content[:80] if content else ''
        except Exception as e:
            logger.error(f"Failed to read session {session_id}: {e}")
            return None

        return {
            'mtime': mtime,
            'size': size,
            'key': metadata.get('key', ''),
            'first_user': first_user_content,
            'message_count': message_count,
        }


# ── Module-level singleton ──
_session_index: SessionIndex | None = None


def get_session_index(sessions_dir: str = None) -> SessionIndex:
    """Get or create the global SessionIndex singleton."""
    global _session_index
    if _session_index is None:
        if sessions_dir is None:
            sessions_dir = os.path.expanduser('~/.nanobot/workspace/sessions')
        _session_index = SessionIndex(sessions_dir)
    return _session_index
