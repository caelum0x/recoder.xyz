import os
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.tools.session_exec_tool import SandboxSessionExecTool, AUTO_SESSION_IDLE_TTL_SECONDS


@pytest.mark.asyncio
async def test_auto_session_is_reused_before_idle_ttl(monkeypatch):
    tool = SandboxSessionExecTool("project-1")
    tool._create_session = AsyncMock()
    tool._delete_session = AsyncMock()

    now = 1_000.0
    monkeypatch.setattr("core.tools.session_exec_tool.time.time", lambda: now)

    sid1 = await tool._ensure_auto_session()
    sid2 = await tool._ensure_auto_session()

    assert sid1 == sid2
    tool._create_session.assert_awaited_once()
    tool._delete_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_auto_session_is_recycled_after_idle_ttl(monkeypatch):
    tool = SandboxSessionExecTool("project-2")
    tool._create_session = AsyncMock()
    tool._delete_session = AsyncMock()

    clock = {"now": 1_000.0}
    monkeypatch.setattr("core.tools.session_exec_tool.time.time", lambda: clock["now"])

    sid1 = await tool._ensure_auto_session()
    clock["now"] += AUTO_SESSION_IDLE_TTL_SECONDS + 1
    sid2 = await tool._ensure_auto_session()

    assert sid1 != sid2
    tool._create_session.assert_awaited()
    tool._delete_session.assert_awaited_once_with(sid1)


@pytest.mark.asyncio
async def test_session_destroy_clears_auto_session_tracking():
    tool = SandboxSessionExecTool("project-3")
    tool._ensure_sandbox = AsyncMock()
    tool._delete_session = AsyncMock()
    tool._auto_session_id = "auto-1234"
    tool._auto_session_last_used_at = 1_234.0

    result = await tool.session_destroy()

    assert result.success is True
    assert tool._auto_session_id is None
    assert tool._auto_session_last_used_at is None
