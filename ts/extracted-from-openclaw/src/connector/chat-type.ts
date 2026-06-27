// Owned by Recoder. Extracted verbatim from gateway-core/channels/chat-type.ts
// (OpenClaw social-gateway core) — pure, zero-dependency channel chat-type
// normalization. No behavioral change; this is the real working logic.

/**
 * Wire-agnostic chat surface kind. Every connector normalizes its native
 * conversation type (Telegram chat.type, Slack channel_type, Discord channel
 * kind, etc.) down to one of these three.
 */
export type ChatType = "direct" | "group" | "channel";

/** Back-compat alias for the gateway-core name. */
export type NormalizedChatType = ChatType;

export function normalizeChatType(raw?: string): ChatType | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (value === "direct" || value === "dm") {
    return "direct";
  }
  if (value === "group") {
    return "group";
  }
  if (value === "channel") {
    return "channel";
  }
  return undefined;
}
