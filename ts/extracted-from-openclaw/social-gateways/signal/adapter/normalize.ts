// Owned by Recoder. The pure normalize step of the Signal ConnectorPort:
// converts one signal-cli `receive` SSE frame (a SignalReceivePayload) into the
// wire-agnostic NormalizedInboundMessage. The field mapping is extracted
// verbatim from the real monitor event handler
// (social-gateways/signal/monitor/event-handler.ts):
//   - sender via resolveSignalSender(envelope)
//   - group vs dm via dataMessage.groupInfo.groupId
//   - bodyText = message || media placeholder || quote.text
//   - timestamp/messageId = envelope.timestamp ?? dataMessage.timestamp
//   - conversationId = isGroup ? groupId : senderPeerId
// Sync messages, sender-less envelopes, reaction-only frames, and empty-body
// frames produce no actionable message (returns undefined), exactly as the real
// handler short-circuits them.

import type {
  InboundAttachment,
  NormalizedInboundMessage,
} from "../../../src/connector/inbound-message.js";
import type { ChatType } from "../../../src/connector/chat-type.js";
import type { SenderIdentity } from "../../../src/connector/sender-identity.js";
import {
  formatSignalSenderDisplay,
  resolveSignalPeerId,
  resolveSignalSender,
  type SignalSender,
} from "./identity.js";
import type {
  SignalAttachment,
  SignalDataMessage,
  SignalReceivePayload,
} from "./envelope.js";

/** Faithful MIME → media-kind classifier (matches `<media:kind>` placeholders). */
export function mediaKindFromMime(mime?: string): "image" | "audio" | "video" | "file" | undefined {
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

function toInboundAttachment(attachment: SignalAttachment): InboundAttachment {
  return {
    mimeType: attachment.contentType ?? undefined,
    remoteId: attachment.id ?? undefined,
    filename: attachment.filename ?? undefined,
    size: typeof attachment.size === "number" ? attachment.size : undefined,
  };
}

function isReactionOnly(dataMessage: SignalDataMessage | null | undefined): boolean {
  if (!dataMessage) {
    return true;
  }
  const reaction = dataMessage.reaction;
  if (!reaction) {
    return false;
  }
  const emoji = reaction.emoji?.trim();
  const timestamp = reaction.targetSentTimestamp;
  const hasTarget = Boolean(reaction.targetAuthor?.trim() || reaction.targetAuthorUuid?.trim());
  return Boolean(emoji && typeof timestamp === "number" && timestamp > 0 && hasTarget);
}

function buildSenderIdentity(sender: SignalSender, sourceName?: string | null): SenderIdentity {
  const display = formatSignalSenderDisplay(sender);
  if (sender.kind === "phone") {
    return {
      SenderId: sender.e164,
      SenderName: sourceName?.trim() || display,
      SenderE164: sender.e164,
    };
  }
  return {
    SenderId: `uuid:${sender.raw}`,
    SenderName: sourceName?.trim() || display,
  };
}

/**
 * Convert a signal-cli receive payload into a NormalizedInboundMessage, or
 * `undefined` for non-actionable frames (sync/edit-only/reaction/empty).
 *
 * @param rawEvent  the parsed `SignalReceivePayload` (one SSE `receive` frame)
 * @param accountId the connector account the frame arrived on
 */
export function normalizeSignalEvent(
  rawEvent: unknown,
  accountId: string,
): NormalizedInboundMessage | undefined {
  const payload = rawEvent as SignalReceivePayload | null | undefined;
  const envelope = payload?.envelope;
  if (!envelope || envelope.syncMessage) {
    return undefined;
  }

  const sender = resolveSignalSender(envelope);
  if (!sender) {
    return undefined;
  }

  const dataMessage = envelope.dataMessage ?? envelope.editMessage?.dataMessage ?? null;
  if (!dataMessage) {
    return undefined;
  }

  const messageText = (dataMessage.message ?? "").trim();
  const quoteText = dataMessage.quote?.text?.trim() ?? "";
  const attachments = dataMessage.attachments ?? [];
  const hasBodyContent =
    Boolean(messageText || quoteText) || (!isReactionOnly(dataMessage) && attachments.length > 0);
  if (!hasBodyContent) {
    return undefined;
  }

  let placeholder = "";
  const firstKind = mediaKindFromMime(attachments[0]?.contentType ?? undefined);
  if (firstKind) {
    placeholder = `<media:${firstKind}>`;
  } else if (attachments.length > 0) {
    placeholder = "<media:attachment>";
  }

  const bodyText = messageText || placeholder || quoteText;
  if (!bodyText) {
    return undefined;
  }

  const groupId = dataMessage.groupInfo?.groupId ?? undefined;
  const isGroup = Boolean(groupId);
  const chatType: ChatType = isGroup ? "group" : "direct";
  const peerId = resolveSignalPeerId(sender);
  const conversationId = isGroup ? (groupId as string) : peerId;

  const timestamp =
    typeof envelope.timestamp === "number"
      ? envelope.timestamp
      : typeof dataMessage.timestamp === "number"
        ? dataMessage.timestamp
        : Date.now();
  const messageId = String(timestamp);

  const normalizedAttachments: InboundAttachment[] = attachments
    .filter((attachment) => Boolean(attachment?.id) || Boolean(attachment?.contentType))
    .map(toInboundAttachment);

  return {
    channel: "signal",
    accountId,
    messageId,
    conversationId,
    chatType,
    sender: buildSenderIdentity(sender, envelope.sourceName),
    text: bodyText,
    // Signal direct messages are inherently addressed to the bot account; group
    // messages carry no @-mention semantics in the signal-cli payload, so a
    // DM is treated as a mention for the mention-gating layer.
    wasMentioned: chatType === "direct",
    attachments: normalizedAttachments,
    timestamp,
    raw: payload,
  };
}
