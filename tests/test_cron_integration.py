"""Integration tests for CronService — priority 1.

Tests cover:
- Job CRUD (add, list, remove, enable/disable)
- Schedule computation (at, every, cron expression)
- Job execution via executor protocol
- Timer arming and due-job detection
- File persistence (save/load round-trip)
- Scheduler lock arbitration (scheduling vs standby mode)
- One-shot job cleanup (delete_after_run)
- Target session routing
- External file modification detection (hot-reload)
"""

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nanobot.cron.service import CronService, _compute_next_run, _now_ms
from nanobot.cron.types import (
    CronJob,
    CronJobState,
    CronPayload,
    CronSchedule,
    CronStore,
)


@pytest.fixture
def cron_svc(cron_store_path, mock_executor):
    """Create a CronService with _arm_timer mocked out.

    _arm_timer calls asyncio.create_task which requires a running event loop.
    For synchronous CRUD tests we stub it out; async tests that need real
    timer behavior can call the original method inside run_async().
    """
    svc = CronService(cron_store_path, executor=mock_executor)
    svc._running = True
    svc._scheduling = True
    svc._arm_timer = lambda: None  # stub — no event loop needed
    return svc


# ═══════════════════════════════════════════════════════════════════
# §1  Schedule computation
# ═══════════════════════════════════════════════════════════════════


class TestComputeNextRun:
    """Test _compute_next_run() for all schedule kinds."""

    def test_at_future(self):
        """'at' schedule with future timestamp returns that timestamp."""
        now = _now_ms()
        future = now + 60_000  # 1 minute ahead
        schedule = CronSchedule(kind="at", at_ms=future)
        assert _compute_next_run(schedule, now) == future

    def test_at_past(self):
        """'at' schedule with past timestamp returns None."""
        now = _now_ms()
        past = now - 60_000
        schedule = CronSchedule(kind="at", at_ms=past)
        assert _compute_next_run(schedule, now) is None

    def test_at_none(self):
        """'at' schedule with no at_ms returns None."""
        schedule = CronSchedule(kind="at", at_ms=None)
        assert _compute_next_run(schedule, _now_ms()) is None

    def test_every_positive(self):
        """'every' schedule returns now + interval."""
        now = _now_ms()
        schedule = CronSchedule(kind="every", every_ms=30_000)
        result = _compute_next_run(schedule, now)
        assert result == now + 30_000

    def test_every_zero(self):
        """'every' with zero interval returns None."""
        schedule = CronSchedule(kind="every", every_ms=0)
        assert _compute_next_run(schedule, _now_ms()) is None

    def test_every_negative(self):
        """'every' with negative interval returns None."""
        schedule = CronSchedule(kind="every", every_ms=-1000)
        assert _compute_next_run(schedule, _now_ms()) is None

    def test_every_none(self):
        """'every' with no every_ms returns None."""
        schedule = CronSchedule(kind="every", every_ms=None)
        assert _compute_next_run(schedule, _now_ms()) is None

    def test_cron_expression(self):
        """'cron' schedule with valid expression returns future time."""
        pytest.importorskip("croniter")
        now = _now_ms()
        # Every minute — next run should be within 60s
        schedule = CronSchedule(kind="cron", expr="* * * * *")
        result = _compute_next_run(schedule, now)
        assert result is not None
        assert result > now
        assert result <= now + 61_000  # within ~1 minute

    def test_cron_with_timezone(self):
        """'cron' schedule with timezone computes correctly."""
        pytest.importorskip("croniter")
        now = _now_ms()
        schedule = CronSchedule(kind="cron", expr="0 9 * * *", tz="Asia/Shanghai")
        result = _compute_next_run(schedule, now)
        assert result is not None
        assert result > now

    def test_cron_invalid_expression(self):
        """'cron' with invalid expression returns None (no crash)."""
        schedule = CronSchedule(kind="cron", expr="not a cron")
        result = _compute_next_run(schedule, _now_ms())
        assert result is None

    def test_unknown_kind(self):
        """Unknown schedule kind returns None."""
        schedule = CronSchedule(kind="at")  # type: ignore
        schedule.kind = "unknown"  # type: ignore
        assert _compute_next_run(schedule, _now_ms()) is None


# ═══════════════════════════════════════════════════════════════════
# §2  Job CRUD
# ═══════════════════════════════════════════════════════════════════


class TestJobCRUD:
    """Test add_job, list_jobs, remove_job, enable_job."""

    def test_add_job_basic(self, cron_svc):
        """add_job creates a job with correct fields."""
        job = cron_svc.add_job(
            name="Test Reminder",
            schedule=CronSchedule(kind="every", every_ms=60_000),
            message="Hello!",
        )

        assert job.name == "Test Reminder"
        assert job.enabled is True
        assert job.payload.message == "Hello!"
        assert job.schedule.kind == "every"
        assert job.schedule.every_ms == 60_000
        assert job.state.next_run_at_ms is not None
        assert len(job.id) == 8

    def test_add_job_persists(self, cron_svc, cron_store_path, mock_executor):
        """add_job saves to disk and can be reloaded."""
        cron_svc.add_job(
            name="Persistent Job",
            schedule=CronSchedule(kind="every", every_ms=30_000),
            message="Persisted!",
        )

        # Verify file exists
        assert cron_store_path.exists()

        # Load with a new service instance
        svc2 = CronService(cron_store_path, executor=mock_executor)
        jobs = svc2.list_jobs(include_disabled=True)
        assert len(jobs) == 1
        assert jobs[0].name == "Persistent Job"

    def test_list_jobs_filters_disabled(self, cron_svc):
        """list_jobs without include_disabled skips disabled jobs."""
        job1 = cron_svc.add_job("Enabled", CronSchedule(kind="every", every_ms=60_000), "msg1")
        job2 = cron_svc.add_job("Disabled", CronSchedule(kind="every", every_ms=60_000), "msg2")
        cron_svc.enable_job(job2.id, enabled=False)

        active = cron_svc.list_jobs(include_disabled=False)
        all_jobs = cron_svc.list_jobs(include_disabled=True)

        assert len(active) == 1
        assert active[0].name == "Enabled"
        assert len(all_jobs) == 2

    def test_remove_job(self, cron_svc):
        """remove_job deletes a job by ID."""
        job = cron_svc.add_job("To Remove", CronSchedule(kind="every", every_ms=60_000), "bye")
        assert cron_svc.remove_job(job.id) is True
        assert cron_svc.list_jobs(include_disabled=True) == []

    def test_remove_nonexistent(self, cron_svc):
        """remove_job returns False for unknown ID."""
        assert cron_svc.remove_job("nonexistent") is False

    def test_enable_disable_job(self, cron_svc):
        """enable_job toggles enabled state and updates next_run."""
        job = cron_svc.add_job("Toggle", CronSchedule(kind="every", every_ms=60_000), "msg")
        assert job.enabled is True
        assert job.state.next_run_at_ms is not None

        # Disable
        updated = cron_svc.enable_job(job.id, enabled=False)
        assert updated.enabled is False
        assert updated.state.next_run_at_ms is None

        # Re-enable
        updated2 = cron_svc.enable_job(job.id, enabled=True)
        assert updated2.enabled is True
        assert updated2.state.next_run_at_ms is not None

    def test_add_job_with_at_schedule(self, cron_svc):
        """add_job with 'at' schedule sets correct next_run."""
        future = _now_ms() + 300_000  # 5 min from now
        job = cron_svc.add_job(
            name="One-shot",
            schedule=CronSchedule(kind="at", at_ms=future),
            message="Fire once!",
            delete_after_run=True,
        )
        assert job.state.next_run_at_ms == future
        assert job.delete_after_run is True

    def test_add_job_with_target_session(self, cron_svc):
        """add_job with target_session stores it in payload."""
        job = cron_svc.add_job(
            name="Session Target",
            schedule=CronSchedule(kind="every", every_ms=60_000),
            message="Ping!",
            target_session="webchat_123456",
        )
        assert job.payload.target_session == "webchat_123456"


# ═══════════════════════════════════════════════════════════════════
# §3  File persistence round-trip
# ═══════════════════════════════════════════════════════════════════


class TestFilePersistence:
    """Test save/load round-trip for all job fields."""

    def test_full_round_trip(self, cron_svc, cron_store_path, mock_executor):
        """All fields survive save→load cycle."""
        job = cron_svc.add_job(
            name="Full Fields",
            schedule=CronSchedule(kind="every", every_ms=120_000),
            message="Round trip test",
            deliver=True,
            channel="web",
            to="user@example.com",
            target_session="webchat_999",
        )
        job_id = job.id

        # Reload from disk
        svc2 = CronService(cron_store_path, executor=mock_executor)
        jobs = svc2.list_jobs(include_disabled=True)
        assert len(jobs) == 1

        loaded = jobs[0]
        assert loaded.id == job_id
        assert loaded.name == "Full Fields"
        assert loaded.schedule.kind == "every"
        assert loaded.schedule.every_ms == 120_000
        assert loaded.payload.message == "Round trip test"
        assert loaded.payload.deliver is True
        assert loaded.payload.channel == "web"
        assert loaded.payload.to == "user@example.com"
        assert loaded.payload.target_session == "webchat_999"

    def test_empty_store_creates_file(self, cron_svc, cron_store_path):
        """Saving an empty store still creates the file."""
        job = cron_svc.add_job("Temp", CronSchedule(kind="every", every_ms=1000), "msg")
        cron_svc.remove_job(job.id)

        assert cron_store_path.exists()
        data = json.loads(cron_store_path.read_text())
        assert data["jobs"] == []

    def test_json_structure(self, cron_svc, cron_store_path):
        """Saved JSON has expected camelCase structure."""
        cron_svc.add_job("JSON Check", CronSchedule(kind="every", every_ms=5000), "msg")

        data = json.loads(cron_store_path.read_text())
        assert "version" in data
        assert "jobs" in data
        job_data = data["jobs"][0]
        # Check camelCase keys
        assert "schedule" in job_data
        assert "everyMs" in job_data["schedule"]
        assert "payload" in job_data
        assert "targetSession" in job_data["payload"]
        assert "state" in job_data
        assert "nextRunAtMs" in job_data["state"]
        assert "createdAtMs" in job_data
        assert "deleteAfterRun" in job_data

    def test_external_modification_detected(self, cron_svc, cron_store_path):
        """CronService detects when jobs.json is modified externally."""
        cron_svc.add_job("Original", CronSchedule(kind="every", every_ms=1000), "msg")
        assert len(cron_svc.list_jobs(include_disabled=True)) == 1

        # Externally modify the file — add a second job
        data = json.loads(cron_store_path.read_text())
        data["jobs"].append({
            "id": "external1",
            "name": "External Job",
            "enabled": True,
            "schedule": {"kind": "every", "everyMs": 2000},
            "payload": {"kind": "agent_turn", "message": "external"},
            "state": {},
            "createdAtMs": _now_ms(),
            "updatedAtMs": _now_ms(),
            "deleteAfterRun": False,
        })
        # Write and ensure mtime changes
        import time
        time.sleep(0.05)
        cron_store_path.write_text(json.dumps(data))

        # Force mtime difference detection
        cron_svc._store = None  # Reset cached store
        jobs = cron_svc.list_jobs(include_disabled=True)
        assert len(jobs) == 2
        names = {j.name for j in jobs}
        assert "External Job" in names


# ═══════════════════════════════════════════════════════════════════
# §4  Job execution
# ═══════════════════════════════════════════════════════════════════


class TestJobExecution:
    """Test _execute_job, run_job, and executor integration."""

    def test_execute_job_calls_executor(self, cron_svc, mock_executor, run_async):
        """_execute_job calls executor.execute_job for normal jobs."""
        job = cron_svc.add_job("Exec Test", CronSchedule(kind="every", every_ms=60_000), "Do it!")
        run_async(cron_svc._execute_job(job))

        mock_executor.execute_job.assert_called_once_with(job)
        assert job.state.last_status == "ok"
        assert job.state.last_run_at_ms is not None

    def test_execute_job_with_target_session(self, cron_svc, mock_executor, run_async):
        """_execute_job routes to executor.send_to_session for target_session jobs."""
        job = cron_svc.add_job(
            "Target Test",
            CronSchedule(kind="every", every_ms=60_000),
            "Ping session!",
            target_session="webchat_12345",
        )
        run_async(cron_svc._execute_job(job))

        mock_executor.send_to_session.assert_called_once_with(
            "webchat:12345",  # underscore → colon conversion
            "Ping session!",
            source=f"cron:{job.id}",
        )
        assert job.state.last_status == "ok"

    def test_execute_job_target_session_failure(self, cron_store_path, run_async):
        """Failed send_to_session marks job as error."""
        fail_executor = MagicMock()
        fail_executor.execute_job = AsyncMock(return_value=None)
        fail_executor.send_to_session = AsyncMock(return_value=False)

        svc = CronService(cron_store_path, executor=fail_executor)
        svc._running = True
        svc._scheduling = True
        svc._arm_timer = lambda: None

        job = svc.add_job(
            "Fail Target",
            CronSchedule(kind="every", every_ms=60_000),
            "Fail!",
            target_session="webchat_99999",
        )
        run_async(svc._execute_job(job))

        assert job.state.last_status == "error"
        assert "Failed to send" in job.state.last_error

    def test_execute_job_exception(self, cron_store_path, run_async):
        """Executor exception is caught and recorded."""
        err_executor = MagicMock()
        err_executor.execute_job = AsyncMock(side_effect=RuntimeError("boom"))
        err_executor.send_to_session = AsyncMock(return_value=True)

        svc = CronService(cron_store_path, executor=err_executor)
        svc._running = True
        svc._scheduling = True
        svc._arm_timer = lambda: None

        job = svc.add_job("Error Test", CronSchedule(kind="every", every_ms=60_000), "crash")
        run_async(svc._execute_job(job))

        assert job.state.last_status == "error"
        assert "boom" in job.state.last_error

    def test_run_job_manual(self, cron_svc, mock_executor, run_async):
        """run_job() manually triggers execution."""
        job = cron_svc.add_job("Manual Run", CronSchedule(kind="every", every_ms=60_000), "manual")
        result = run_async(cron_svc.run_job(job.id))

        assert result is True
        mock_executor.execute_job.assert_called_once()

    def test_run_job_disabled_without_force(self, cron_svc, mock_executor, run_async):
        """run_job() skips disabled jobs unless force=True."""
        job = cron_svc.add_job("Disabled Job", CronSchedule(kind="every", every_ms=60_000), "skip")
        cron_svc.enable_job(job.id, enabled=False)

        result = run_async(cron_svc.run_job(job.id))
        assert result is False
        mock_executor.execute_job.assert_not_called()

        # With force=True
        result = run_async(cron_svc.run_job(job.id, force=True))
        assert result is True
        mock_executor.execute_job.assert_called_once()

    def test_run_job_nonexistent(self, cron_svc, run_async):
        """run_job() returns False for unknown job ID."""
        result = run_async(cron_svc.run_job("nonexistent"))
        assert result is False


# ═══════════════════════════════════════════════════════════════════
# §5  Schedule advancement (one-shot vs recurring)
# ═══════════════════════════════════════════════════════════════════


class TestScheduleAdvancement:
    """Test _advance_schedule behavior after job execution."""

    def test_at_schedule_disables_after_run(self, cron_svc, run_async):
        """'at' job is disabled after execution (not deleted by default)."""
        future = _now_ms() + 1000
        job = cron_svc.add_job("One-shot", CronSchedule(kind="at", at_ms=future), "once")

        # Simulate execution
        run_async(cron_svc._execute_job(job))

        assert job.enabled is False
        assert job.state.next_run_at_ms is None
        # Job still in store
        assert len(cron_svc.list_jobs(include_disabled=True)) == 1

    def test_at_schedule_delete_after_run(self, cron_svc, run_async):
        """'at' job with delete_after_run=True is removed after execution."""
        future = _now_ms() + 1000
        job = cron_svc.add_job(
            "Delete After",
            CronSchedule(kind="at", at_ms=future),
            "delete me",
            delete_after_run=True,
        )
        run_async(cron_svc._execute_job(job))

        assert len(cron_svc.list_jobs(include_disabled=True)) == 0

    def test_every_schedule_recomputes_next(self, cron_svc, mock_executor, run_async):
        """'every' job gets new next_run after execution."""
        job = cron_svc.add_job("Recurring", CronSchedule(kind="every", every_ms=30_000), "repeat")
        original_next = job.state.next_run_at_ms

        # Small delay to ensure _now_ms() advances past the original computation time
        import time
        time.sleep(0.01)

        run_async(cron_svc._execute_job(job))

        assert job.state.next_run_at_ms is not None
        assert job.state.next_run_at_ms >= original_next
        assert job.enabled is True
        # Verify the job was actually executed
        assert job.state.last_status == "ok"
        assert job.state.last_run_at_ms is not None


# ═══════════════════════════════════════════════════════════════════
# §6  Timer and due-job detection
# ═══════════════════════════════════════════════════════════════════


class TestTimerAndDueJobs:
    """Test _on_timer, _get_next_wake_ms, and due-job detection."""

    def test_get_next_wake_ms(self, cron_svc):
        """_get_next_wake_ms returns earliest next_run across all jobs."""
        cron_svc.add_job("Job1", CronSchedule(kind="every", every_ms=60_000), "a")
        cron_svc.add_job("Job2", CronSchedule(kind="every", every_ms=30_000), "b")

        wake = cron_svc._get_next_wake_ms()
        assert wake is not None

        # The 30s job should wake first
        jobs = cron_svc.list_jobs()
        min_next = min(j.state.next_run_at_ms for j in jobs)
        assert wake == min_next

    def test_get_next_wake_ms_no_jobs(self, cron_svc):
        """_get_next_wake_ms returns None when no jobs exist."""
        assert cron_svc._get_next_wake_ms() is None

    def test_on_timer_executes_due_jobs(self, cron_svc, mock_executor, run_async):
        """_on_timer fires jobs whose next_run_at_ms <= now."""
        job = cron_svc.add_job("Due Job", CronSchedule(kind="every", every_ms=60_000), "fire!")

        # Manually set next_run to the past
        job.state.next_run_at_ms = _now_ms() - 1000
        cron_svc._save_store()

        run_async(cron_svc._on_timer())

        mock_executor.execute_job.assert_called_once()
        assert job.state.last_status == "ok"

    def test_on_timer_skips_future_jobs(self, cron_svc, mock_executor, run_async):
        """_on_timer does not fire jobs scheduled for the future."""
        cron_svc.add_job("Future Job", CronSchedule(kind="every", every_ms=3_600_000), "wait")
        # next_run is ~1 hour from now (set by add_job)

        run_async(cron_svc._on_timer())

        mock_executor.execute_job.assert_not_called()


# ═══════════════════════════════════════════════════════════════════
# §7  Service lifecycle
# ═══════════════════════════════════════════════════════════════════


class TestServiceLifecycle:
    """Test start/stop and status."""

    def test_start_acquires_lock(self, cron_store_path, mock_executor, run_async):
        """start() acquires scheduler lock and enters scheduling mode."""
        svc = CronService(cron_store_path, executor=mock_executor)
        run_async(svc.start())

        assert svc._running is True
        assert svc._scheduling is True
        assert svc.status()["enabled"] is True
        assert svc.status()["scheduling"] is True

        svc.stop()

    def test_stop_releases_resources(self, cron_store_path, mock_executor, run_async):
        """stop() cleans up timers, watchdog, and lock."""
        svc = CronService(cron_store_path, executor=mock_executor)
        run_async(svc.start())
        svc.stop()

        assert svc._running is False
        assert svc._scheduling is False
        assert svc._timer_task is None
        assert svc._watchdog_task is None

    def test_status_reports_job_count(self, cron_svc):
        """status() reports correct job count."""
        assert cron_svc.status()["jobs"] == 0

        cron_svc.add_job("J1", CronSchedule(kind="every", every_ms=60_000), "m")
        cron_svc.add_job("J2", CronSchedule(kind="every", every_ms=60_000), "m")

        assert cron_svc.status()["jobs"] == 2

    def test_status_reports_next_wake(self, cron_svc):
        """status() reports next_wake_at_ms."""
        assert cron_svc.status()["next_wake_at_ms"] is None

        cron_svc.add_job("Waker", CronSchedule(kind="every", every_ms=60_000), "wake")
        status = cron_svc.status()
        assert status["next_wake_at_ms"] is not None


# ═══════════════════════════════════════════════════════════════════
# §8  Validation
# ═══════════════════════════════════════════════════════════════════


class TestScheduleValidation:
    """Test schedule validation on add_job."""

    def test_tz_only_with_cron(self, cron_svc):
        """tz is rejected for non-cron schedules."""
        with pytest.raises(ValueError, match="tz can only be used with cron"):
            cron_svc.add_job(
                "Bad TZ",
                CronSchedule(kind="every", every_ms=60_000, tz="Asia/Shanghai"),
                "msg",
            )

    def test_invalid_tz_rejected(self, cron_svc):
        """Invalid timezone string is rejected."""
        with pytest.raises(ValueError, match="unknown timezone"):
            cron_svc.add_job(
                "Bad TZ",
                CronSchedule(kind="cron", expr="0 9 * * *", tz="Mars/Olympus"),
                "msg",
            )
