// Owned by Recoder. Telegram `Update` -> `NormalizedInboundMessage`.
//
// Mirrors the real normalization the extracted gateway performs in
// `bot-message-context.ts`: chat.type -> ChatType (private->direct,
// group/supergroup->group, channel->channel); sender from `from`; text from
// `text`/`caption`; @mention detection from `@<botUsername>` and `mention`
// entities; media -> InboundAttachment via the message's file objects. Pure and
// channel-independent; returns undefined for events that carry no actionable
// message (edits, channel posts without text/media, non-message updates).

import type {
  InboundAttachment,
  NormalizedInboundMessage,
} from "../../../src/connector/inbound-message.js";
import type { ChatType } from "../../../src/connector/chat-type.js";
import type { SenderIdentity } from "../../../src/connector/sender-identity.js";
import type {
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "./telegram-api.js";

const CHANNEL = "telegram" as const;

/** Map Telegram `chat.type` to the wire-agnostic ChatType. */
function mapChatType(type: TelegramChatTypeRaw): ChatType {
  switch (type) {
    case "private":
      return "direct";
    case "group":
    case "supergroup":
      return "group";
    case "channel":
      return "channel";
  }
}

type TelegramChatTypeRaw = TelegramMessage["chat"]["type"];

function senderFromUser(user: TelegramUser | undefined): SenderIdentity {
  if (!user) {
    return {};
  }
  const name = [user.first_name, user.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return {
    SenderId: String(user.id),
    SenderName: name || undefined,
    SenderUsername: user.username || undefined,
  };
}

/**
 * Detect whether the bot was explicitly @mentioned. Mirrors the extracted
 * mention detection: a `mention` entity whose text equals `@<botUsername>`, or
 * a plain `@<botUsername>` substring (case-insensitive). When `botUsername` is
 * unknown the message is treated as not-mentioned (the gating layer decides).
 */
function detectMention(message: TelegramMessage, botUsername?: string): boolean {
  if (!botUsername) {
    return false;
  }
  const handle = `@${botUsername.toLowerCase()}`;
  const text = (message.text ?? message.caption ?? "").toLowerCase();
  if (text.includes(handle)) {
    return true;
  }
  const entities = message.entities ?? message.caption_entities ?? [];
  const source = message.text ?? message.caption ?? "";
  return entities.some((ent) => {
    if (ent.type !== "mention") {
      return false;
    }
    const slice = source.slice(ent.offset, ent.offset + ent.length).toLowerCase();
    return slice === handle;
  });
}

function attachmentsFromMessage(message: TelegramMessage): InboundAttachment[] {
  const out: InboundAttachment[] = [];
  if (message.photo && message.photo.length > 0) {
    // Telegram sends photo sizes ascending; the last entry is the largest.
    const largest = message.photo[message.photo.length - 1];
    out.push({ mimeType: "image/jpeg", remoteId: largest.file_id, size: largest.file_size });
  }
  if (message.document) {
    out.push({
      mimeType: message.document.mime_type,
      remoteId: message.document.file_id,
      filename: message.document.file_name,
      size: message.document.file_size,
    });
  }
  if (message.voice) {
    out.push({
      mimeType: message.voice.mime_type ?? "audio/ogg",
      remoteId: message.voice.file_id,
      size: message.voice.file_size,
    });
  }
  if (message.audio) {
    out.push({
      mimeType: message.audio.mime_type ?? "audio/mpeg",
      remoteId: message.audio.file_id,
      filename: message.audio.file_name,
      size: message.audio.file_size,
    });
  }
  if (message.video) {
    out.push({
      mimeType: message.video.mime_type ?? "video/mp4",
      remoteId: message.video.file_id,
      size: message.video.file_size,
    });
  }
  return out;
}

/**
 * Convert one Telegram message into a NormalizedInboundMessage. Strips a leading
 * `@<botUsername>` from the text the same way the gateway does so downstream
 * routing sees the prompt, not the mention token. Returns undefined for a
 * message that has neither text/caption nor any attachment.
 */
export function normalizeTelegramMessage(params: {
  message: TelegramMessage;
  accountId: string;
  botUsername?: string;
}): NormalizedInboundMessage | undefined {
  const { message, accountId, botUsername } = params;
  const attachments = attachmentsFromMessage(message);
  const rawText = (message.text ?? message.caption ?? "").trim();
  if (!rawText && attachments.length === 0) {
    return undefined;
  }

  const wasMentioned = detectMention(message, botUsername);
  let text = rawText;
  if (botUsername) {
    const handleRe = new RegExp(`@${escapeRegExp(botUsername)}\\b`, "ig");
    text = rawText.replace(handleRe, "").replace(/\s{2,}/g, " ").trim();
  }

  const conversationBase = String(message.chat.id);
  const conversationId =
    message.message_thread_id != null
      ? `${conversationBase}:topic:${message.message_thread_id}`
      : conversationBase;

  return {
    channel: CHANNEL,
    accountId,
    messageId: String(message.message_id),
    conversationId,
    chatType: mapChatType(message.chat.type),
    sender: senderFromUser(message.from),
    text,
    wasMentioned,
    attachments,
    timestamp: message.date * 1000,
    raw: message,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize a full Telegram `Update`. Only fresh `message` updates carry an
 * actionable inbound message; edits, channel posts, and non-message updates
 * return undefined (the port never fabricates a message for system events).
 */
export function normalizeTelegramUpdate(params: {
  update: TelegramUpdate;
  accountId: string;
  botUsername?: string;
}): NormalizedInboundMessage | undefined {
  const { update, accountId, botUsername } = params;
  if (!update.message) {
    return undefined;
  }
  return normalizeTelegramMessage({ message: update.message, accountId, botUsername });
}
