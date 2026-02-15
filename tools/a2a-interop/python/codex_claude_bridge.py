from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any

PROTOCOL_VERSION = "0.3.0"
ENVELOPE_VERSION = "2026-02-14"


@dataclass
class AgentIdentity:
    id: str
    name: str
    platform: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def codex_to_envelope(
    message: dict[str, Any],
    sender: AgentIdentity,
    receiver: AgentIdentity,
    message_id: str,
    thread_id: str,
) -> dict[str, Any]:
    role = str(message.get("role", "user"))
    if role == "assistant":
        intent = "tool_result"
    elif role == "system":
        intent = "plan"
    else:
        intent = "execute"

    return {
        "envelopeVersion": ENVELOPE_VERSION,
        "protocolVersion": PROTOCOL_VERSION,
        "messageId": message_id,
        "threadId": thread_id,
        "createdAt": _now_iso(),
        "from": asdict(sender),
        "to": asdict(receiver),
        "intent": intent,
        "payload": [{"kind": "text", "text": str(message.get("content", ""))}],
        "metadata": message.get("metadata", {}),
    }


def envelope_to_claude_code(envelope: dict[str, Any]) -> dict[str, Any]:
    payload = envelope.get("payload", [])
    text = ""
    for part in payload:
        if isinstance(part, dict) and part.get("kind") == "text":
            text = str(part.get("text", ""))
            break

    return {
        "role": "assistant" if envelope.get("intent") == "tool_result" else "user",
        "content": [{"type": "text", "text": text}],
        "metadata": envelope.get("metadata", {}),
    }


if __name__ == "__main__":
    envelope = codex_to_envelope(
        message={"role": "user", "content": "Sync rollout status with recoder-web."},
        sender=AgentIdentity(id="codex-1", name="Codex", platform="codex"),
        receiver=AgentIdentity(id="claude-1", name="Claude Code", platform="claude_code"),
        message_id="msg-001",
        thread_id="thread-001",
    )

    print(envelope)
    print(envelope_to_claude_code(envelope))
