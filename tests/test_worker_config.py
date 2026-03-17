"""Test worker.py configuration alignment with nanobot core.

Ensures _create_runner() and _get_subagent_manager() correctly reference
config fields (e.g. config.spawn.max_concurrency, not config.tools.max_concurrency).

These tests catch config path typos that would only surface at runtime.
"""
import ast
import inspect
import re
import sys
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ── Paths ──
WORKER_PY = Path(__file__).parent.parent / "worker.py"


class TestWorkerConfigPaths:
    """Verify that worker.py references valid config attribute paths."""

    def _get_worker_source(self) -> str:
        return WORKER_PY.read_text()

    def _extract_function_source(self, func_name: str) -> str:
        """Extract the source of a top-level function from worker.py."""
        source = self._get_worker_source()
        # Use AST to find function boundaries
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
                lines = source.splitlines()
                return "\n".join(lines[node.lineno - 1 : node.end_lineno])
        raise ValueError(f"Function {func_name} not found in worker.py")

    def _find_config_references(self, source: str) -> list[str]:
        """Find all config.X.Y.Z references in source code (excluding imports)."""
        refs = []
        for line in source.splitlines():
            stripped = line.strip()
            # Skip import lines
            if stripped.startswith("from ") or stripped.startswith("import "):
                continue
            # Skip comments
            if stripped.startswith("#"):
                continue
            refs.extend(re.findall(r'\bconfig\.\w+(?:\.\w+)*', line))
        return refs

    def test_create_runner_config_paths(self):
        """All config.X.Y references in _create_runner() must be valid."""
        from nanobot.config.loader import load_config
        config = load_config()

        source = self._extract_function_source("_create_runner")
        refs = self._find_config_references(source)
        assert len(refs) > 0, "_create_runner should reference config"

        errors = []
        for ref in refs:
            parts = ref.split(".")
            obj = config
            try:
                for part in parts[1:]:  # skip "config"
                    obj = getattr(obj, part)
            except AttributeError as e:
                errors.append(f"{ref}: {e}")

        assert not errors, f"Invalid config references in _create_runner():\n" + "\n".join(errors)

    def test_get_subagent_manager_config_paths(self):
        """All config.X.Y references in _get_subagent_manager() must be valid."""
        from nanobot.config.loader import load_config
        config = load_config()

        source = self._extract_function_source("_get_subagent_manager")
        refs = self._find_config_references(source)
        assert len(refs) > 0, "_get_subagent_manager should reference config"

        errors = []
        for ref in refs:
            parts = ref.split(".")
            obj = config
            try:
                for part in parts[1:]:
                    obj = getattr(obj, part)
            except AttributeError as e:
                errors.append(f"{ref}: {e}")

        assert not errors, f"Invalid config references in _get_subagent_manager():\n" + "\n".join(errors)


class TestSubagentManagerParamAlignment:
    """Verify worker's SubagentManager creation passes all required params."""

    def test_subagent_manager_params_match_core(self):
        """Worker _get_subagent_manager() should pass all non-default params
        that gateway AgentLoop.__init__() passes to SubagentManager."""
        from nanobot.agent.subagent import SubagentManager

        sig = inspect.signature(SubagentManager.__init__)
        # Get params that have no default (required) or are commonly needed
        core_params = set()
        for name, param in sig.parameters.items():
            if name == "self":
                continue
            core_params.add(name)

        # Extract param names passed in _get_subagent_manager()
        source = WORKER_PY.read_text()
        tree = ast.parse(source)

        worker_params = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "_get_subagent_manager":
                # Find SubagentManager(...) call inside
                for child in ast.walk(node):
                    if isinstance(child, ast.Call):
                        func = child.func
                        # Check if it's SubagentManager(...)
                        if isinstance(func, ast.Name) and func.id == "SubagentManager":
                            for kw in child.keywords:
                                worker_params.add(kw.arg)
                            break
                break

        assert worker_params, "Could not find SubagentManager() call in _get_subagent_manager()"

        # These params are expected to differ (worker uses different objects)
        # but the param name should still be present
        missing = core_params - worker_params
        # Some params are intentionally omitted (e.g. default_max_iterations uses default)
        known_optional = {"default_max_iterations"}
        unexpected_missing = missing - known_optional

        if unexpected_missing:
            pytest.fail(
                f"SubagentManager params missing in worker _get_subagent_manager():\n"
                f"  Missing: {sorted(unexpected_missing)}\n"
                f"  Worker passes: {sorted(worker_params)}\n"
                f"  Core expects: {sorted(core_params)}"
            )


class TestAgentLoopParamAlignment:
    """Verify worker's AgentLoop creation passes all params that gateway does."""

    def test_create_runner_passes_key_params(self):
        """_create_runner() should pass the same key params as gateway's AgentLoop creation."""
        from nanobot.agent.loop import AgentLoop

        sig = inspect.signature(AgentLoop.__init__)
        core_params = {name for name in sig.parameters if name != "self"}

        # Extract param names from _create_runner()'s AgentLoop(...) call
        source = WORKER_PY.read_text()
        tree = ast.parse(source)

        worker_params = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "_create_runner":
                for child in ast.walk(node):
                    if isinstance(child, ast.Call):
                        func = child.func
                        if isinstance(func, ast.Name) and func.id == "AgentLoop":
                            for kw in child.keywords:
                                worker_params.add(kw.arg)
                            break
                break

        assert worker_params, "Could not find AgentLoop() call in _create_runner()"

        # Key params that worker MUST pass (not just optional ones)
        required_params = {
            "reasoning_effort", "brave_api_key", "web_proxy",
            "read_file_hard_limit", "spawn_max_concurrency",
            "detail_logger", "usage_recorder", "session_manager",
            "exec_config", "restrict_to_workspace", "cron_service",
        }

        missing_required = required_params - worker_params
        if missing_required:
            pytest.fail(
                f"AgentLoop key params missing in worker _create_runner():\n"
                f"  Missing: {sorted(missing_required)}\n"
                f"  Worker passes: {sorted(worker_params)}"
            )


class TestErrorMessageFiltering:
    """Verify that persisted error messages are filtered from LLM history."""

    def test_type_error_filtered_from_history(self):
        """_type='error' messages persisted by Plan C should not be sent to LLM."""
        from nanobot.session.manager import Session

        session = Session(key="test:error_filter")
        session.messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "do something"},
            {"_type": "error", "content": "⚠️ Sorry, I encountered an error: Connection timeout"},
            {"role": "user", "content": "try again"},
        ]
        session.last_consolidated = 0

        history = session.get_history()
        contents = [m.get("content") for m in history]

        assert "⚠️ Sorry, I encountered an error: Connection timeout" not in contents
        assert "hello" in contents
        assert "Hi there!" in contents
        assert "try again" in contents

    def test_llm_error_still_filtered(self):
        """Existing 'Error calling LLM:' messages should still be filtered."""
        from nanobot.session.manager import Session

        session = Session(key="test:llm_error")
        session.messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "Error calling LLM: rate limit exceeded"},
            {"role": "user", "content": "retry"},
        ]
        session.last_consolidated = 0

        history = session.get_history()
        contents = [m["content"] for m in history]

        assert "Error calling LLM: rate limit exceeded" not in contents
        assert "hello" in contents
        assert "retry" in contents

    def test_normal_messages_not_filtered(self):
        """Normal assistant messages should not be affected by error filtering."""
        from nanobot.session.manager import Session

        session = Session(key="test:normal")
        session.messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "Sorry, I can't help with that."},
            {"role": "assistant", "content": "⚠️ This is a warning about something."},
        ]
        session.last_consolidated = 0

        history = session.get_history()
        contents = [m["content"] for m in history]

        assert "Sorry, I can't help with that." in contents
        # This should NOT be filtered — it doesn't match the exact error prefix
        assert "⚠️ This is a warning about something." in contents
