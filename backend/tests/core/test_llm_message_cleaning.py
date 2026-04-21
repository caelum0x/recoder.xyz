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
