import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.tools.sb_code_interpreter_tool import SandboxCodeInterpreterTool


@pytest.mark.asyncio
async def test_run_repl_uses_file_state_without_creating_daytona_session():
    tool = SandboxCodeInterpreterTool.__new__(SandboxCodeInterpreterTool)
    tool._ensure_sandbox = AsyncMock()
    tool._repl_file_fallback = AsyncMock(return_value=SimpleNamespace(success=True, output="ok"))
    tool._sandbox_info = SimpleNamespace(
        sandbox=SimpleNamespace(
            process=SimpleNamespace(create_session=AsyncMock(), execute_session_command=AsyncMock())
        )
    )

    result = await SandboxCodeInterpreterTool.run_repl(
        tool,
        code="x = 1",
        session_name="analysis",
        language="python",
        timeout=30,
    )

    assert result.success is True
    tool._repl_file_fallback.assert_awaited_once_with("x = 1", "analysis", "python", 30)
    tool.sandbox.process.create_session.assert_not_awaited()
    tool.sandbox.process.execute_session_command.assert_not_awaited()
