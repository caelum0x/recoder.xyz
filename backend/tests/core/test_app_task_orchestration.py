import os

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

import pytest

from core.agents.pipeline.stateless.coordinator.message_builder import MessageBuilder
from core.agents.pipeline.stateless.coordinator.stateless import StatelessCoordinator
from core.agents.pipeline.stateless.coordinator.tool_executor import ToolExecutor
from core.agents.pipeline.stateless.state import RunState


class _FakeToolRegistry:
    def get_available_functions(self):
        return {}


@pytest.mark.asyncio
async def test_tool_executor_records_app_task_progress(monkeypatch):
    merged = []

    async def _fake_merge(run_id, metadata):
        merged.append((run_id, metadata))
        return True

    monkeypatch.setattr(
        "core.agents.pipeline.stateless.coordinator.tool_executor.merge_agent_run_metadata",
        _fake_merge,
    )

    state = RunState("run-1", "thread-1", "project-1", "account-1")
    state.app_task_mode = True
    message_builder = MessageBuilder(
        increment_sequence=lambda: 0,
        get_thread_id=lambda: state.thread_id,
        get_thread_run_id=lambda: "thread-run-1",
        get_agent_id=lambda: None,
    )
    executor = ToolExecutor(state, _FakeToolRegistry(), message_builder)

    await executor._record_app_task_progress("create_file", "{}", {"ok": True})
    await executor._record_app_task_progress(
        "execute_command",
        '{"command":"npm install"}',
        {"output": "installed", "exit_code": 0},
    )
    await executor._record_app_task_progress(
        "execute_command",
        '{"command":"npm run dev -- --host 0.0.0.0 --port 5173"}',
        {"output": "ready", "exit_code": 0, "preview_url": "https://preview.example", "preview_port": 5173},
    )

    assert state.app_task_files_written is True
    assert state.app_task_deps_installed is True
    assert state.app_task_dev_server_started is True
    assert state.app_task_preview_verified is True
    assert state.app_task_preview_url == "https://preview.example"
    assert state.app_task_preview_port == 5173
    assert merged[-1][1]["preview_verified"] is True


@pytest.mark.asyncio
async def test_tool_executor_records_preview_pending_log_context(monkeypatch):
    merged = []

    async def _fake_merge(run_id, metadata):
        merged.append((run_id, metadata))
        return True

    monkeypatch.setattr(
        "core.agents.pipeline.stateless.coordinator.tool_executor.merge_agent_run_metadata",
        _fake_merge,
    )

    state = RunState("run-pending", "thread-pending", "project-pending", "account-pending")
    state.app_task_mode = True
    message_builder = MessageBuilder(
        increment_sequence=lambda: 0,
        get_thread_id=lambda: state.thread_id,
        get_thread_run_id=lambda: "thread-run-pending",
        get_agent_id=lambda: None,
    )
    executor = ToolExecutor(state, _FakeToolRegistry(), message_builder)

    await executor._record_app_task_progress(
        "execute_command",
        '{"command":"npm run dev -- --host 0.0.0.0 --port 5173"}',
        {
            "output": "started",
            "exit_code": 0,
            "preview_pending": True,
            "dev_server_log_tail": "VITE ready on http://localhost:5173/",
            "preview_port": 5173,
        },
    )

    assert state.app_task_dev_server_started is True
    assert state.app_task_preview_pending is True
    assert state.app_task_preview_port == 5173
    assert "localhost:5173" in state.app_task_dev_server_log_tail
    assert merged[-1][1]["preview_pending"] is True


@pytest.mark.asyncio
async def test_tool_executor_should_terminate_on_preview_only_for_app_tasks():
    app_state = RunState("run-2", "thread-2", "project-2", "account-2")
    app_state.app_task_mode = True
    regular_state = RunState("run-3", "thread-3", "project-3", "account-3")

    builder = MessageBuilder(
        increment_sequence=lambda: 0,
        get_thread_id=lambda: "thread",
        get_thread_run_id=lambda: "thread-run",
        get_agent_id=lambda: None,
    )

    app_executor = ToolExecutor(app_state, _FakeToolRegistry(), builder)
    regular_executor = ToolExecutor(regular_state, _FakeToolRegistry(), builder)

    assert await app_executor._should_terminate_on_preview({"preview_url": "https://preview.example"}) is True
    assert await regular_executor._should_terminate_on_preview({"preview_url": "https://preview.example"}) is False


def test_run_state_next_app_task_instruction_tracks_missing_step():
    state = RunState("run-4", "thread-4", "project-4", "account-4")
    state.app_task_mode = True

    state.record_app_task_progress(files_written=True)
    assert "dependency installation" in state.next_app_task_instruction()

    state.record_app_task_progress(deps_installed=True)
    assert "Start the dev server" in state.next_app_task_instruction()

    state.record_app_task_progress(dev_server_started=True)
    assert "preview is verified" in state.next_app_task_instruction()

    state.record_app_task_progress(preview_verified=True, preview_url="https://preview.example", preview_port=5173)
    assert state.next_app_task_instruction() is None


def test_run_state_next_app_task_instruction_includes_log_tail_when_preview_pending():
    state = RunState("run-4b", "thread-4b", "project-4b", "account-4b")
    state.app_task_mode = True
    state.record_app_task_progress(
        files_written=True,
        deps_installed=True,
        dev_server_started=True,
        preview_pending=True,
        preview_port=5173,
        dev_server_log_tail="VITE ready on http://localhost:5173/",
    )

    instruction = state.next_app_task_instruction()
    assert "dev server has been started but preview is not verified yet" in instruction
    assert "localhost:5173" in instruction


def test_stateless_coordinator_continues_only_for_incomplete_app_tasks():
    coordinator = StatelessCoordinator()
    state = RunState("run-5", "thread-5", "project-5", "account-5")
    coordinator._state = state

    assert coordinator._should_continue_incomplete_app_task("stop") is False

    state.app_task_mode = True
    state.record_app_task_progress(files_written=True, deps_installed=True)
    assert coordinator._should_continue_incomplete_app_task("stop") is True

    state.app_task_recovery_continues = 3
    assert coordinator._should_continue_incomplete_app_task("stop") is False

    state.app_task_recovery_continues = 0
    state.record_app_task_progress(preview_verified=True, preview_url="https://preview.example")
    assert coordinator._should_continue_incomplete_app_task("stop") is False
