"""
analytics.py — Token usage analytics with SQLite storage.

Provides AnalyticsDB class for recording and querying LLM token usage data.
Production DB: ~/.nanobot/workspace/analytics.db
Test DB: in-memory or temporary file (passed via db_path parameter).
"""

import glob
import json
import logging
import os
import sqlite3
from datetime import datetime

logger = logging.getLogger("analytics")

DEFAULT_DB_PATH = os.path.expanduser("~/.nanobot/workspace/analytics.db")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS token_usage (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key       TEXT NOT NULL,
    model             TEXT NOT NULL,
    prompt_tokens     INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens      INTEGER DEFAULT 0,
    llm_calls         INTEGER DEFAULT 0,
    started_at        TEXT NOT NULL,
    finished_at       TEXT NOT NULL,
    cache_creation_input_tokens INTEGER DEFAULT 0,
    cache_read_input_tokens     INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_usage_session  ON token_usage(session_key);
CREATE INDEX IF NOT EXISTS idx_usage_started  ON token_usage(started_at);
CREATE INDEX IF NOT EXISTS idx_usage_finished ON token_usage(finished_at);
CREATE INDEX IF NOT EXISTS idx_usage_model    ON token_usage(model);
"""

# Migration SQL for existing databases that lack cache columns.
_MIGRATION_SQL = [
    "ALTER TABLE token_usage ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0",
    "ALTER TABLE token_usage ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0",
]


class AnalyticsDB:
    """SQLite-backed token usage analytics database."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._ensure_dir()
        # For :memory: databases, keep a persistent connection
        # (each new connection to :memory: creates a separate empty database)
        self._persistent_conn = None
        if db_path == ":memory:":
            self._persistent_conn = sqlite3.connect(":memory:")
            self._persistent_conn.execute("PRAGMA journal_mode=WAL")
            self._persistent_conn.execute("PRAGMA foreign_keys=ON")
            self._persistent_conn.row_factory = sqlite3.Row
        self._ensure_schema()

    def _ensure_dir(self):
        """Create parent directory if needed (skip for :memory:)."""
        if self.db_path != ":memory:":
            os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        """Get a connection. For :memory:, returns the persistent connection."""
        if self._persistent_conn is not None:
            return self._persistent_conn
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self):
        """Create tables and indexes if they don't exist."""
        with self._connect() as conn:
            conn.executescript(SCHEMA_SQL)
            self._migrate(conn)

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        """Apply schema migrations for existing databases."""
        existing = {row[1] for row in conn.execute("PRAGMA table_info(token_usage)")}
        for sql in _MIGRATION_SQL:
            col_name = sql.split("ADD COLUMN")[1].strip().split()[0]
            if col_name not in existing:
                try:
                    conn.execute(sql)
                except sqlite3.OperationalError:
                    pass  # Column already exists (race condition)

    # ── Write ──

    def record_usage(
        self,
        session_key: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        llm_calls: int,
        started_at: str,
        finished_at: str,
    ) -> int:
        """Insert a usage record. Returns the new row id."""
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO token_usage
                    (session_key, model, prompt_tokens, completion_tokens,
                     total_tokens, llm_calls, started_at, finished_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (session_key, model, prompt_tokens, completion_tokens,
                 total_tokens, llm_calls, started_at, finished_at),
            )
            return cursor.lastrowid

    # ── Helpers ──

    @staticmethod
    def _period_filter(period: str | None) -> tuple[str, tuple]:
        """Build a SQL WHERE clause for time period filtering.

        Uses CST (UTC+8) natural-day boundaries for stable results:
        - '1d': from CST today 00:00 (= UTC yesterday 16:00) to now
        - '7d': from CST 7 days ago 00:00 to now
        - '30d': from CST 30 days ago 00:00 to now

        Args:
            period: '1d', '7d', '30d', or None/'all' for no filter.

        Returns:
            (where_clause, params) tuple for use in SQL queries.
        """
        if not period or period == 'all':
            return '', ()
        days_map = {'1d': 0, '7d': 6, '30d': 29}
        days_back = days_map.get(period)
        if days_back is None:
            return '', ()
        # CST 00:00 = UTC previous day 16:00
        # Start of CST today in UTC: datetime('now', '+8 hours', 'start of day', '-8 hours')
        # Then subtract days_back more days for 7d/30d
        if days_back == 0:
            # CST today 00:00 in UTC
            return ("WHERE started_at >= datetime('now', '+8 hours', 'start of day', '-8 hours')", ())
        else:
            return (
                "WHERE started_at >= datetime('now', '+8 hours', 'start of day', '-8 hours', ?)",
                (f'-{days_back} days',),
            )

    # ── Read: Global ──

    def get_global_usage(self, period: str | None = None) -> dict:
        """
        Aggregate usage across all sessions.

        Args:
            period: Time period filter — '1d', '7d', '30d', or None/all.
        """
        where_clause, params = self._period_filter(period)

        with self._connect() as conn:
            # Totals
            row = conn.execute(
                f"""
                SELECT COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
                       COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
                       COALESCE(SUM(total_tokens), 0) as total_tokens,
                       COALESCE(SUM(llm_calls), 0) as total_llm_calls,
                       COALESCE(SUM(cache_creation_input_tokens), 0) as total_cache_creation,
                       COALESCE(SUM(cache_read_input_tokens), 0) as total_cache_read
                FROM token_usage
                {where_clause}
                """,
                params,
            ).fetchone()

            totals = {
                "total_prompt_tokens": row["total_prompt_tokens"],
                "total_completion_tokens": row["total_completion_tokens"],
                "total_tokens": row["total_tokens"],
                "total_llm_calls": row["total_llm_calls"],
                "total_cache_creation_input_tokens": row["total_cache_creation"],
                "total_cache_read_input_tokens": row["total_cache_read"],
            }

            # By model
            by_model = {}
            for r in conn.execute(
                f"""
                SELECT model,
                       SUM(prompt_tokens) as prompt_tokens,
                       SUM(completion_tokens) as completion_tokens,
                       SUM(total_tokens) as total_tokens,
                       SUM(llm_calls) as llm_calls,
                       SUM(cache_creation_input_tokens) as cache_creation_input_tokens,
                       SUM(cache_read_input_tokens) as cache_read_input_tokens
                FROM token_usage
                {where_clause}
                GROUP BY model
                ORDER BY total_tokens DESC
                """,
                params,
            ):
                by_model[r["model"]] = {
                    "prompt_tokens": r["prompt_tokens"],
                    "completion_tokens": r["completion_tokens"],
                    "total_tokens": r["total_tokens"],
                    "llm_calls": r["llm_calls"],
                    "cache_creation_input_tokens": r["cache_creation_input_tokens"],
                    "cache_read_input_tokens": r["cache_read_input_tokens"],
                }

            # By session
            by_session = []
            for r in conn.execute(
                f"""
                SELECT session_key,
                       SUM(prompt_tokens) as prompt_tokens,
                       SUM(completion_tokens) as completion_tokens,
                       SUM(total_tokens) as total_tokens,
                       SUM(llm_calls) as llm_calls,
                       SUM(cache_creation_input_tokens) as cache_creation_input_tokens,
                       SUM(cache_read_input_tokens) as cache_read_input_tokens,
                       MAX(finished_at) as last_used
                FROM token_usage
                {where_clause}
                GROUP BY session_key
                ORDER BY total_tokens DESC
                """,
                params,
            ):
                by_session.append({
                    "session_id": r["session_key"],
                    "prompt_tokens": r["prompt_tokens"],
                    "completion_tokens": r["completion_tokens"],
                    "total_tokens": r["total_tokens"],
                    "llm_calls": r["llm_calls"],
                    "cache_creation_input_tokens": r["cache_creation_input_tokens"],
                    "cache_read_input_tokens": r["cache_read_input_tokens"],
                    "last_used": r["last_used"],
                })

            return {**totals, "by_model": by_model, "by_session": by_session}

    # ── Read: Per-session ──

    def get_session_usage(self, session_key: str) -> dict:
        """
        Usage for a single session.

        Returns:
        {
            "session_key": str,
            "prompt_tokens": int,
            "completion_tokens": int,
            "total_tokens": int,
            "llm_calls": int,
            "records": [ { id, model, prompt_tokens, completion_tokens, total_tokens, llm_calls, started_at, finished_at } ],
        }
        """
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
                       COALESCE(SUM(completion_tokens), 0) as completion_tokens,
                       COALESCE(SUM(total_tokens), 0) as total_tokens,
                       COALESCE(SUM(llm_calls), 0) as llm_calls,
                       COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation_input_tokens,
                       COALESCE(SUM(cache_read_input_tokens), 0) as cache_read_input_tokens
                FROM token_usage
                WHERE session_key = ?
                """,
                (session_key,),
            ).fetchone()

            records = []
            for r in conn.execute(
                """
                SELECT id, model, prompt_tokens, completion_tokens,
                       total_tokens, llm_calls, started_at, finished_at,
                       cache_creation_input_tokens, cache_read_input_tokens
                FROM token_usage
                WHERE session_key = ?
                ORDER BY started_at ASC
                """,
                (session_key,),
            ):
                records.append(dict(r))

            return {
                "session_key": session_key,
                "prompt_tokens": row["prompt_tokens"],
                "completion_tokens": row["completion_tokens"],
                "total_tokens": row["total_tokens"],
                "llm_calls": row["llm_calls"],
                "cache_creation_input_tokens": row["cache_creation_input_tokens"],
                "cache_read_input_tokens": row["cache_read_input_tokens"],
                "records": records,
            }

    # ── Read: Daily ──

    def get_daily_usage(self, days: int = 30, period: str | None = None) -> list:
        """
        Daily aggregated usage for the last N days or a period.

        Args:
            days: Number of days (legacy, used when period is None).
            period: '1d', '7d', '30d', or None/'all'. Overrides days if set.

        Returns list of:
        [ { "date": "2026-02-26", "prompt_tokens": int, "completion_tokens": int,
            "total_tokens": int, "llm_calls": int } ]
        """
        # Determine the WHERE clause
        if period and period != 'all':
            where_clause, params = self._period_filter(period)
            # For daily, filter by date(started_at) for cleaner grouping
            days_map = {'1d': 1, '7d': 7, '30d': 30}
            d = days_map.get(period, days)
            where_clause = "WHERE date(started_at) >= date('now', ?)"
            params = (f'-{d} days',)
        elif period == 'all':
            where_clause = ''
            params = ()
        else:
            where_clause = "WHERE date(started_at) >= date('now', ?)"
            params = (f'-{days} days',)

        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT date(started_at) as day,
                       SUM(prompt_tokens) as prompt_tokens,
                       SUM(completion_tokens) as completion_tokens,
                       SUM(total_tokens) as total_tokens,
                       SUM(llm_calls) as llm_calls,
                       SUM(cache_creation_input_tokens) as cache_creation_input_tokens,
                       SUM(cache_read_input_tokens) as cache_read_input_tokens
                FROM token_usage
                {where_clause}
                GROUP BY day
                ORDER BY day ASC
                """,
                params,
            ).fetchall()

            return [
                {
                    "date": r["day"],
                    "prompt_tokens": r["prompt_tokens"],
                    "completion_tokens": r["completion_tokens"],
                    "total_tokens": r["total_tokens"],
                    "llm_calls": r["llm_calls"],
                    "cache_creation_input_tokens": r["cache_creation_input_tokens"],
                    "cache_read_input_tokens": r["cache_read_input_tokens"],
                }
                for r in rows
            ]

    # ── Migration ──

    def migrate_from_jsonl(self, sessions_dir: str) -> dict:
        """
        Migrate _type: "usage" records from session JSONL files into SQLite.

        Uses (session_key, finished_at, model, total_tokens) as a dedup key
        to ensure idempotent migration.

        Returns: { "migrated": int, "skipped": int, "errors": int }
        """
        stats = {"migrated": 0, "skipped": 0, "errors": 0}

        if not os.path.isdir(sessions_dir):
            logger.warning(f"Sessions directory not found: {sessions_dir}")
            return stats

        # Load existing records for dedup
        existing = set()
        with self._connect() as conn:
            for r in conn.execute(
                "SELECT session_key, finished_at, model, total_tokens FROM token_usage"
            ):
                existing.add((r["session_key"], r["finished_at"], r["model"], r["total_tokens"]))

        for filepath in sorted(glob.glob(os.path.join(sessions_dir, "*.jsonl"))):
            filename = os.path.basename(filepath).replace(".jsonl", "")
            # Convert filename to session_key: cli_direct → cli:direct
            # webchat_1772030778 → webchat:1772030778
            parts = filename.split("_", 1)
            session_key = ":".join(parts) if len(parts) == 2 else filename

            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        if obj.get("_type") != "usage":
                            continue

                        model = obj.get("model", "unknown")
                        total_tokens = obj.get("total_tokens", 0)
                        # Old records have "timestamp", new ones have "started_at"/"finished_at"
                        finished_at = obj.get("finished_at", obj.get("timestamp", ""))
                        started_at = obj.get("started_at", finished_at)

                        if not finished_at:
                            stats["errors"] += 1
                            continue

                        # Dedup check
                        dedup_key = (session_key, finished_at, model, total_tokens)
                        if dedup_key in existing:
                            stats["skipped"] += 1
                            continue

                        self.record_usage(
                            session_key=session_key,
                            model=model,
                            prompt_tokens=obj.get("prompt_tokens", 0),
                            completion_tokens=obj.get("completion_tokens", 0),
                            total_tokens=total_tokens,
                            llm_calls=obj.get("llm_calls", 0),
                            started_at=started_at,
                            finished_at=finished_at,
                        )
                        existing.add(dedup_key)
                        stats["migrated"] += 1

            except Exception as e:
                logger.error(f"Failed to migrate {filepath}: {e}")
                stats["errors"] += 1

        logger.info(
            f"Migration complete: {stats['migrated']} migrated, "
            f"{stats['skipped']} skipped, {stats['errors']} errors"
        )
        return stats
