"""
test_analytics.py — Tests for AnalyticsDB (token usage SQLite storage).

All tests use in-memory SQLite databases (:memory:) for isolation.
No production data is touched.

Run: cd web-chat && python3 -m pytest tests/ -v
"""

import json
import os
import sqlite3
import tempfile

import pytest

# Add parent dir to path so we can import analytics
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from analytics import AnalyticsDB


# ── Fixtures ──

@pytest.fixture
def db():
    """Fresh in-memory AnalyticsDB for each test."""
    return AnalyticsDB(db_path=":memory:")


@pytest.fixture
def populated_db(db):
    """DB with sample data for query tests."""
    # Session 1: cli:direct — 2 interactions with claude-opus-4-6
    db.record_usage(
        session_key="cli:direct",
        model="claude-opus-4-6",
        prompt_tokens=10000,
        completion_tokens=2000,
        total_tokens=12000,
        llm_calls=3,
        started_at="2026-02-25T10:00:00",
        finished_at="2026-02-25T10:01:30",
    )
    db.record_usage(
        session_key="cli:direct",
        model="claude-opus-4-6",
        prompt_tokens=15000,
        completion_tokens=3000,
        total_tokens=18000,
        llm_calls=5,
        started_at="2026-02-25T14:00:00",
        finished_at="2026-02-25T14:02:00",
    )

    # Session 2: webchat:123 — 1 interaction with claude-sonnet
    db.record_usage(
        session_key="webchat:123",
        model="claude-sonnet-4-20250514",
        prompt_tokens=5000,
        completion_tokens=1000,
        total_tokens=6000,
        llm_calls=2,
        started_at="2026-02-26T09:00:00",
        finished_at="2026-02-26T09:00:45",
    )

    # Session 3: webchat:456 — 1 interaction with claude-opus-4-6 (different day)
    db.record_usage(
        session_key="webchat:456",
        model="claude-opus-4-6",
        prompt_tokens=20000,
        completion_tokens=4000,
        total_tokens=24000,
        llm_calls=8,
        started_at="2026-02-26T15:00:00",
        finished_at="2026-02-26T15:03:00",
    )

    return db


# ── Schema Tests ──

class TestSchema:
    def test_creates_table(self, db):
        """Table and indexes should be created on init."""
        conn = db._connect()
        # Check table exists
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'"
        ).fetchone()
        assert row is not None

    def test_creates_indexes(self, db):
        """All 4 indexes should exist."""
        conn = db._connect()
        indexes = [r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_usage_%'"
        )]
        assert set(indexes) == {
            "idx_usage_session",
            "idx_usage_started",
            "idx_usage_finished",
            "idx_usage_model",
        }

    def test_idempotent_schema_creation(self):
        """Creating AnalyticsDB twice on same path should not error."""
        db1 = AnalyticsDB(db_path=":memory:")
        # Re-init on same connection won't work for :memory:, but tests the SQL
        db1._ensure_schema()  # Should not raise


# ── Write Tests ──

class TestRecordUsage:
    def test_insert_returns_id(self, db):
        row_id = db.record_usage(
            session_key="test:session",
            model="test-model",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            llm_calls=1,
            started_at="2026-01-01T00:00:00",
            finished_at="2026-01-01T00:00:30",
        )
        assert row_id == 1

    def test_insert_multiple_increments_id(self, db):
        id1 = db.record_usage("s1", "m1", 100, 50, 150, 1, "2026-01-01T00:00:00", "2026-01-01T00:00:30")
        id2 = db.record_usage("s2", "m2", 200, 100, 300, 2, "2026-01-01T01:00:00", "2026-01-01T01:01:00")
        assert id2 == id1 + 1

    def test_fields_stored_correctly(self, db):
        db.record_usage(
            session_key="cli:direct",
            model="claude-opus-4-6",
            prompt_tokens=12345,
            completion_tokens=6789,
            total_tokens=19134,
            llm_calls=7,
            started_at="2026-02-26T10:00:00",
            finished_at="2026-02-26T10:05:00",
        )
        conn = db._connect()
        row = conn.execute("SELECT * FROM token_usage WHERE id = 1").fetchone()
        assert row["session_key"] == "cli:direct"
        assert row["model"] == "claude-opus-4-6"
        assert row["prompt_tokens"] == 12345
        assert row["completion_tokens"] == 6789
        assert row["total_tokens"] == 19134
        assert row["llm_calls"] == 7
        assert row["started_at"] == "2026-02-26T10:00:00"
        assert row["finished_at"] == "2026-02-26T10:05:00"


# ── Global Usage Tests ──

class TestGetGlobalUsage:
    def test_empty_db(self, db):
        result = db.get_global_usage()
        assert result["total_prompt_tokens"] == 0
        assert result["total_completion_tokens"] == 0
        assert result["total_tokens"] == 0
        assert result["total_llm_calls"] == 0
        assert result["by_model"] == {}
        assert result["by_session"] == []

    def test_totals(self, populated_db):
        result = populated_db.get_global_usage()
        # 10000+15000+5000+20000 = 50000
        assert result["total_prompt_tokens"] == 50000
        # 2000+3000+1000+4000 = 10000
        assert result["total_completion_tokens"] == 10000
        # 12000+18000+6000+24000 = 60000
        assert result["total_tokens"] == 60000
        # 3+5+2+8 = 18
        assert result["total_llm_calls"] == 18

    def test_by_model(self, populated_db):
        result = populated_db.get_global_usage()
        by_model = result["by_model"]
        assert len(by_model) == 2

        opus = by_model["claude-opus-4-6"]
        assert opus["prompt_tokens"] == 45000  # 10000+15000+20000
        assert opus["completion_tokens"] == 9000  # 2000+3000+4000
        assert opus["total_tokens"] == 54000  # 12000+18000+24000
        assert opus["llm_calls"] == 16  # 3+5+8

        sonnet = by_model["claude-sonnet-4-20250514"]
        assert sonnet["total_tokens"] == 6000

    def test_by_session(self, populated_db):
        result = populated_db.get_global_usage()
        by_session = result["by_session"]
        assert len(by_session) == 3

        # Sorted by total_tokens DESC
        assert by_session[0]["session_id"] == "cli:direct"
        assert by_session[0]["total_tokens"] == 30000  # 12000+18000
        assert by_session[1]["session_id"] == "webchat:456"
        assert by_session[1]["total_tokens"] == 24000
        assert by_session[2]["session_id"] == "webchat:123"
        assert by_session[2]["total_tokens"] == 6000

    def test_by_session_last_used(self, populated_db):
        result = populated_db.get_global_usage()
        by_session = result["by_session"]
        cli_direct = next(s for s in by_session if s["session_id"] == "cli:direct")
        assert cli_direct["last_used"] == "2026-02-25T14:02:00"


# ── Session Usage Tests ──

class TestGetSessionUsage:
    def test_existing_session(self, populated_db):
        result = populated_db.get_session_usage("cli:direct")
        assert result["session_key"] == "cli:direct"
        assert result["prompt_tokens"] == 25000  # 10000+15000
        assert result["total_tokens"] == 30000
        assert result["llm_calls"] == 8  # 3+5
        assert len(result["records"]) == 2
        # Records ordered by started_at ASC
        assert result["records"][0]["started_at"] == "2026-02-25T10:00:00"
        assert result["records"][1]["started_at"] == "2026-02-25T14:00:00"

    def test_nonexistent_session(self, populated_db):
        result = populated_db.get_session_usage("nonexistent:session")
        assert result["total_tokens"] == 0
        assert result["llm_calls"] == 0
        assert result["records"] == []


# ── Daily Usage Tests ──

class TestGetDailyUsage:
    def test_daily_aggregation(self, populated_db):
        result = populated_db.get_daily_usage(days=30)
        assert len(result) == 2  # 2026-02-25 and 2026-02-26

        day1 = result[0]
        assert day1["date"] == "2026-02-25"
        assert day1["total_tokens"] == 30000  # 12000+18000
        assert day1["llm_calls"] == 8  # 3+5

        day2 = result[1]
        assert day2["date"] == "2026-02-26"
        assert day2["total_tokens"] == 30000  # 6000+24000
        assert day2["llm_calls"] == 10  # 2+8

    def test_empty_db_daily(self, db):
        result = db.get_daily_usage(days=7)
        assert result == []


# ── Migration Tests ──

class TestMigrateFromJsonl:
    def _create_test_jsonl(self, tmpdir, filename, records):
        """Helper to create a test JSONL file."""
        filepath = os.path.join(tmpdir, filename)
        with open(filepath, "w") as f:
            for rec in records:
                f.write(json.dumps(rec) + "\n")
        return filepath

    def test_basic_migration(self, db):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_test_jsonl(tmpdir, "cli_direct.jsonl", [
                {"_type": "metadata", "key": "cli:direct"},
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
                {
                    "_type": "usage",
                    "model": "claude-opus-4-6",
                    "prompt_tokens": 1000,
                    "completion_tokens": 200,
                    "total_tokens": 1200,
                    "llm_calls": 2,
                    "timestamp": "2026-02-26T10:00:00",
                },
            ])

            stats = db.migrate_from_jsonl(tmpdir)
            assert stats["migrated"] == 1
            assert stats["skipped"] == 0
            assert stats["errors"] == 0

            result = db.get_global_usage()
            assert result["total_tokens"] == 1200
            assert result["by_session"][0]["session_id"] == "cli:direct"

    def test_migration_with_started_at(self, db):
        """New-format records with started_at/finished_at should be preserved."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_test_jsonl(tmpdir, "webchat_123.jsonl", [
                {"_type": "metadata", "key": "webchat:123"},
                {
                    "_type": "usage",
                    "model": "claude-opus-4-6",
                    "prompt_tokens": 5000,
                    "completion_tokens": 500,
                    "total_tokens": 5500,
                    "llm_calls": 3,
                    "started_at": "2026-02-26T10:00:00",
                    "finished_at": "2026-02-26T10:02:00",
                },
            ])

            db.migrate_from_jsonl(tmpdir)
            result = db.get_session_usage("webchat:123")
            assert len(result["records"]) == 1
            assert result["records"][0]["started_at"] == "2026-02-26T10:00:00"
            assert result["records"][0]["finished_at"] == "2026-02-26T10:02:00"

    def test_old_format_fallback(self, db):
        """Old records with only 'timestamp' should use it for both started_at and finished_at."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_test_jsonl(tmpdir, "cli_direct.jsonl", [
                {
                    "_type": "usage",
                    "model": "claude-opus-4-6",
                    "prompt_tokens": 1000,
                    "completion_tokens": 200,
                    "total_tokens": 1200,
                    "llm_calls": 2,
                    "timestamp": "2026-02-25T14:00:00",
                },
            ])

            db.migrate_from_jsonl(tmpdir)
            result = db.get_session_usage("cli:direct")
            rec = result["records"][0]
            assert rec["started_at"] == "2026-02-25T14:00:00"
            assert rec["finished_at"] == "2026-02-25T14:00:00"

    def test_idempotent_migration(self, db):
        """Running migration twice should not create duplicate records."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_test_jsonl(tmpdir, "cli_direct.jsonl", [
                {
                    "_type": "usage",
                    "model": "claude-opus-4-6",
                    "prompt_tokens": 1000,
                    "completion_tokens": 200,
                    "total_tokens": 1200,
                    "llm_calls": 2,
                    "timestamp": "2026-02-26T10:00:00",
                },
            ])

            stats1 = db.migrate_from_jsonl(tmpdir)
            assert stats1["migrated"] == 1

            stats2 = db.migrate_from_jsonl(tmpdir)
            assert stats2["migrated"] == 0
            assert stats2["skipped"] == 1

            result = db.get_global_usage()
            assert result["total_llm_calls"] == 2  # Not doubled

    def test_multiple_sessions(self, db):
        """Migration handles multiple JSONL files correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_test_jsonl(tmpdir, "cli_direct.jsonl", [
                {
                    "_type": "usage", "model": "m1",
                    "prompt_tokens": 100, "completion_tokens": 50,
                    "total_tokens": 150, "llm_calls": 1,
                    "timestamp": "2026-02-26T10:00:00",
                },
            ])
            self._create_test_jsonl(tmpdir, "webchat_999.jsonl", [
                {
                    "_type": "usage", "model": "m2",
                    "prompt_tokens": 200, "completion_tokens": 100,
                    "total_tokens": 300, "llm_calls": 2,
                    "timestamp": "2026-02-26T11:00:00",
                },
                {
                    "_type": "usage", "model": "m2",
                    "prompt_tokens": 300, "completion_tokens": 150,
                    "total_tokens": 450, "llm_calls": 3,
                    "timestamp": "2026-02-26T12:00:00",
                },
            ])

            stats = db.migrate_from_jsonl(tmpdir)
            assert stats["migrated"] == 3

            result = db.get_global_usage()
            assert result["total_tokens"] == 900  # 150+300+450
            assert len(result["by_session"]) == 2

    def test_nonexistent_directory(self, db):
        stats = db.migrate_from_jsonl("/nonexistent/path")
        assert stats["migrated"] == 0
        assert stats["errors"] == 0

    def test_skips_non_usage_records(self, db):
        """Only _type: 'usage' records should be migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._create_test_jsonl(tmpdir, "cli_direct.jsonl", [
                {"_type": "metadata", "key": "cli:direct"},
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
                {"_type": "consolidated", "summary": "some summary"},
            ])

            stats = db.migrate_from_jsonl(tmpdir)
            assert stats["migrated"] == 0
            assert stats["skipped"] == 0


# ── Edge Cases ──

class TestEdgeCases:
    def test_concurrent_writes_same_connection(self, db):
        """Multiple writes in sequence should all succeed."""
        for i in range(100):
            db.record_usage(
                session_key=f"session:{i % 5}",
                model="test-model",
                prompt_tokens=100 * i,
                completion_tokens=50 * i,
                total_tokens=150 * i,
                llm_calls=1,
                started_at=f"2026-02-26T{i:02d}:00:00",
                finished_at=f"2026-02-26T{i:02d}:00:30",
            )

        result = db.get_global_usage()
        assert result["total_llm_calls"] == 100
        assert len(result["by_session"]) == 5

    def test_file_based_db(self):
        """Test with actual file-based SQLite (not :memory:)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            db = AnalyticsDB(db_path=db_path)

            db.record_usage("s1", "m1", 100, 50, 150, 1,
                           "2026-01-01T00:00:00", "2026-01-01T00:00:30")

            # Re-open to verify persistence
            db2 = AnalyticsDB(db_path=db_path)
            result = db2.get_global_usage()
            assert result["total_tokens"] == 150

    def test_unicode_in_model_name(self, db):
        """Model names with special characters should work."""
        db.record_usage("s1", "anthropic/claude-opus-4-6", 100, 50, 150, 1,
                       "2026-01-01T00:00:00", "2026-01-01T00:00:30")
        result = db.get_global_usage()
        assert "anthropic/claude-opus-4-6" in result["by_model"]

    def test_zero_values(self, db):
        """Records with all zero values should be stored correctly."""
        db.record_usage("s1", "m1", 0, 0, 0, 0,
                       "2026-01-01T00:00:00", "2026-01-01T00:00:30")
        result = db.get_session_usage("s1")
        assert result["total_tokens"] == 0
        assert len(result["records"]) == 1


# ── Cache Fields Tests ──

class TestCacheFields:
    """Tests for cache_creation_input_tokens / cache_read_input_tokens columns."""

    def test_schema_has_cache_columns(self, db):
        """Fresh DB should have cache columns in schema."""
        conn = db._connect()
        cols = {row[1] for row in conn.execute("PRAGMA table_info(token_usage)")}
        assert "cache_creation_input_tokens" in cols
        assert "cache_read_input_tokens" in cols

    def test_default_cache_values_in_record(self, db):
        """record_usage() without cache params should default to 0."""
        db.record_usage("s1", "m1", 100, 50, 150, 1,
                       "2026-01-01T00:00:00", "2026-01-01T00:00:30")
        conn = db._connect()
        row = conn.execute(
            "SELECT cache_creation_input_tokens, cache_read_input_tokens FROM token_usage WHERE id=1"
        ).fetchone()
        assert row["cache_creation_input_tokens"] == 0
        assert row["cache_read_input_tokens"] == 0

    def test_global_usage_includes_cache_totals(self, db):
        """get_global_usage() should include cache aggregation."""
        result = db.get_global_usage()
        assert "total_cache_creation_input_tokens" in result
        assert "total_cache_read_input_tokens" in result
        assert result["total_cache_creation_input_tokens"] == 0
        assert result["total_cache_read_input_tokens"] == 0

    def test_global_usage_cache_aggregation_with_data(self, db):
        """Cache totals should aggregate correctly across records."""
        # Simulate nanobot core writing cache data directly to SQLite
        conn = db._connect()
        conn.execute(
            """INSERT INTO token_usage
               (session_key, model, prompt_tokens, completion_tokens, total_tokens,
                llm_calls, started_at, finished_at,
                cache_creation_input_tokens, cache_read_input_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("s1", "claude-opus-4-6", 10000, 2000, 12000, 3,
             "2026-03-09T10:00:00", "2026-03-09T10:01:00", 5000, 3000),
        )
        conn.execute(
            """INSERT INTO token_usage
               (session_key, model, prompt_tokens, completion_tokens, total_tokens,
                llm_calls, started_at, finished_at,
                cache_creation_input_tokens, cache_read_input_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("s1", "claude-opus-4-6", 15000, 3000, 18000, 5,
             "2026-03-09T11:00:00", "2026-03-09T11:02:00", 2000, 8000),
        )
        conn.commit()

        result = db.get_global_usage()
        assert result["total_cache_creation_input_tokens"] == 7000  # 5000+2000
        assert result["total_cache_read_input_tokens"] == 11000  # 3000+8000

    def test_session_usage_includes_cache_fields(self, db):
        """get_session_usage() records should include cache fields."""
        conn = db._connect()
        conn.execute(
            """INSERT INTO token_usage
               (session_key, model, prompt_tokens, completion_tokens, total_tokens,
                llm_calls, started_at, finished_at,
                cache_creation_input_tokens, cache_read_input_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("s1", "m1", 100, 50, 150, 1,
             "2026-03-09T10:00:00", "2026-03-09T10:00:30", 30, 20),
        )
        conn.commit()

        result = db.get_session_usage("s1")
        assert len(result["records"]) == 1
        rec = result["records"][0]
        assert rec["cache_creation_input_tokens"] == 30
        assert rec["cache_read_input_tokens"] == 20

    def test_daily_usage_includes_cache_fields(self, db):
        """get_daily_usage() should include cache aggregation per day."""
        conn = db._connect()
        conn.execute(
            """INSERT INTO token_usage
               (session_key, model, prompt_tokens, completion_tokens, total_tokens,
                llm_calls, started_at, finished_at,
                cache_creation_input_tokens, cache_read_input_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("s1", "m1", 100, 50, 150, 1,
             "2026-03-09T10:00:00", "2026-03-09T10:00:30", 40, 60),
        )
        conn.commit()

        result = db.get_daily_usage(days=7)
        assert len(result) == 1
        assert result[0]["cache_creation_input_tokens"] == 40
        assert result[0]["cache_read_input_tokens"] == 60

    def test_by_model_includes_cache_fields(self, db):
        """by_model in get_global_usage() should include cache aggregation."""
        conn = db._connect()
        conn.execute(
            """INSERT INTO token_usage
               (session_key, model, prompt_tokens, completion_tokens, total_tokens,
                llm_calls, started_at, finished_at,
                cache_creation_input_tokens, cache_read_input_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("s1", "claude-opus-4-6", 100, 50, 150, 1,
             "2026-03-09T10:00:00", "2026-03-09T10:00:30", 10, 20),
        )
        conn.commit()

        result = db.get_global_usage()
        opus = result["by_model"]["claude-opus-4-6"]
        assert opus["cache_creation_input_tokens"] == 10
        assert opus["cache_read_input_tokens"] == 20


class TestCacheMigration:
    """Tests for _migrate() adding cache columns to old databases."""

    def test_migration_adds_cache_columns(self):
        """Fresh DB should have cache columns (CREATE TABLE includes them)."""
        db = AnalyticsDB(db_path=":memory:")
        conn = db._connect()
        cols = {row[1] for row in conn.execute("PRAGMA table_info(token_usage)")}
        assert "cache_creation_input_tokens" in cols
        assert "cache_read_input_tokens" in cols

    def test_migration_on_file_db_without_cache_columns(self):
        """File-based old DB without cache columns should be migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "old.db")

            # Create old-schema DB manually
            conn = sqlite3.connect(db_path)
            conn.executescript("""
                CREATE TABLE token_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_key TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    llm_calls INTEGER DEFAULT 0,
                    started_at TEXT NOT NULL,
                    finished_at TEXT NOT NULL
                );
            """)
            conn.execute(
                """INSERT INTO token_usage
                   (session_key, model, prompt_tokens, completion_tokens,
                    total_tokens, llm_calls, started_at, finished_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                ("old_session", "gpt-4", 100, 50, 150, 1,
                 "2026-01-01T00:00:00", "2026-01-01T00:00:30"),
            )
            conn.commit()

            # Verify old schema lacks cache columns
            old_cols = {row[1] for row in conn.execute("PRAGMA table_info(token_usage)")}
            assert "cache_creation_input_tokens" not in old_cols
            conn.close()

            # Open with AnalyticsDB — should trigger migration
            db = AnalyticsDB(db_path=db_path)

            # Verify columns now exist
            conn2 = sqlite3.connect(db_path)
            conn2.row_factory = sqlite3.Row
            new_cols = {row[1] for row in conn2.execute("PRAGMA table_info(token_usage)")}
            assert "cache_creation_input_tokens" in new_cols
            assert "cache_read_input_tokens" in new_cols

            # Old row should have default 0
            row = conn2.execute(
                "SELECT cache_creation_input_tokens, cache_read_input_tokens "
                "FROM token_usage WHERE session_key='old_session'"
            ).fetchone()
            assert row[0] == 0
            assert row[1] == 0
            conn2.close()

            # Queries should work
            result = db.get_global_usage()
            assert result["total_cache_creation_input_tokens"] == 0
            assert result["total_cache_read_input_tokens"] == 0

    def test_migration_idempotent(self):
        """Running migration twice should not error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            db1 = AnalyticsDB(db_path=db_path)
            # Second init triggers _migrate again
            db2 = AnalyticsDB(db_path=db_path)
            result = db2.get_global_usage()
            assert result["total_cache_creation_input_tokens"] == 0


class TestPeriodFilter:
    """Test time period filtering for get_global_usage and get_daily_usage."""

    def test_period_filter_helper(self):
        where, params = AnalyticsDB._period_filter(None)
        assert where == ''
        assert params == ()

        where, params = AnalyticsDB._period_filter('all')
        assert where == ''
        assert params == ()

        where, params = AnalyticsDB._period_filter('7d')
        assert 'WHERE' in where
        assert '-7 days' in params[0]

        where, params = AnalyticsDB._period_filter('invalid')
        assert where == ''

    def test_global_usage_with_period(self):
        db = AnalyticsDB(db_path=":memory:")
        from datetime import datetime, timedelta
        now = datetime.now()
        old = now - timedelta(days=10)
        recent = now - timedelta(hours=12)

        db.record_usage("s1", "m1", 100, 50, 150, 1, old.isoformat(), old.isoformat())
        db.record_usage("s2", "m1", 200, 100, 300, 1, recent.isoformat(), recent.isoformat())

        # All time
        r = db.get_global_usage(period='all')
        assert r['total_tokens'] == 450

        # Last day — only recent
        r = db.get_global_usage(period='1d')
        assert r['total_tokens'] == 300

        # Last 7 days — only recent
        r = db.get_global_usage(period='7d')
        assert r['total_tokens'] == 300

        # Last 30 days — both
        r = db.get_global_usage(period='30d')
        assert r['total_tokens'] == 450

    def test_daily_usage_with_period(self):
        db = AnalyticsDB(db_path=":memory:")
        from datetime import datetime, timedelta
        now = datetime.now()
        old = now - timedelta(days=10)
        recent = now - timedelta(hours=6)

        db.record_usage("s1", "m1", 100, 50, 150, 1, old.isoformat(), old.isoformat())
        db.record_usage("s2", "m1", 200, 100, 300, 1, recent.isoformat(), recent.isoformat())

        # All time
        d = db.get_daily_usage(period='all')
        assert len(d) >= 1

        # Last day
        d = db.get_daily_usage(period='1d')
        total = sum(r['total_tokens'] for r in d)
        assert total == 300

    def test_global_usage_by_model_with_period(self):
        db = AnalyticsDB(db_path=":memory:")
        from datetime import datetime, timedelta
        now = datetime.now()
        old = now - timedelta(days=10)
        recent = now - timedelta(hours=6)

        db.record_usage("s1", "old_model", 100, 50, 150, 1, old.isoformat(), old.isoformat())
        db.record_usage("s2", "new_model", 200, 100, 300, 1, recent.isoformat(), recent.isoformat())

        r = db.get_global_usage(period='1d')
        assert 'new_model' in r['by_model']
        assert 'old_model' not in r['by_model']

    def test_global_usage_by_session_with_period(self):
        db = AnalyticsDB(db_path=":memory:")
        from datetime import datetime, timedelta
        now = datetime.now()
        old = now - timedelta(days=10)
        recent = now - timedelta(hours=6)

        db.record_usage("old_session", "m1", 100, 50, 150, 1, old.isoformat(), old.isoformat())
        db.record_usage("new_session", "m1", 200, 100, 300, 1, recent.isoformat(), recent.isoformat())

        r = db.get_global_usage(period='1d')
        session_ids = [s['session_id'] for s in r['by_session']]
        assert 'new_session' in session_ids
        assert 'old_session' not in session_ids
