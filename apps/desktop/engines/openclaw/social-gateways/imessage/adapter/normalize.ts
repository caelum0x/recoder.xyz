// Owned by Recoder. The pure normalize step of the iMessage ConnectorPort:
// converts one `imsg` watch notification payload (an IMessagePayload row from
// the Messages chat.db) into the wire-agnostic NormalizedInboundMessage. The
// field mapping is extracted verbatim from the real monitor provider
// (social-gateways/imessage/monitor/monitor-provider.ts, `handleMessageNow`):
//   - sender             = message.sender (normalized via normalizeIMessageHandle)
//   - group vs dm        = message.is_group (chat_id required when group)
//   - bodyText           = message.text || <media:kind> placeholder
//   - conversationId     = group ? chat_id : `imessage:<sender>`
//   - messageId          = message.id
//   - timestamp          = Date.parse(message.created_at)
//   - attachments        = original_path-bearing, non-missing attachments
//   - wasMentioned       = direct messages are addressed to the bot (true);
//                          group @-mention detection is the gating layer's job
// Echoes from the bot itself (is_from_me), sender-less rows, group rows missing a
// chat_id, and empty bodies with no media produce no actionable message (return
// undefined) — exactly as the real provider short-circuits them.

import type { ChatType } from "../../../src/connector/chat-type.js";
import type {
  InboundAttachment,
  NormalizedInboundMessage,
} from "../../../src/connector/inbound-message.js";
import type { SenderIdentity } from "../../../src/connector/sender-identity.js";
import { normalizeE164, normalizeIMessageHandle } from "./targets.js";

/** Channel kind constant for the iMessage connector. */
export const IMESSAGE_CONNECTOR_KIND = "imessage" as const;

/** One attachment row as `imsg` reports it in a watch payload. */
export interface IMessageAttachment {
  original_path?: string | null;
  mime_type?: string | null;
  missing?: boolean | null;
}

/**
 * One inbound message row pushed by the `imsg` `watch.subscribe` notification.
 * This is the real `IMessagePayload` shape from the raw monitor (monitor/types.ts).
 */
export interface IMessagePayload {
  id?: number | null;
  chat_id?: number | null;
  sender?: string | null;
  is_from_me?: boolean | null;
  text?: string | null;
  reply_to_id?: number | string | null;
  reply_to_text?: string | null;
  reply_to_sender?: string | null;
  created_at?: string | null;
  attachments?: IMessageAttachment[] | null;
  chat_identifier?: string | null;
  chat_guid?: string | null;
  chat_name?: string | null;
  participants?: string[] | null;
  is_group?: boolean | null;
}

/** Faithful MIME → media-kind classifier (matches `<media:kind>` placeholders). */
export function mediaKindFromMime(
  mime?: string | null,
): "image" | "audio" | "video" | "file" | undefined {
  const value = mime?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (value.startsWith("image/")) {
    return "image";
  }
  if (value.startsWith("audio/")) {
    return "audio";
  }
  if (value.startsWith("video/")) {
    return "video";
  }
  return "file";
}

/** Type guard: a value structurally usable as an inbound iMessage row. */
export function isIMessagePayload(value: unknown): value is IMessagePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const senderOk = candidate.sender === undefined || typeof candidate.sender === "string";
  const textOk = candidate.text === undefined || typeof candidate.text === "string";
  return senderOk && textOk;
}

function toInboundAttachment(attachment: IMessageAttachment): InboundAttachment {
  const mimeType = attachment.mime_type ?? undefined;
  const path = attachment.original_path ?? undefined;
  return {
    mimeType: mimeType ?? undefined,
    // `imsg` exposes the resolved local file path rather than a remote id; carry
    // it as the URL so downstream media fetch can resolve the bytes lazily.
    url: path,
    filename: path ? path.split("/").pop() : undefined,
  };
}

function buildSenderIdentity(senderRaw: string): SenderIdentity {
  const normalized = normalizeIMessageHandle(senderRaw);
  // iMessage handles are either phone numbers (E.164) or Apple-ID emails.
  if (normalized.includes("@")) {
    return {
      SenderId: senderRaw,
      SenderName: normalized,
      SenderUsername: normalized,
    };
  }
  const e164 = normalizeE164(senderRaw);
  return {
    SenderId: senderRaw,
    SenderName: normalized,
    SenderE164: e164 || undefined,
  };
}

/**
 * Convert one `imsg` watch payload into a {@link NormalizedInboundMessage}, or
 * `undefined` for non-actionable rows (own echoes, sender-less, group-without-id,
 * empty-body-no-media). Accepts the already-unwrapped message row (i.e. the
 * `message` field of the `{ message }` notification params).
 */
export function normalizeIMessageEvent(
  rawEvent: unknown,
  accountId: string,
): NormalizedInboundMessage | undefined {
  // Accept either the bare message row or the `{ message }` notification wrapper.
  let message: IMessagePayload | undefined;
  if (isIMessagePayload(rawEvent)) {
    message = rawEvent;
  } else if (rawEvent && typeof rawEvent === "object") {
    const wrapped = (rawEvent as { message?: unknown }).message;
    if (isIMessagePayload(wrapped)) {
      message = wrapped;
    }
  }
  if (!message) {
    return undefined;
  }

  const senderRaw = (message.sender ?? "").trim();
  if (!senderRaw) {
    return undefined;
  }
  if (message.is_from_me) {
    return undefined;
  }

  const chatId = message.chat_id ?? undefined;
  const chatGuid = message.chat_guid ?? undefined;
  const chatIdentifier = message.chat_identifier ?? undefined;
  const isGroup = Boolean(message.is_group);
  if (isGroup && chatId === undefined) {
    return undefined;
  }

  const messageText = (message.text ?? "").trim();
  const attachments = (message.attachments ?? []).filter(
    (entry): entry is IMessageAttachment => Boolean(entry?.original_path) && !entry?.missing,
  );
  const firstKind = mediaKindFromMime(attachments[0]?.mime_type ?? undefined);
  const placeholder = firstKind
    ? `<media:${firstKind}>`
    : attachments.length > 0
      ? "<media:attachment>"
      : "";
  const bodyText = messageText || placeholder;
  if (!bodyText) {
    return undefined;
  }

  const chatType: ChatType = isGroup ? "group" : "direct";
  const conversationId = isGroup
    ? String(chatId)
    : `imessage:${normalizeIMessageHandle(senderRaw)}`;
  const messageId =
    message.id != null ? String(message.id) : String(Date.parse(message.created_at ?? "") || Date.now());
  const timestamp = message.created_at ? Date.parse(message.created_at) : Date.now();

  const normalizedAttachments: InboundAttachment[] = attachments.map(toInboundAttachment);

  return {
    channel: IMESSAGE_CONNECTOR_KIND,
    accountId,
    messageId,
    conversationId,
    chatType,
    sender: buildSenderIdentity(senderRaw),
    text: bodyText,
    // Direct iMessages are inherently addressed to the bot account, so they are
    // treated as a mention for the mention-gating layer; group @-mention
    // detection is the gating layer's responsibility, not the port's.
    wasMentioned: chatType === "direct",
    attachments: normalizedAttachments,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    raw: message,
  };
}
