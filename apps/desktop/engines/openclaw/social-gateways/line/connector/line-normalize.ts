// Owned by Recoder. The LINE-specific `normalize()` for the ConnectorPort
// adapter: converts one channel-native `@line/bot-sdk` WebhookEvent into the
// wire-agnostic `NormalizedInboundMessage` the gating + routing layers consume.
//
// The text/sticker/location/media extraction and the source -> conversation
// mapping reuse the REAL logic from ../bot-message-context.ts (sticker package
// table, location formatting, media placeholders, group/room/user peer ids),
// ported standalone because the original is welded to the un-extracted monorepo
// envelope/session/routing machinery. Behavior is preserved; output shape is the
// foundation's `NormalizedInboundMessage` instead of OpenClaw's `MsgContext`.

import type {
  ChatType,
  ConnectorKind,
  InboundAttachment,
  NormalizedInboundMessage,
  SenderIdentity,
} from "../../../src/connector/index.js";
import {
  isLineMessageEvent,
  isLinePostbackEvent,
  type LineEventMessage,
  type LineEventSource,
  type LineLocationEventMessage,
  type LineMessageEvent,
  type LinePostbackEvent,
  type LineStickerEventMessage,
  type LineTextEventMessage,
  type LineWebhookEvent,
} from "./line-sdk-types.js";

const LINE_KIND: ConnectorKind = "line";

// Common LINE sticker package descriptions (verbatim from bot-message-context.ts).
const STICKER_PACKAGES: Record<string, string> = {
  "1": "Moon & James",
  "2": "Cony & Brown",
  "3": "Brown & Friends",
  "4": "Moon Special",
  "11537": "Cony",
  "11538": "Brown",
  "11539": "Moon",
  "6136": "Cony's Happy Life",
  "6325": "Brown's Life",
  "6359": "Choco",
  "6362": "Sally",
  "6370": "Edward",
  "789": "LINE Characters",
};

interface SourceInfo {
  userId?: string;
  groupId?: string;
  roomId?: string;
  isGroup: boolean;
}

function getSourceInfo(source: LineEventSource): SourceInfo {
  const userId = source.userId;
  const groupId = source.type === "group" ? source.groupId : undefined;
  const roomId = source.type === "room" ? source.roomId : undefined;
  const isGroup = source.type === "group" || source.type === "room";
  return { userId, groupId, roomId, isGroup };
}

/** Channel-native conversation id (user / group / room) — used for replies. */
function buildConversationId(source: LineEventSource): string {
  if (source.type === "group") {
    return `line:group:${source.groupId}`;
  }
  if (source.type === "room") {
    return `line:room:${source.roomId}`;
  }
  if (source.type === "user" && source.userId) {
    return `line:user:${source.userId}`;
  }
  return "line:unknown";
}

function describeStickerKeywords(sticker: LineStickerEventMessage): string {
  if (sticker.keywords && sticker.keywords.length > 0) {
    return sticker.keywords.slice(0, 3).join(", ");
  }
  if (sticker.text) {
    return sticker.text;
  }
  return "";
}

function formatLocationText(loc: LineLocationEventMessage): string {
  const title = loc.title?.trim();
  const address = loc.address?.trim();
  const coords = `${loc.latitude}, ${loc.longitude}`;
  if (title && address) {
    return `[Location: ${title} — ${address} (${coords})]`;
  }
  if (title) {
    return `[Location: ${title} (${coords})]`;
  }
  if (address) {
    return `[Location: ${address} (${coords})]`;
  }
  return `[Location: ${coords}]`;
}

function extractMessageText(message: LineEventMessage): string {
  if (message.type === "text") {
    return message.text;
  }
  if (message.type === "location") {
    return formatLocationText(message);
  }
  if (message.type === "sticker") {
    const packageName = STICKER_PACKAGES[message.packageId] ?? "sticker";
    const keywords = describeStickerKeywords(message);
    if (keywords) {
      return `[Sent a ${packageName} sticker: ${keywords}]`;
    }
    return `[Sent a ${packageName} sticker]`;
  }
  return "";
}

function extractMediaPlaceholder(message: LineEventMessage): string {
  switch (message.type) {
    case "image":
      return "<media:image>";
    case "video":
      return "<media:video>";
    case "audio":
      return "<media:audio>";
    case "file":
      return "<media:document>";
    default:
      return "";
  }
}

function mimeForMediaType(type: LineEventMessage["type"]): string | undefined {
  switch (type) {
    case "image":
      return "image/jpeg";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/m4a";
    default:
      return undefined;
  }
}

function buildAttachments(message: LineEventMessage): InboundAttachment[] {
  if (
    message.type === "image" ||
    message.type === "video" ||
    message.type === "audio" ||
    message.type === "file"
  ) {
    const attachment: InboundAttachment = {
      remoteId: message.id,
      mimeType: mimeForMediaType(message.type),
      ...(message.type === "file" ? { filename: message.fileName, size: message.fileSize } : {}),
    };
    return [attachment];
  }
  return [];
}

function buildSenderIdentity(source: LineEventSource): SenderIdentity {
  return source.userId ? { SenderId: source.userId } : {};
}

/** Detect whether the bot was explicitly @mentioned in a text message. */
function detectMention(message: LineEventMessage): boolean {
  if (message.type !== "text") {
    return false;
  }
  const text = message as LineTextEventMessage;
  const mentionees = text.mention?.mentionees;
  return Array.isArray(mentionees) && mentionees.length > 0;
}

function chatTypeFor(info: SourceInfo): ChatType {
  return info.isGroup ? "group" : "direct";
}

function normalizeMessageEvent(
  event: LineMessageEvent,
  accountId: string,
): NormalizedInboundMessage | undefined {
  const info = getSourceInfo(event.source);
  const textContent = extractMessageText(event.message);
  const placeholder = extractMediaPlaceholder(event.message);
  const attachments = buildAttachments(event.message);

  let text = textContent || placeholder;
  if (!text && attachments.length > 0) {
    text = "<media:image>";
  }
  // No actionable content (e.g. unsupported message kind with no media).
  if (!text && attachments.length === 0) {
    return undefined;
  }

  return {
    channel: LINE_KIND,
    accountId,
    messageId: event.message.id,
    conversationId: buildConversationId(event.source),
    chatType: chatTypeFor(info),
    sender: buildSenderIdentity(event.source),
    text,
    wasMentioned: detectMention(event.message),
    attachments,
    timestamp: event.timestamp,
    raw: event,
  };
}

function normalizePostbackEvent(
  event: LinePostbackEvent,
  accountId: string,
): NormalizedInboundMessage | undefined {
  const info = getSourceInfo(event.source);
  const rawData = event.postback?.data?.trim() ?? "";
  if (!rawData) {
    return undefined;
  }

  // Preserve the real postback decoding from bot-message-context.ts: decode
  // `line.action=...&line.device=...` payloads into a human-readable command.
  let text = rawData;
  if (rawData.includes("line.action=")) {
    const params = new URLSearchParams(rawData);
    const action = params.get("line.action") ?? "";
    const device = params.get("line.device");
    text = device ? `line action ${action} device ${device}` : `line action ${action}`;
  }

  const messageId = event.replyToken
    ? `postback:${event.replyToken}`
    : `postback:${event.timestamp}`;

  return {
    channel: LINE_KIND,
    accountId,
    messageId,
    conversationId: buildConversationId(event.source),
    chatType: chatTypeFor(info),
    sender: buildSenderIdentity(event.source),
    text,
    wasMentioned: false,
    attachments: [],
    timestamp: event.timestamp,
    raw: event,
  };
}

/**
 * Convert one LINE webhook event into a NormalizedInboundMessage. Returns
 * undefined for events that carry no actionable message (follow/unfollow/join,
 * empty postbacks, content-less messages) — the port never invents a message.
 */
export function normalizeLineEvent(
  rawEvent: unknown,
  accountId: string,
): NormalizedInboundMessage | undefined {
  if (typeof rawEvent !== "object" || rawEvent === null) {
    return undefined;
  }
  const event = rawEvent as LineWebhookEvent;
  if (isLineMessageEvent(event)) {
    return normalizeMessageEvent(event, accountId);
  }
  if (isLinePostbackEvent(event)) {
    return normalizePostbackEvent(event, accountId);
  }
  return undefined;
}

/** The reply token carried by a message/postback event, if present. */
export function replyTokenForEvent(rawEvent: unknown): string | undefined {
  if (typeof rawEvent !== "object" || rawEvent === null) {
    return undefined;
  }
  const event = rawEvent as LineWebhookEvent;
  if (isLineMessageEvent(event) || isLinePostbackEvent(event)) {
    return event.replyToken;
  }
  return undefined;
}
