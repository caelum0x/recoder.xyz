// Owned by Recoder. Slack event → NormalizedInboundMessage. This is the slack
// row of the connector `normalize()` contract (interop §4): it converts the
// real `@slack/bolt` message / app_mention payload (SlackMessageEvent /
// SlackAppMentionEvent, ported from the real `slack/types.ts`) into the
// wire-agnostic foundation message every gating + routing layer consumes.
// Pure: returns undefined for events that carry no actionable user message
// (edits/deletes/joins/the bot's own posts), so callers never act on noise.

import type {
  ConnectorKind,
  InboundAttachment,
  NormalizedInboundMessage,
  SenderIdentity,
} from "../../../src/connector/index.js";
import {
  normalizeSlackChannelType,
  slackChatTypeToChatType,
} from "./channel-type.js";
import type { SlackFile, SlackInboundEvent } from "./events.js";

/** Subtypes that are real user messages (everything else is system noise). */
const ACTIONABLE_SUBTYPES = new Set(["file_share", "bot_message"]);

function isActionableEvent(event: SlackInboundEvent): boolean {
  if (event.type === "app_mention") {
    return true;
  }
  if (event.type !== "message") {
    return false;
  }
  const subtype = event.subtype;
  if (!subtype) {
    return true;
  }
  return ACTIONABLE_SUBTYPES.has(subtype);
}

/** Parse the millisecond timestamp out of a Slack ts ("1700000000.000200"). */
function slackTsToMillis(ts?: string): number {
  if (!ts) {
    return Date.now();
  }
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) {
    return Date.now();
  }
  return Math.round(seconds * 1000);
}

/** Strip <@BOTID> mentions from the text and report whether the bot was hit. */
function stripBotMention(
  text: string,
  botUserId?: string,
): { text: string; wasMentioned: boolean } {
  if (!text) {
    return { text: "", wasMentioned: false };
  }
  if (!botUserId) {
    return { text: text.trim(), wasMentioned: false };
  }
  const mentionRe = new RegExp(`<@${botUserId}>`, "g");
  const wasMentioned = mentionRe.test(text);
  mentionRe.lastIndex = 0;
  const stripped = text.replace(mentionRe, "").replace(/\s{2,}/g, " ").trim();
  return { text: stripped, wasMentioned };
}

function mapAttachments(files?: SlackFile[]): InboundAttachment[] {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }
  return files.map((file) => {
    const attachment: InboundAttachment = {
      mimeType: file.mimetype,
      remoteId: file.id,
      url: file.url_private_download ?? file.url_private,
      filename: file.name,
      size: file.size,
    };
    return attachment;
  });
}

/**
 * Normalize a Slack inbound event for the given account. `botUserId` lets the
 * adapter detect explicit @-mentions and strip them from the body; it is the
 * bot user id resolved from `auth.test` at monitor start.
 */
export function normalizeSlackEvent(
  rawEvent: unknown,
  accountId: string,
  options: { botUserId?: string } = {},
): NormalizedInboundMessage | undefined {
  if (!rawEvent || typeof rawEvent !== "object") {
    return undefined;
  }
  const event = rawEvent as Partial<SlackInboundEvent> & {
    type?: string;
    channel?: string;
  };
  if (event.type !== "message" && event.type !== "app_mention") {
    return undefined;
  }
  if (!event.channel) {
    return undefined;
  }

  const typed = event as SlackInboundEvent;
  if (!isActionableEvent(typed)) {
    return undefined;
  }

  // Ignore the bot's own posts to avoid self-trigger loops.
  if (options.botUserId && typed.user && typed.user === options.botUserId) {
    return undefined;
  }

  const channelType = normalizeSlackChannelType(typed.channel_type, typed.channel);
  const chatType = slackChatTypeToChatType(channelType);
  const messageId = typed.ts ?? typed.event_ts ?? "";
  if (!messageId) {
    return undefined;
  }

  const files = typed.type === "message" ? typed.files : undefined;
  const { text, wasMentioned: textMentioned } = stripBotMention(
    typed.text ?? "",
    options.botUserId,
  );
  const wasMentioned = typed.type === "app_mention" ? true : textMentioned;

  // A message with neither text nor attachments carries nothing actionable.
  if (!text && mapAttachments(files).length === 0) {
    return undefined;
  }

  const sender: SenderIdentity = {
    SenderId: typed.user ?? typed.bot_id,
    SenderUsername:
      typed.type === "message" ? typed.username : undefined,
  };

  const message: NormalizedInboundMessage = {
    channel: "slack" satisfies ConnectorKind,
    accountId,
    messageId,
    conversationId: typed.channel,
    chatType,
    sender,
    text,
    wasMentioned,
    attachments: mapAttachments(files),
    timestamp: slackTsToMillis(typed.ts ?? typed.event_ts),
    raw: rawEvent,
  };
  return message;
}
