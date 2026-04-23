import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.tools.sb_git_sync import SandboxGitTool


@pytest.mark.asyncio
async def test_sb_git_sync_run_shell_uses_recovery_helpers(monkeypatch):
    create_calls = []
    exec_calls = []
    process = SimpleNamespace(delete_session=AsyncMock())

    async def fake_create_session_with_recovery(_sandbox, session_id):
        create_calls.append(session_id)

    async def fake_execute_session_command_with_recovery(_sandbox, session_id, req, timeout, recreate_session):
        exec_calls.append(
            {
                "session_id": session_id,
                "command": req.command,
                "timeout": timeout,
                "recreate_session": recreate_session,
            }
        )
        return SimpleNamespace(exit_code=0)

    monkeypatch.setattr(
        "core.tools.sb_git_sync.create_session_with_recovery",
        fake_create_session_with_recovery,
    )
    monkeypatch.setattr(
        "core.tools.sb_git_sync.execute_session_command_with_recovery",
        fake_execute_session_command_with_recovery,
    )

    tool = SandboxGitTool.__new__(SandboxGitTool)
    tool._sandbox_info = SimpleNamespace(sandbox=SimpleNamespace(process=process))
    tool._ensure_sandbox = AsyncMock()

    await SandboxGitTool._run_shell(tool, "git status")

    assert len(create_calls) == 1
    assert exec_calls[0]["session_id"] == create_calls[0]
    assert "bash -lc" in exec_calls[0]["command"]
    assert exec_calls[0]["timeout"] == 30
    assert exec_calls[0]["recreate_session"] is True
    process.delete_session.assert_awaited_once_with(create_calls[0])
