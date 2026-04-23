import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.sandbox.pool_service import SandboxPoolService


@pytest.mark.asyncio
async def test_ping_sandbox_uses_recovery_helpers_and_deletes_session(monkeypatch):
    process = SimpleNamespace(delete_session=AsyncMock())
    sandbox = SimpleNamespace(process=process, state="started")

    create_calls = []
    execute_calls = []

    async def fake_get(_sandbox_id):
        return sandbox

    async def fake_create_session_with_recovery(_sandbox, session_id):
        create_calls.append(session_id)

    async def fake_execute_session_command_with_recovery(_sandbox, session_id, req, timeout, recreate_session):
        execute_calls.append(
            {
                "session_id": session_id,
                "command": req.command,
                "timeout": timeout,
                "recreate_session": recreate_session,
            }
        )
        return SimpleNamespace(exit_code=0)

    monkeypatch.setattr(
        "core.sandbox.pool_service.daytona",
        SimpleNamespace(get=fake_get),
    )
    monkeypatch.setattr(
        "core.sandbox.pool_service.create_session_with_recovery",
        fake_create_session_with_recovery,
    )
    monkeypatch.setattr(
        "core.sandbox.pool_service.execute_session_command_with_recovery",
        fake_execute_session_command_with_recovery,
    )

    service = SandboxPoolService()
    result = await service._ping_sandbox("sandbox-1")

    assert result is True
    assert len(create_calls) == 1
    assert execute_calls[0]["session_id"] == create_calls[0]
    assert execute_calls[0]["command"] == service.KEEPALIVE_COMMAND
    assert execute_calls[0]["timeout"] == 15
    assert execute_calls[0]["recreate_session"] is True
    process.delete_session.assert_awaited_once_with(create_calls[0])


@pytest.mark.asyncio
async def test_ping_sandbox_skips_non_started_sandbox(monkeypatch):
    process = SimpleNamespace(delete_session=AsyncMock())
    sandbox = SimpleNamespace(process=process, state="stopped")

    monkeypatch.setattr(
        "core.sandbox.pool_service.daytona",
        SimpleNamespace(get=AsyncMock(return_value=sandbox)),
    )
    create_session = AsyncMock()
    monkeypatch.setattr("core.sandbox.pool_service.create_session_with_recovery", create_session)

    service = SandboxPoolService()
    result = await service._ping_sandbox("sandbox-2")

    assert result is False
    create_session.assert_not_awaited()
    process.delete_session.assert_not_awaited()
