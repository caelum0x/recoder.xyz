import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.sandbox.sandbox import get_or_start_sandbox


@pytest.mark.asyncio
async def test_get_or_start_sandbox_restarts_file_server_for_started_sandbox(monkeypatch):
    sandbox = SimpleNamespace(id="sb-1", state="started")

    monkeypatch.setattr(
        "core.sandbox.sandbox.daytona",
        SimpleNamespace(get=AsyncMock(return_value=sandbox)),
    )
    monkeypatch.setattr("core.sandbox.sandbox._ensure_workspace", AsyncMock())
    start_file_server = AsyncMock()
    monkeypatch.setattr("core.sandbox.sandbox.start_file_server", start_file_server)
    monkeypatch.setattr("core.sandbox.sandbox.start_computer_use_safe", AsyncMock())

    result = await get_or_start_sandbox("sb-1")

    assert result is sandbox
    start_file_server.assert_awaited_once_with(sandbox)


@pytest.mark.asyncio
async def test_start_file_server_restarts_when_probe_returns_dead_double_zero():
    from core.sandbox.sandbox import start_file_server

    process = SimpleNamespace(
        exec=AsyncMock(side_effect=[
            SimpleNamespace(result="000000"),
            SimpleNamespace(result=""),
            SimpleNamespace(result="200"),
        ])
    )
    sandbox = SimpleNamespace(process=process)

    await start_file_server(sandbox)

    assert process.exec.await_count == 3
    start_cmd = process.exec.await_args_list[1].args[0]
    assert "python3 -m http.server 8080" in start_cmd
