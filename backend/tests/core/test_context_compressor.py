import pytest
from core.ai.context_compressor import compress_messages


def test_compress_preserves_system_prompt():
    messages = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "old message 1"},
        {"role": "assistant", "content": "old response 1"},
        {"role": "user", "content": "old message 2"},
        {"role": "assistant", "content": "old response 2"},
        {"role": "user", "content": "recent message"},
        {"role": "assistant", "content": "recent response"},
    ]
    result = compress_messages(messages, preserve_last_n=2)
    assert result[0]["role"] == "system"
    assert result[0]["content"] == "You are helpful"
    assert len(result) == 4  # system + summary + last 2 turns
    assert result[1]["role"] == "system"
    assert "summary" in result[1]["content"].lower() or "conversation" in result[1]["content"].lower()


def test_compress_no_op_when_few_messages():
    messages = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]
    result = compress_messages(messages, preserve_last_n=2)
    assert result == messages


def test_compress_preserves_tool_results():
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "old"},
        {"role": "assistant", "content": "old resp"},
        {"role": "user", "content": "recent"},
        {"role": "assistant", "content": "resp", "tool_calls": [{"id": "t1"}]},
        {"role": "tool", "content": "result", "tool_call_id": "t1"},
    ]
    result = compress_messages(messages, preserve_last_n=3)
    tool_msgs = [m for m in result if m["role"] == "tool"]
    assert len(tool_msgs) == 1
