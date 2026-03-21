"""Integration tests for webserver.py utilities.

Tests cover:
- Runtime context stripping
- Session key conversion (session_id ↔ session_key)
- Analytics DB integration via webserver endpoints logic
"""

import re

import pytest


# ═══════════════════════════════════════════════════════════════════
# §1  Runtime Context stripping
# ═══════════════════════════════════════════════════════════════════

# Replicate the pattern from webserver.py to test independently
_RC_PATTERN = re.compile(r'(?:^|\n)\s*\[Runtime Context\].*', re.DOTALL)


def strip_runtime_context(content):
    """Strip [Runtime Context] block from user message content."""
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


class TestStripRuntimeContext:
    """Test Runtime Context stripping for various message formats."""

    def test_simple_string(self):
        msg = "Hello world\n\n[Runtime Context]\nTime: 2026-03-21"
        assert strip_runtime_context(msg) == "Hello world"

    def test_no_context(self):
        msg = "Hello world"
        assert strip_runtime_context(msg) == "Hello world"

    def test_only_context(self):
        msg = "[Runtime Context]\nTime: 2026-03-21"
        assert strip_runtime_context(msg) == ""

    def test_multiline_before_context(self):
        msg = "Line 1\nLine 2\nLine 3\n\n[Runtime Context]\nmetadata"
        assert strip_runtime_context(msg) == "Line 1\nLine 2\nLine 3"

    def test_multimodal_content(self):
        content = [
            {"type": "text", "text": "Hello\n[Runtime Context]\nstuff"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
        ]
        result = strip_runtime_context(content)
        assert len(result) == 2
        assert result[0]["text"] == "Hello"
        assert result[1]["type"] == "image_url"

    def test_multimodal_text_only_context(self):
        """Text block with only context is removed entirely."""
        content = [
            {"type": "text", "text": "[Runtime Context]\nstuff"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
        ]
        result = strip_runtime_context(content)
        # Text block should be removed (empty after stripping)
        assert len(result) == 1
        assert result[0]["type"] == "image_url"

    def test_non_string_passthrough(self):
        """Non-string, non-list content passes through unchanged."""
        assert strip_runtime_context(42) == 42
        assert strip_runtime_context(None) is None

    def test_context_with_leading_whitespace(self):
        msg = "Hello\n  [Runtime Context]\nTime: 2026-03-21"
        assert strip_runtime_context(msg) == "Hello"


# ═══════════════════════════════════════════════════════════════════
# §2  Session ID ↔ Session Key conversion
# ═══════════════════════════════════════════════════════════════════


class TestSessionKeyConversion:
    """Test session_id (underscore) ↔ session_key (colon) conversion.

    webserver.py uses _get_session_key() which converts:
    - webchat_123456 → webchat:123456
    - cli_direct → cli:direct
    """

    def _session_id_to_key(self, session_id):
        """Convert session_id (underscore) to session_key (colon)."""
        parts = session_id.split('_', 1)
        if len(parts) == 2:
            return f"{parts[0]}:{parts[1]}"
        return session_id

    def _session_key_to_id(self, session_key):
        """Convert session_key (colon) to session_id (underscore)."""
        return session_key.replace(':', '_', 1)

    def test_webchat_conversion(self):
        assert self._session_id_to_key("webchat_123456") == "webchat:123456"

    def test_cli_conversion(self):
        assert self._session_id_to_key("cli_direct") == "cli:direct"

    def test_no_underscore(self):
        assert self._session_id_to_key("simple") == "simple"

    def test_multiple_underscores(self):
        """Only first underscore is converted."""
        assert self._session_id_to_key("feishu_group_123") == "feishu:group_123"

    def test_round_trip(self):
        original_id = "webchat_123456"
        key = self._session_id_to_key(original_id)
        back = self._session_key_to_id(key)
        assert back == original_id

    def test_cron_session_key(self):
        """Cron session keys use colon format."""
        assert self._session_id_to_key("cron_abc123") == "cron:abc123"

    def test_subagent_session_key(self):
        """Subagent session keys with multiple parts."""
        assert self._session_id_to_key("sub_worker_1") == "sub:worker_1"


# ═══════════════════════════════════════════════════════════════════
# §3  Analytics DB integration
# ═══════════════════════════════════════════════════════════════════


class TestAnalyticsIntegration:
    """Test analytics DB usage from webserver context."""

    def test_record_and_query_usage(self):
        """Usage recorded by worker can be queried by webserver."""
        from analytics import AnalyticsDB

        db = AnalyticsDB(db_path=":memory:")

        # Simulate worker recording usage
        db.record_usage(
            session_key="webchat:123",
            model="claude-3-5-sonnet",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            llm_calls=3,
            started_at="2026-03-21T10:00:00",
            finished_at="2026-03-21T10:01:00",
        )

        # Simulate webserver querying usage
        global_usage = db.get_global_usage()
        assert global_usage["total_tokens"] == 1500
        assert global_usage["total_llm_calls"] == 3
        assert "claude-3-5-sonnet" in global_usage["by_model"]

    def test_session_usage_query(self):
        """Per-session usage query works correctly."""
        from analytics import AnalyticsDB

        db = AnalyticsDB(db_path=":memory:")
        db.record_usage("web:1", "model-a", 100, 50, 150, 1, "2026-03-21T10:00:00", "2026-03-21T10:01:00")
        db.record_usage("web:1", "model-a", 200, 100, 300, 2, "2026-03-21T11:00:00", "2026-03-21T11:01:00")
        db.record_usage("web:2", "model-b", 500, 250, 750, 3, "2026-03-21T12:00:00", "2026-03-21T12:01:00")

        session_usage = db.get_session_usage("web:1")
        assert session_usage["total_tokens"] == 450
        assert session_usage["llm_calls"] == 3
        assert len(session_usage["records"]) == 2

    def test_daily_usage_aggregation(self):
        """Daily usage aggregation works."""
        from analytics import AnalyticsDB

        db = AnalyticsDB(db_path=":memory:")
        db.record_usage("web:1", "model-a", 100, 50, 150, 1, "2026-03-20T10:00:00", "2026-03-20T10:01:00")
        db.record_usage("web:1", "model-a", 200, 100, 300, 2, "2026-03-21T10:00:00", "2026-03-21T10:01:00")

        daily = db.get_daily_usage(days=30)
        assert len(daily) >= 1  # At least one day with data
