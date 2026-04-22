import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

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

    assert "nohup bash -lc" in prepared
    assert "DEV_SERVER_STARTED" in prepared
    assert "npm start" in prepared


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
