import asyncio
import sys
from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_create_new_thread_records_includes_effective_model(monkeypatch):
    monkeypatch.setenv("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
    captured = {}

    async def fake_create_thread_with_message_and_run(**kwargs):
        captured.update(kwargs)
        return {
            "project_id": kwargs["project_id"],
            "thread_id": kwargs["thread_id"],
            "agent_run_id": kwargs["agent_run_id"],
        }

    async def fake_delete_pending_thread(thread_id):
        return None

    async def fake_increment_thread_count_cache(account_id):
        return None

    async def fake_generate_and_update_project_name(**kwargs):
        return None

    async def fake_generate_and_update_thread_name(**kwargs):
        return None

    def fake_create_task(coro):
        coro.close()
        return SimpleNamespace(cancel=lambda: None)

    monkeypatch.setitem(
        sys.modules,
        "core.threads.repo",
        SimpleNamespace(create_thread_with_message_and_run=fake_create_thread_with_message_and_run),
    )
    monkeypatch.setitem(
        sys.modules,
        "core.cache.runtime_cache",
        SimpleNamespace(
            delete_pending_thread=fake_delete_pending_thread,
            increment_thread_count_cache=fake_increment_thread_count_cache,
            get_cached_project_metadata=lambda *args, **kwargs: None,
            set_cached_project_metadata=lambda *args, **kwargs: None,
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "core.utils.project_helpers",
        SimpleNamespace(generate_and_update_project_name=fake_generate_and_update_project_name),
    )
    monkeypatch.setitem(
        sys.modules,
        "core.utils.thread_name_generator",
        SimpleNamespace(generate_and_update_thread_name=fake_generate_and_update_thread_name),
    )
    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    from core.agents.runner.setup_manager import create_new_thread_records

    await create_new_thread_records(
        project_id="project-1",
        thread_id="thread-1",
        account_id="user-1",
        prompt="Build a React app",
        agent_run_id="run-1",
        message_content="Build a React app",
        agent_config={"agent_id": "agent-1", "agent_version_id": "version-1"},
        effective_model="recoder/kimi-k2",
        metadata={"mode": "canvas"},
        memory_enabled=True,
    )

    assert captured["run_metadata"]["model_name"] == "recoder/kimi-k2"
    assert captured["run_metadata"]["actual_user_id"] == "user-1"
    assert captured["run_metadata"]["mode"] == "canvas"


@pytest.mark.asyncio
async def test_llm_executor_reports_non_free_model_rate_limit(monkeypatch):
    from core.agentpress.thread_manager.services.execution.llm_executor import LLMExecutor
    from core.services.llm import LLMError

    async def always_rate_limited(*args, **kwargs):
        raise LLMError("429 upstream rate limit")

    monkeypatch.setattr(
        "core.agentpress.thread_manager.services.execution.llm_executor.make_llm_api_call",
        always_rate_limited,
    )

    executor = LLMExecutor()
    result = await executor.execute(
        prepared_messages=[{"role": "user", "content": "hello"}],
        llm_model="recoder/kimi-k2",
        llm_temperature=0.2,
        llm_max_tokens=1000,
        openapi_tool_schemas=None,
        tool_choice="auto",
        native_tool_calling=False,
        xml_tool_calling=False,
        stream=False,
    )

    assert result["status"] == "error"
    assert "selected model (recoder/kimi-k2) is temporarily rate-limited" in result["message"]


@pytest.mark.asyncio
async def test_llm_executor_keeps_free_model_rate_limit_message(monkeypatch):
    from core.agentpress.thread_manager.services.execution.llm_executor import LLMExecutor
    from core.services.llm import LLMError

    async def always_rate_limited(*args, **kwargs):
        raise LLMError("429 upstream rate limit")

    monkeypatch.setattr(
        "core.agentpress.thread_manager.services.execution.llm_executor.make_llm_api_call",
        always_rate_limited,
    )

    executor = LLMExecutor()
    result = await executor.execute(
        prepared_messages=[{"role": "user", "content": "hello"}],
        llm_model="openrouter/stepfun/step-3.5-flash:free",
        llm_temperature=0.2,
        llm_max_tokens=1000,
        openapi_tool_schemas=None,
        tool_choice="auto",
        native_tool_calling=False,
        xml_tool_calling=False,
        stream=False,
    )

    assert result["status"] == "error"
    assert "All free models are currently rate-limited" in result["message"]
