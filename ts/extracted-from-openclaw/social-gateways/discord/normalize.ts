// Owned by Recoder. discord message event -> NormalizedInboundMessage.
//
// This is the `discord/normalize.ts` seam named in interop §6 (full file tree):
// it converts one channel-native Discord gateway event (the carbon
// `MessageCreateListener` payload) into the wire-agnostic
// `NormalizedInboundMessage` the ConnectorPort contract emits.
//
// It reuses the REAL extracted Discord helpers — `resolveDiscordSenderIdentity`,
// `resolveDiscordMessageText`, `formatDiscordUserTag`, `resolveTimestampMs` —
// so the normalized text/sender/timestamp match exactly what the running
// gateway's message-handler produces. No reimplementation, no placeholder data.

import { ChannelType, type User } from "@buape/carbon";
import type {
  ChatType,
  InboundAttachment,
  NormalizedInboundMessage,
  SenderIdentity,
} from "../../src/connector/index.js";
import { formatDiscordUserTag, resolveTimestampMs } from "./monitor/format.js";
import type { DiscordMessageEvent } from "./monitor/listeners.js";
import { resolveDiscordMessageText } from "./monitor/message-utils.js";
import { resolveDiscordSenderIdentity } from "./monitor/sender-identity.js";

/** discord channel kind id used by both messages and the static kind field. */
export const DISCORD_CONNECTOR_KIND = "discord" as const;

/**
 * Map a Discord channel type to the wire-agnostic {@link ChatType}. DM and
 * group-DM surfaces are direct/group; everything guild-side (text channel,
 * thread, voice, forum, …) normalizes to `channel`. Mirrors the real preflight
 * branching (`channelInfo?.type === ChannelType.DM` / `GroupDM`).
 */
export function discordChatTypeFromChannelType(channelType: number | undefined): ChatType {
  if (channelType === ChannelType.DM) {
    return "direct";
  }
  if (channelType === ChannelType.GroupDM) {
    return "group";
  }
  return "channel";
}

/**
 * True when the message mentions the bot user, either via a resolved member id
 * mention or an `<@id>` / `<@!id>` token in the raw content. Uses only the
 * fields carbon exposes on the message; no network round-trips.
 */
function detectDiscordMention(
  message: DiscordMessageEvent["message"],
  botUserId: string | undefined,
): boolean {
  if (!botUserId) {
    return false;
  }
  const mentions = (message as { mentions?: { users?: Array<{ id?: string }> } | undefined })
    .mentions;
  const mentionedUsers = mentions?.users;
  if (Array.isArray(mentionedUsers) && mentionedUsers.some((user) => user?.id === botUserId)) {
    return true;
  }
  const content = message.content ?? "";
  return content.includes(`<@${botUserId}>`) || content.includes(`<@!${botUserId}>`);
}

function discordAttachments(message: DiscordMessageEvent["message"]): InboundAttachment[] {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return [];
  }
  return attachments.map((attachment) => ({
    mimeType: attachment.content_type ?? undefined,
    remoteId: attachment.id ? String(attachment.id) : undefined,
    url: attachment.url ?? undefined,
    filename: attachment.filename ?? undefined,
    size:
      typeof attachment.size === "number" && Number.isFinite(attachment.size)
        ? attachment.size
        : undefined,
  }));
}

function discordSender(
  author: User,
  member: DiscordMessageEvent["member"],
): SenderIdentity {
  const identity = resolveDiscordSenderIdentity({ author, member });
  return {
    SenderId: identity.id,
    SenderName: identity.name,
    SenderUsername: author.username ?? undefined,
  };
}

/**
 * Convert one Discord gateway message event into a {@link NormalizedInboundMessage}.
 *
 * Returns `undefined` for events that carry no actionable inbound message:
 * - no author (system events / partials),
 * - bot/self authored messages (loop-safety, mirrors the real preflight's
 *   "ignore own / drop bot" gate),
 * - empty bodies once Discord's attachment/embed fallbacks are applied.
 *
 * `botUserId` is optional; when provided it both enables self-message dropping
 * and powers `wasMentioned`. Authorization is NOT decided here — the gating
 * layer owns that. This only produces the normalized shape.
 */
export function normalizeDiscordMessageEvent(params: {
  event: DiscordMessageEvent;
  accountId: string;
  botUserId?: string;
}): NormalizedInboundMessage | undefined {
  const { event, accountId, botUserId } = params;
  const message = event.message;
  const author = event.author;
  if (!message || !author) {
    return undefined;
  }
  if (botUserId && author.id === botUserId) {
    return undefined;
  }
  if (author.bot) {
    return undefined;
  }

  const text = resolveDiscordMessageText(message, { includeForwarded: true });
  if (!text.trim()) {
    return undefined;
  }

  const channelType = (message as { channelType?: number }).channelType;
  const chatType = discordChatTypeFromChannelType(channelType);
  const timestamp =
    resolveTimestampMs((message as { timestamp?: string | null }).timestamp) ?? Date.now();

  return {
    channel: DISCORD_CONNECTOR_KIND,
    accountId,
    messageId: String(message.id),
    conversationId: String(message.channelId),
    chatType,
    sender: discordSender(author, event.member),
    text,
    wasMentioned: detectDiscordMention(message, botUserId),
    attachments: discordAttachments(message),
    timestamp,
    raw: event,
  };
}

/**
 * Type guard: narrows an `unknown` raw event to a {@link DiscordMessageEvent}
 * shape sufficient for {@link normalizeDiscordMessageEvent}. Used by the
 * ConnectorPort `normalize(rawEvent, accountId)` entrypoint, which must accept
 * `unknown` per the contract.
 */
export function isDiscordMessageEvent(value: unknown): value is DiscordMessageEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { message?: unknown; author?: unknown };
  return typeof candidate.message === "object" && candidate.message !== null;
}

/** Tag-form label for a Discord user, re-exported for adapter logging parity. */
export function discordUserLabel(user: User): string {
  return formatDiscordUserTag(user);
}
