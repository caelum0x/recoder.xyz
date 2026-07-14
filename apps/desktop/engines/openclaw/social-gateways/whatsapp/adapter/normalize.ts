// Owned by Recoder. The pure normalize step of the WhatsApp ConnectorPort:
// converts one WhatsApp Web (Baileys) `message` SSE frame (a WAMessage) into the
// wire-agnostic NormalizedInboundMessage. The field mapping follows the real
// WhatsApp gateway message handling:
//   - conversationId   = key.remoteJid (group JID stays a JID; DM JID → E.164)
//   - sender           = key.participant (group) ?? remoteJid (DM), as E.164
//   - bodyText         = conversation || extendedTextMessage.text || media caption
//                        || "<media:kind>" placeholder
//   - messageId        = key.id
//   - timestamp        = messageTimestamp (seconds) → ms
//   - wasMentioned     = DM, or self in extendedTextMessage.contextInfo.mentionedJid
// Own (fromMe) messages, protocol/reaction/edit-only frames, and empty-body
// frames carry no actionable message and return undefined — exactly as the real
// gateway short-circuits them.

import type {
  InboundAttachment,
  NormalizedInboundMessage,
} from "../../../src/connector/inbound-message.js";
import type { ChatType } from "../../../src/connector/chat-type.js";
import type { SenderIdentity } from "../../../src/connector/sender-identity.js";
import {
  extractUserJidPhone,
  isWhatsAppGroupJid,
  normalizeE164,
} from "./target.js";
import type {
  WhatsAppInboundMessage,
  WhatsAppMediaMessage,
  WhatsAppMessageContent,
  WhatsAppMessageEvent,
} from "./wire.js";

type MediaKind = "image" | "audio" | "video" | "file";

/** Faithful MIME → media-kind classifier (matches `<media:kind>` placeholders). */
export function mediaKindFromMime(mime?: string | null): MediaKind | undefined {
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

/** Convert a possibly-string Baileys timestamp (unix seconds) to epoch ms. */
function toEpochMs(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.round(value) : Math.round(value * 1000);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed > 1e12 ? Math.round(parsed) : Math.round(parsed * 1000);
    }
  }
  return Date.now();
}

interface MediaPick {
  readonly content: WhatsAppMediaMessage;
  readonly kind: MediaKind;
}

/** Pick the single media variant a WAMessage carries (image/video/…), if any. */
function pickMedia(content: WhatsAppMessageContent): MediaPick | undefined {
  if (content.imageMessage) {
    return { content: content.imageMessage, kind: "image" };
  }
  if (content.videoMessage) {
    return { content: content.videoMessage, kind: "video" };
  }
  if (content.audioMessage) {
    return { content: content.audioMessage, kind: "audio" };
  }
  if (content.documentMessage) {
    return { content: content.documentMessage, kind: "file" };
  }
  if (content.stickerMessage) {
    return { content: content.stickerMessage, kind: "image" };
  }
  return undefined;
}

function toInboundAttachment(media: WhatsAppMediaMessage): InboundAttachment {
  const rawSize = media.fileLength;
  const size =
    typeof rawSize === "number"
      ? rawSize
      : typeof rawSize === "string" && rawSize.trim() && Number.isFinite(Number(rawSize))
        ? Number(rawSize)
        : undefined;
  return {
    mimeType: media.mimetype ?? undefined,
    remoteId: media.mediaId ?? undefined,
    url: media.url ?? undefined,
    filename: media.fileName ?? undefined,
    size,
  };
}

/** Resolve the readable text body of a WAMessage content (with media caption). */
function resolveBodyText(content: WhatsAppMessageContent, media?: MediaPick): string {
  const conversation = content.conversation?.trim() ?? "";
  if (conversation) {
    return conversation;
  }
  const extended = content.extendedTextMessage?.text?.trim() ?? "";
  if (extended) {
    return extended;
  }
  const caption = media?.content.caption?.trim() ?? "";
  if (caption) {
    return caption;
  }
  if (media) {
    const kind = mediaKindFromMime(media.content.mimetype) ?? media.kind;
    return `<media:${kind}>`;
  }
  return "";
}

/** A frame is non-actionable if it is purely protocol/reaction/key-distribution. */
function isNonActionable(content: WhatsAppMessageContent): boolean {
  const hasContent = Boolean(
    content.conversation ||
      content.extendedTextMessage ||
      content.imageMessage ||
      content.videoMessage ||
      content.audioMessage ||
      content.documentMessage ||
      content.stickerMessage,
  );
  return !hasContent;
}

/** Build the unverified sender identity from a sender JID + push name. */
function buildSenderIdentity(senderJid: string, pushName?: string | null): SenderIdentity {
  const phone = extractUserJidPhone(senderJid);
  const e164 = phone ? normalizeE164(phone) : "";
  const name = pushName?.trim();
  if (e164.length > 1) {
    return {
      SenderId: e164,
      SenderName: name || e164,
      SenderE164: e164,
    };
  }
  // LID-only / opaque sender with no resolvable phone: keep the raw JID as id.
  return {
    SenderId: senderJid,
    SenderName: name || senderJid,
  };
}

/** Unwrap the WAMessage from a `message` SSE frame (supports both framings). */
function unwrapInbound(rawEvent: unknown): WhatsAppInboundMessage | undefined {
  const event = rawEvent as WhatsAppMessageEvent | WhatsAppInboundMessage | null | undefined;
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const wrapped = (event as WhatsAppMessageEvent).message;
  // The frame may be { message: WAMessage } (wrapper) or a bare WAMessage whose
  // own `message` field is the content union. Disambiguate via the `key`.
  if (wrapped && typeof wrapped === "object" && "key" in (wrapped as object)) {
    return wrapped as WhatsAppInboundMessage;
  }
  if ((event as WhatsAppInboundMessage).key) {
    return event as WhatsAppInboundMessage;
  }
  return undefined;
}

/**
 * Convert a WhatsApp Web `message` SSE frame into a NormalizedInboundMessage, or
 * `undefined` for non-actionable frames (own messages / protocol / reaction /
 * empty body / missing addressing).
 *
 * @param rawEvent  the parsed `message` SSE frame (a WAMessage or { message })
 * @param accountId the connector account the frame arrived on
 */
export function normalizeWhatsAppEvent(
  rawEvent: unknown,
  accountId: string,
): NormalizedInboundMessage | undefined {
  const inbound = unwrapInbound(rawEvent);
  const key = inbound?.key;
  const content = inbound?.message;
  if (!inbound || !key || !content) {
    return undefined;
  }

  // Never act on our own outbound echoes.
  if (key.fromMe === true) {
    return undefined;
  }

  const remoteJid = key.remoteJid?.trim();
  const messageId = key.id?.trim();
  if (!remoteJid || !messageId) {
    return undefined;
  }
  if (isNonActionable(content)) {
    return undefined;
  }

  const isGroup = isWhatsAppGroupJid(remoteJid) || remoteJid.toLowerCase().endsWith("@g.us");
  const chatType: ChatType = isGroup ? "group" : "direct";

  // In groups the actual author is `participant`; in DMs it is the remoteJid.
  const senderJid = (isGroup ? key.participant?.trim() : remoteJid) || remoteJid;

  const media = pickMedia(content);
  const bodyText = resolveBodyText(content, media);
  if (!bodyText) {
    return undefined;
  }

  // `wasMentioned`: every DM is addressed to the bot; in a group, the bot is
  // mentioned when its account JID appears in the extendedTextMessage mentions.
  const mentionedJids = content.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const selfMentioned = mentionedJids.some((jid) => {
    const phone = extractUserJidPhone(jid);
    return phone ? normalizeE164(phone) === accountId || jid.trim() === accountId : false;
  });
  const wasMentioned = chatType === "direct" || selfMentioned;

  const attachments: InboundAttachment[] = media ? [toInboundAttachment(media.content)] : [];
  const timestamp = toEpochMs(inbound.messageTimestamp);

  return {
    channel: "whatsapp",
    accountId,
    messageId,
    conversationId: remoteJid,
    chatType,
    sender: buildSenderIdentity(senderJid, inbound.pushName),
    text: bodyText,
    wasMentioned,
    attachments,
    timestamp,
    raw: rawEvent,
  };
}
