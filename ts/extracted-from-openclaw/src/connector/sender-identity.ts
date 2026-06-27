// Owned by Recoder. Contains the real `validateSenderIdentity` logic extracted
// verbatim from gateway-core/channels/sender-identity.ts, plus the owned
// `MsgContext`/`SenderIdentity` domain types it depends on. The original file
// imported `MsgContext` from a monorepo module (`../auto-reply/templating.js`)
// that was not part of the extraction; we own the structural type here so the
// real validation logic compiles without that missing dependency.

import { normalizeChatType } from "./chat-type.js";

/**
 * The unverified channel-side identity of a message sender. By the
 * hostile-by-default ingress contract (interop §2), nothing in here is trusted
 * until gating + device-auth bind it to a Recoder principal.
 */
export interface SenderIdentity {
  /** Stable per-channel sender id (telegram user id, slack user, etc.). */
  SenderId?: string;
  /** Human display name as reported by the channel. */
  SenderName?: string;
  /** Channel handle/username (without a leading "@"). */
  SenderUsername?: string;
  /** E.164 phone number for phone-based channels (signal/whatsapp/imessage). */
  SenderE164?: string;
}

/**
 * Minimal inbound message context the sender-identity validator inspects. This
 * is the owned, structural subset of the original gateway-core `MsgContext`.
 */
export interface MsgContext extends SenderIdentity {
  /** Raw channel chat type, normalized via {@link normalizeChatType}. */
  ChatType?: string;
}

/**
 * Validate the channel-reported sender identity, returning a list of issues
 * (empty = valid). Real logic extracted from gateway-core; unchanged behavior.
 */
export function validateSenderIdentity(ctx: MsgContext): string[] {
  const issues: string[] = [];

  const chatType = normalizeChatType(ctx.ChatType);
  const isDirect = chatType === "direct";

  const senderId = ctx.SenderId?.trim() || "";
  const senderName = ctx.SenderName?.trim() || "";
  const senderUsername = ctx.SenderUsername?.trim() || "";
  const senderE164 = ctx.SenderE164?.trim() || "";

  if (!isDirect) {
    if (!senderId && !senderName && !senderUsername && !senderE164) {
      issues.push("missing sender identity (SenderId/SenderName/SenderUsername/SenderE164)");
    }
  }

  if (senderE164) {
    if (!/^\+\d{3,}$/.test(senderE164)) {
      issues.push(`invalid SenderE164: ${senderE164}`);
    }
  }

  if (senderUsername) {
    if (senderUsername.includes("@")) {
      issues.push(`SenderUsername should not include "@": ${senderUsername}`);
    }
    if (/\s/.test(senderUsername)) {
      issues.push(`SenderUsername should not include whitespace: ${senderUsername}`);
    }
  }

  if (ctx.SenderId != null && !senderId) {
    issues.push("SenderId is set but empty");
  }

  return issues;
}
