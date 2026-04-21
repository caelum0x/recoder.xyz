from types import SimpleNamespace

import pytest

from core.ai_models import model_manager
from core.services import llm
from core.services.llm import _normalize_message_for_provider


def test_normalize_tool_message_serializes_structured_content():
    message = {
        "role": "tool",
        "tool_call_id": "tool-1",
        "content": {"status": "ok", "items": [1, 2, 3]},
    }

    normalized = _normalize_message_for_provider(message)

    assert normalized["role"] == "tool"
    assert normalized["tool_call_id"] == "tool-1"
    assert normalized["content"] == '{"status": "ok", "items": [1, 2, 3]}'


def test_normalize_multimodal_content_converts_legacy_part_types():
    message = {
        "role": "user",
        "content": [
            {"type": "input_text", "text": "Describe this image"},
            {"type": "input_image", "image_url": {"url": "https://example.com/cat.png"}},
            {"type": "text", "text": "   "},
        ],
    }

    normalized = _normalize_message_for_provider(message)

    assert normalized["content"] == [
        {"type": "text", "text": "Describe this image"},
        {"type": "image_url", "image_url": {"url": "https://example.com/cat.png"}},
    ]


def test_normalize_empty_multimodal_content_drops_invalid_parts():
    message = {
        "role": "assistant",
        "content": [
            {"type": "text", "text": "   "},
            {"type": "image_url", "image_url": {"url": ""}},
            {},
        ],
    }

    normalized = _normalize_message_for_provider(message)

    assert normalized["content"] is None


@pytest.mark.asyncio
async def test_make_llm_api_call_normalizes_provider_payload(monkeypatch):
    captured: dict = {}

    class DummyLiteLLM:
        async def acompletion(self, **params):
            captured.update(params)
            return SimpleNamespace(usage=None)

    monkeypatch.setattr(llm, "_get_litellm", lambda: DummyLiteLLM())
    monkeypatch.setattr(llm, "_init_callbacks", lambda: None)
    monkeypatch.setattr(llm, "_save_debug_input", lambda params: None)
    monkeypatch.setattr(model_manager, "resolve_model_id", lambda model_name: model_name)
    monkeypatch.setattr(
        model_manager,
        "get_litellm_params",
        lambda model_name, **override_params: {"model": model_name, **override_params},
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "Describe this screenshot"},
                {"type": "input_image", "image_url": {"url": "https://example.com/screenshot.png"}},
            ],
            "message_id": "msg-user",
        },
        {
            "role": "tool",
            "tool_call_id": "tool-1",
            "content": {"status": "ok", "path": "/workspace/report.md"},
            "message_id": "msg-tool",
        },
    ]

    await llm.make_llm_api_call(
        messages=messages,
        model_name="google/gemini-2.5-pro",
        stream=False,
    )

    sanitized_messages = captured["messages"]

    assert sanitized_messages[0]["content"] == [
        {"type": "text", "text": "Describe this screenshot"},
        {"type": "image_url", "image_url": {"url": "https://example.com/screenshot.png"}},
    ]
    assert sanitized_messages[1]["content"] == '{"status": "ok", "path": "/workspace/report.md"}'
    assert all("message_id" not in message for message in sanitized_messages)
