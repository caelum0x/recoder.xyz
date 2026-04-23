import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.sandbox.sandbox import get_or_start_sandbox, get_user_facing_preview_url


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


@pytest.mark.asyncio
async def test_get_user_facing_preview_url_prefers_signed_link(monkeypatch):
    sandbox = SimpleNamespace(id="sb-signed", get_preview_link=AsyncMock())
    monkeypatch.setattr(
        "core.sandbox.sandbox.get_signed_preview_url",
        AsyncMock(return_value="https://8080-signed-token.sandbox.recoder.xyz"),
    )

    url = await get_user_facing_preview_url(sandbox, 8080)

    assert url == "https://8080-signed-token.sandbox.recoder.xyz"
    sandbox.get_preview_link.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_user_facing_preview_url_falls_back_to_standard_link(monkeypatch):
    sandbox = SimpleNamespace(
        id="sb-fallback",
        get_preview_link=AsyncMock(return_value=SimpleNamespace(url="https://8080-sb-fallback.sandbox.recoder.xyz")),
    )
    monkeypatch.setattr(
        "core.sandbox.sandbox.get_signed_preview_url",
        AsyncMock(side_effect=RuntimeError("signed preview unavailable")),
    )

    url = await get_user_facing_preview_url(sandbox, 8080)

    assert url == "https://8080-sb-fallback.sandbox.recoder.xyz"
    sandbox.get_preview_link.assert_awaited_once()
