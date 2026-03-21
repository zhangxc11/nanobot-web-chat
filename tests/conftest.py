"""Shared fixtures for web-chat integration tests.

Provides mock objects and utilities to test worker.py components
without real LLM calls or nanobot core dependencies.
"""
import asyncio
import json
import os
import queue
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Async event loop fixture ──

@pytest.fixture
def event_loop():
    """Provide a fresh event loop for each test."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def run_async(event_loop):
    """Helper to run async coroutines in tests."""
    def _run(coro):
        return event_loop.run_until_complete(coro)
    return _run


# ── Temp directory fixtures ──

@pytest.fixture
def tmp_dir():
    """Provide a temporary directory that's cleaned up after the test."""
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def cron_store_path(tmp_dir):
    """Provide a temporary path for cron jobs.json."""
    return tmp_dir / "cron" / "jobs.json"


# ── Mock task registry ──

@pytest.fixture
def mock_task():
    """Create a mock task entry matching worker.py's task dict structure."""
    def _make(status='running', session_key='test:session1', progress=None, error=None):
        return {
            'status': status,
            'started_at': datetime.now().isoformat(),
            'finished_at': None,
            'progress': progress or [],
            'error': error,
            '_finished_ts': 0,
            '_sse_clients': [],
            '_sse_lock': threading.Lock(),
            '_usage': None,
            '_async_task': None,
            '_inject_queue': queue.Queue(),
        }
    return _make


# ── Mock CronExecutor ──

@pytest.fixture
def mock_executor():
    """Create a mock CronExecutor for testing CronService."""
    executor = MagicMock()
    executor.execute_job = AsyncMock(return_value=None)
    executor.send_to_session = AsyncMock(return_value=True)
    return executor
