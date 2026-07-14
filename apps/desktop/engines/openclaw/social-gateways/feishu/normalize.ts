// Owned by Recoder. feishu `im.message.receive_v1` event -> wire-agnostic
// NormalizedInboundMessage (foundation src/connector/inbound-message.ts). The
// field extraction here is the REAL logic from the extracted `message.ts`
// (chat_id / chat_type / sender_id / mentions-stripping / JSON text content /
// create_time), reshaped to the connector domain instead of the OpenClaw
// `ctx` object. Pure: returns undefined for events carrying no actionable
// message (system / unsupported types / empty bodies) — interop §2.

import type {
  InboundAttachment,
  NormalizedInboundMessage,
} from "../../src/connector/inbound-message.js";
import type { ChatType } from "../../src/connector/chat-type.js";
import type { SenderIdentity } from "../../src/connector/sender-identity.js";

/** Message kinds the connector turns into actionable inbound messages. */
const SUPPORTED_MSG_TYPES = new Set([
  "text",
  "image",
  "file",
  "audio",
  "media",
  "sticker",
]);

/** Non-text kinds that surface as a single normalized attachment. */
const ATTACHMENT_MSG_TYPES = new Set(["image", "file", "audio", "media", "sticker"]);

interface FeishuSenderId {
  open_id?: string;
  user_id?: string;
  union_id?: string;
}

interface FeishuSender {
  sender_id?: FeishuSenderId;
  sender_type?: string;
}

interface FeishuMention {
  key?: string;
  id?: FeishuSenderId;
  name?: string;
}

interface FeishuMessage {
  chat_id?: string;
  chat_type?: string;
  message_type?: string;
  content?: string;
  mentions?: FeishuMention[];
  create_time?: string | number;
  message_id?: string;
  file_key?: string;
  image_key?: string;
}

/** The shape Lark's EventDispatcher hands to `im.message.receive_v1`. */
interface FeishuMessageReceiveEvent {
  message?: FeishuMessage;
  sender?: FeishuSender;
  mentions?: FeishuMention[];
  event?: {
    message?: FeishuMessage;
    sender?: FeishuSender;
  };
}

/** Map Feishu chat_type to the wire-agnostic chat surface kind. */
function mapChatType(chatType?: string): ChatType {
  if (chatType === "group") {
    return "group";
  }
  if (chatType === "topic") {
    // Feishu "topic" chats are channel-like threaded surfaces.
    return "channel";
  }
  // p2p / single -> direct
  return "direct";
}

/** Parse the JSON `content` of a text message into its `text` field. */
function parseTextContent(content?: string): string {
  if (!content) {
    return "";
  }
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

/** Strip Feishu @mention placeholder keys (e.g. `@_user_1`) from the body. */
function stripMentionKeys(text: string, mentions: readonly FeishuMention[]): string {
  let stripped = text;
  for (const mention of mentions) {
    if (mention.key) {
      stripped = stripped.split(mention.key).join("");
    }
  }
  return stripped.trim();
}

/** Build the (at most one) normalized attachment for a non-text message. */
function buildAttachments(message: FeishuMessage): InboundAttachment[] {
  if (!message.message_type || !ATTACHMENT_MSG_TYPES.has(message.message_type)) {
    return [];
  }
  // Feishu media is fetched lazily via the message_id + file/image key.
  const remoteId = message.file_key ?? message.image_key;
  const attachment: InboundAttachment = {
    remoteId: remoteId ?? message.message_id,
    mimeType:
      message.message_type === "image"
        ? "image/*"
        : message.message_type === "audio"
          ? "audio/*"
          : undefined,
  };
  return [attachment];
}

/**
 * Normalize one Feishu message-receive event for `accountId`. Returns undefined
 * when the event has no message, no chat id, an unsupported type, or no body
 * after mention-stripping (matching the real `message.ts` skip conditions).
 */
export function normalizeFeishuEvent(
  rawEvent: unknown,
  accountId: string,
): NormalizedInboundMessage | undefined {
  if (typeof rawEvent !== "object" || rawEvent === null) {
    return undefined;
  }
  const payload = rawEvent as FeishuMessageReceiveEvent;
  const message = payload.message ?? payload.event?.message;
  const sender = payload.sender ?? payload.event?.sender;

  if (!message) {
    return undefined;
  }

  const conversationId = message.chat_id;
  const messageId = message.message_id;
  if (!conversationId || !messageId) {
    return undefined;
  }

  const msgType = message.message_type;
  if (!msgType || !SUPPORTED_MSG_TYPES.has(msgType)) {
    return undefined;
  }

  const chatType = mapChatType(message.chat_type);
  const mentions = message.mentions ?? payload.mentions ?? [];
  const wasMentioned = mentions.length > 0;

  const rawText = msgType === "text" ? parseTextContent(message.content) : "";
  const text = stripMentionKeys(rawText, mentions);
  const attachments = buildAttachments(message);

  // Hostile-by-default: nothing actionable -> emit nothing.
  if (!text && attachments.length === 0) {
    return undefined;
  }

  const senderId = sender?.sender_id;
  const senderIdentity: SenderIdentity = {
    SenderId: senderId?.open_id ?? senderId?.user_id ?? senderId?.union_id,
    SenderUsername: senderId?.user_id,
  };

  const timestamp = Number(message.create_time);

  return {
    channel: "feishu",
    accountId,
    messageId,
    conversationId,
    chatType,
    sender: senderIdentity,
    text,
    wasMentioned,
    attachments,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    raw: rawEvent,
  };
}
