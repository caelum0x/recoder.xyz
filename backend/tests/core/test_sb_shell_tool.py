import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from core.sandbox.sandbox import create_session_with_recovery, execute_session_command_with_recovery
from core.tools.sb_shell_tool import SandboxShellTool


def test_shell_tool_prefers_direct_session_for_js_commands():
    assert SandboxShellTool._should_use_direct_session("npx create-vite@latest my-app")
    assert SandboxShellTool._should_use_direct_session("npm install")
    assert SandboxShellTool._should_use_direct_session("pnpm dev")
    assert not SandboxShellTool._should_use_direct_session("git status")


def test_shell_tool_wraps_command_with_node_bootstrap():
    wrapped = SandboxShellTool._wrap_command_for_shell(
        "npx create-vite@latest my-app",
        "/workspace/my app",
    )

    assert 'export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"' in wrapped
    assert "/usr/local/nvm/nvm.sh" in wrapped
    assert "/home/daytona/.nvm/nvm.sh" in wrapped
    assert "command -v node" in wrapped
    assert "cd '/workspace/my app'" in wrapped
    assert "npx create-vite@latest my-app" in wrapped


def test_shell_tool_backgrounds_foreground_dev_server_commands():
    prepared = SandboxShellTool._prepare_command("npm start")

    assert "tmux new-session -d -s recoder-dev-server" in prepared
    assert "DEV_SERVER_STARTED" in prepared
    assert "npm start" in prepared


def test_shell_tool_candidate_preview_ports_prioritize_expected_ports():
    assert SandboxShellTool._candidate_preview_ports("npm start")[:2] == [3000, 5173]
    assert SandboxShellTool._candidate_preview_ports("vite --host 0.0.0.0 --port 4173")[:2] == [4173, 5173]


@pytest.mark.asyncio
async def test_shell_tool_attaches_preview_metadata_when_probe_succeeds():
    process = SimpleNamespace(
        exec=AsyncMock(return_value=SimpleNamespace(result="200")),
    )
    tool = SandboxShellTool.__new__(SandboxShellTool)
    tool._sandbox_info = SimpleNamespace(
        sandbox=SimpleNamespace(
            process=process,
            get_preview_link=AsyncMock(return_value=SimpleNamespace(url="https://preview.example")),
        )
    )
    tool._candidate_preview_ports = lambda _command: [3000]

    payload = await tool._maybe_attach_preview_info({}, "npm run dev")

    assert payload["background_process_started"] is True
    assert payload["preview_port"] == 3000
    assert payload["preview_url"] == "https://preview.example"
    assert payload["preview_pending"] is False


@pytest.mark.asyncio
async def test_shell_tool_attaches_log_tail_when_preview_is_pending():
    process = SimpleNamespace(
        exec=AsyncMock(side_effect=[
            *[SimpleNamespace(result="000") for _ in range(12)],
            SimpleNamespace(result=""),  # tmux probe
            SimpleNamespace(result="ready on http://localhost:5173"),  # log tail probe
        ]),
    )
    tool = SandboxShellTool.__new__(SandboxShellTool)
    tool._sandbox_info = SimpleNamespace(
        sandbox=SimpleNamespace(
            process=process,
            get_preview_link=AsyncMock(),
        )
    )
    tool._candidate_preview_ports = lambda _command: [5173]

    payload = await tool._maybe_attach_preview_info({}, "vite --host 0.0.0.0 --port 5173")

    assert payload["background_process_started"] is True
    assert payload["preview_pending"] is True
    assert payload["dev_server_log_path"] == "/tmp/recoder-devserver.log"
    assert "localhost:5173" in payload["dev_server_log_tail"]


@pytest.mark.asyncio
async def test_shell_tool_wrapped_fallback_uses_relative_session_cwd(monkeypatch):
    captured = {}

    class FakeSessionExecuteRequest:
        def __init__(self, command, var_async, cwd):
            captured["command"] = command
            captured["cwd"] = cwd
            self.command = command
            self.var_async = var_async
            self.cwd = cwd

    process = SimpleNamespace(
        create_session=AsyncMock(),
        execute_session_command=AsyncMock(return_value=SimpleNamespace(cmd_id="cmd-1", exit_code=0)),
        get_session_command_logs=AsyncMock(return_value=SimpleNamespace(output="ok")),
        delete_session=AsyncMock(),
    )

    tool = SandboxShellTool.__new__(SandboxShellTool)
    tool._sandbox_info = SimpleNamespace(sandbox=SimpleNamespace(process=process))
    tool.workspace_path = "/workspace"
    monkeypatch.setattr(sys.modules["daytona_sdk"], "SessionExecuteRequest", FakeSessionExecuteRequest)

    result = await tool._fallback_execute("echo hello", "/workspace", 30, wrapped=True)

    assert result.success is True
    assert captured["cwd"] == "."
    assert captured["command"] == "echo hello"


@pytest.mark.asyncio
async def test_create_session_with_recovery_cleans_and_retries_on_enospc():
    process = SimpleNamespace(
        create_session=AsyncMock(side_effect=[
            RuntimeError("mkdir /home/daytona/.daytona/sessions/test: no space left on device"),
            None,
        ]),
        exec=AsyncMock(return_value=SimpleNamespace(result="/home/daytona/.daytona/sessions/old-session")),
    )
    sandbox = SimpleNamespace(process=process)

    await create_session_with_recovery(sandbox, "sess-123")

    assert process.create_session.await_count == 2
    process.exec.assert_awaited()


@pytest.mark.asyncio
async def test_create_session_with_recovery_treats_conflict_after_cleanup_as_success():
    process = SimpleNamespace(
        create_session=AsyncMock(side_effect=[
            RuntimeError("mkdir /home/daytona/.daytona/sessions/test: no space left on device"),
            RuntimeError("conflict: session already exists"),
        ]),
        exec=AsyncMock(return_value=SimpleNamespace(result="/home/daytona/.daytona/sessions/old-session")),
    )
    sandbox = SimpleNamespace(process=process)

    await create_session_with_recovery(sandbox, "sess-456")

    assert process.create_session.await_count == 2
    process.exec.assert_awaited()


@pytest.mark.asyncio
async def test_execute_session_command_with_recovery_recreates_after_enospc():
    process = SimpleNamespace(
        execute_session_command=AsyncMock(side_effect=[
            RuntimeError("failed to create log directory: mkdir /home/daytona/.daytona/sessions/test: no space left on device"),
            RuntimeError("failed to create log directory: mkdir /home/daytona/.daytona/sessions/test: no space left on device"),
            SimpleNamespace(cmd_id="cmd-1", exit_code=0),
        ]),
        exec=AsyncMock(return_value=SimpleNamespace(result="/home/daytona/.daytona/sessions/old-session")),
        delete_session=AsyncMock(),
        create_session=AsyncMock(return_value=None),
    )
    sandbox = SimpleNamespace(process=process)

    result = await execute_session_command_with_recovery(
        sandbox,
        session_id="sess-789",
        req=SimpleNamespace(command="echo hi"),
        timeout=30,
        recreate_session=True,
    )

    assert result.exit_code == 0
    assert process.execute_session_command.await_count == 3
    process.delete_session.assert_awaited_once()
    assert process.create_session.await_count == 1
