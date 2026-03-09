from typing import Any


def compress_messages(
    messages: list[dict[str, Any]],
    preserve_last_n: int = 4,
    max_summary_tokens: int = 500,
) -> list[dict[str, Any]]:
    """Compress older messages into a summary, preserving recent turns and system prompts."""
    if len(messages) <= preserve_last_n + 1:
        return messages

    system_msgs = [m for m in messages if m["role"] == "system"]
    non_system = [m for m in messages if m["role"] != "system"]

    if len(non_system) <= preserve_last_n:
        return messages

    to_compress = non_system[:-preserve_last_n]
    to_preserve = non_system[-preserve_last_n:]

    # Check if preserved messages reference tool calls — pull those in
    preserved_tool_ids = set()
    for m in to_preserve:
        if m.get("tool_calls"):
            for tc in m["tool_calls"]:
                preserved_tool_ids.add(tc.get("id"))
        if m.get("tool_call_id"):
            preserved_tool_ids.add(m["tool_call_id"])

    # Move tool messages that are referenced by preserved messages
    moved_to_preserve = []
    final_compress = []
    for m in to_compress:
        if m.get("tool_call_id") and m["tool_call_id"] in preserved_tool_ids:
            moved_to_preserve.append(m)
        elif m.get("tool_calls"):
            tc_ids = {tc.get("id") for tc in m["tool_calls"]}
            if tc_ids & preserved_tool_ids:
                moved_to_preserve.append(m)
            else:
                final_compress.append(m)
        else:
            final_compress.append(m)

    if not final_compress:
        return messages

    summary_lines = []
    for m in final_compress:
        role = m["role"]
        content = m.get("content", "")
        if content and len(content) > 200:
            content = content[:200] + "..."
        if content:
            summary_lines.append(f"[{role}]: {content}")

    summary_text = (
        "[Conversation Summary — older messages compressed]\n"
        + "\n".join(summary_lines)
    )

    summary_msg = {"role": "system", "content": summary_text}

    return system_msgs + [summary_msg] + moved_to_preserve + to_preserve
