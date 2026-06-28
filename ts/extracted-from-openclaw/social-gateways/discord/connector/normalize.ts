// Owned by Recoder. Discord gateway message event -> NormalizedInboundMessage,
// for the ConnectorPort adapter.
//
// This ports the REAL normalization the extracted gateway performs in
// ../normalize.ts + ../monitor/{sender-identity,format}.ts — channel-type ->
// ChatType (DM -> direct, GroupDM -> group, everything guild-side -> channel),
// sender id/name/tag/display resolution, `<@id>` / mentions.users mention
// detection, attachment mapping, and Discord ISO-8601 timestamp parsing —
// standalone. The original `../normalize.ts` is welded to ../monitor/message-
// utils.ts (which pulls the un-extracted ../../media/* + ../../globals.js) and to
// the `@buape/carbon` `User` value type; this slice consumes the SAME structural
// fields off the gateway event so it compiles in isolation with no bot-core and
// no optional-peer SDK import. Behavior is preserved; the output shape is the
// foundation's `NormalizedInboundMessage`.

import type {
  ChatType,
  InboundAttachment,
  NormalizedInboundMessage,
  SenderIdentity,
} from "../../../src/connector/index.js";

const CHANNEL = "discord" as const;

/** Carbon/discord-api `ChannelType` ids we branch on. (DM = 1, GroupDM = 3.) */
const CHANNEL_TYPE_DM = 1;
const CHANNEL_TYPE_GROUP_DM = 3;

/** The structural subset of the Discord gateway message `author` we consume. */
export interface DiscordEventUser {
  readonly id: string;
  readonly username?: string;
  readonly globalName?: string | null;
  readonly discriminator?: string;
  readonly bot?: boolean;
}

/** The structural subset of the Discord message attachment we consume. Mirrors
 * the real `discord-api-types` `APIAttachment` (id/filename/content_type/url/size). */
interface DiscordAttachmentShape {
  readonly id?: string | number;
  readonly filename?: string;
  readonly content_type?: string | null;
  readonly url?: string;
  readonly size?: number;
}

/** The structural subset of a Discord gateway message we consume. */
export interface DiscordEventMessage {
  readonly id: string | number;
  readonly channelId: string | number;
  readonly content?: string;
  readonly channelType?: number;
  readonly timestamp?: string | null;
  readonly attachments?: readonly DiscordAttachmentShape[];
  readonly mentions?: { users?: Array<{ id?: string }> };
}

/** Optional guild-member context carried by guild messages. */
export interface DiscordEventMember {
  readonly nickname?: string | null;
}

/**
 * One Discord gateway `MessageCreate` event in its wire-agnostic structural
 * form. The carbon `MessageCreateListener` payload exposes exactly these fields
 * (`message`, `author`, `member`); the adapter's `normalize()` entrypoint
 * narrows an `unknown` raw event to this shape.
 */
export interface DiscordGatewayEvent {
  readonly message: DiscordEventMessage;
  readonly author: DiscordEventUser;
  readonly member?: DiscordEventMember;
}

/**
 * Map a Discord channel type to the wire-agnostic {@link ChatType}. DM and
 * group-DM surfaces are direct/group; everything guild-side (text channel,
 * thread, voice, forum, …) normalizes to `channel`. Mirrors the real preflight
 * branching (`channelInfo?.type === ChannelType.DM` / `GroupDM`).
 */
export function discordChatTypeFromChannelType(channelType: number | undefined): ChatType {
  if (channelType === CHANNEL_TYPE_DM) {
    return "direct";
  }
  if (channelType === CHANNEL_TYPE_GROUP_DM) {
    return "group";
  }
  return "channel";
}

/** Tag-form label for a Discord user (username#discriminator or username). */
export function formatDiscordUserTag(user: DiscordEventUser): string {
  const discriminator = (user.discriminator ?? "").trim();
  if (discriminator && discriminator !== "0") {
    return `${user.username}#${discriminator}`;
  }
  return user.username ?? user.id;
}

/** Parse a Discord ISO-8601 message timestamp to epoch ms, or undefined. */
export function resolveTimestampMs(timestamp?: string | null): number | undefined {
  if (!timestamp) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Resolve the channel-side sender identity, mirroring the real
 * `resolveDiscordSenderIdentity` (non-PluralKit path): the display name prefers
 * member nickname, then global name, then username; the username is the channel
 * handle.
 */
function discordSender(author: DiscordEventUser, member?: DiscordEventMember): SenderIdentity {
  const display =
    member?.nickname ?? author.globalName ?? author.username ?? formatDiscordUserTag(author);
  return {
    SenderId: author.id,
    SenderName: display ?? undefined,
    SenderUsername: author.username ?? undefined,
  };
}

/**
 * True when the message mentions the bot user, either via a resolved member id
 * mention or an `<@id>` / `<@!id>` token in the raw content. Uses only the
 * fields the gateway exposes on the message; no network round-trips.
 */
function detectDiscordMention(message: DiscordEventMessage, botUserId?: string): boolean {
  if (!botUserId) {
    return false;
  }
  const mentionedUsers = message.mentions?.users;
  if (Array.isArray(mentionedUsers) && mentionedUsers.some((user) => user?.id === botUserId)) {
    return true;
  }
  const content = message.content ?? "";
  return content.includes(`<@${botUserId}>`) || content.includes(`<@!${botUserId}>`);
}

function discordAttachments(message: DiscordEventMessage): InboundAttachment[] {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return [];
  }
  return attachments.map(
    (attachment): InboundAttachment => ({
      mimeType: attachment.content_type ?? undefined,
      remoteId: attachment.id != null ? String(attachment.id) : undefined,
      url: attachment.url ?? undefined,
      filename: attachment.filename ?? undefined,
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? attachment.size
          : undefined,
    }),
  );
}

/**
 * Convert one Discord gateway message event into a {@link NormalizedInboundMessage}.
 *
 * Returns `undefined` for events that carry no actionable inbound message:
 * - no author (system events / partials),
 * - bot/self authored messages (loop-safety, mirrors the real preflight's
 *   "ignore own / drop bot" gate),
 * - empty bodies (no text, no attachments).
 *
 * `botUserId` is optional; when provided it both enables self-message dropping
 * and powers `wasMentioned`. Authorization is NOT decided here — the gating
 * layer owns that. This only produces the normalized shape.
 */
export function normalizeDiscordMessageEvent(params: {
  event: DiscordGatewayEvent;
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

  const text = (message.content ?? "").trim();
  const attachments = discordAttachments(message);
  if (!text && attachments.length === 0) {
    return undefined;
  }

  const chatType = discordChatTypeFromChannelType(message.channelType);
  const timestamp = resolveTimestampMs(message.timestamp) ?? Date.now();

  return {
    channel: CHANNEL,
    accountId,
    messageId: String(message.id),
    conversationId: String(message.channelId),
    chatType,
    sender: discordSender(author, event.member),
    text,
    wasMentioned: detectDiscordMention(message, botUserId),
    attachments,
    timestamp,
    raw: event,
  };
}

/**
 * Type guard: narrows an `unknown` raw event to a {@link DiscordGatewayEvent}
 * shape sufficient for {@link normalizeDiscordMessageEvent}. Used by the
 * ConnectorPort `normalize(rawEvent, accountId)` entrypoint, which must accept
 * `unknown` per the contract.
 */
export function isDiscordGatewayEvent(value: unknown): value is DiscordGatewayEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { message?: unknown; author?: unknown };
  if (!candidate.message || typeof candidate.message !== "object") {
    return false;
  }
  if (!candidate.author || typeof candidate.author !== "object") {
    return false;
  }
  const author = candidate.author as { id?: unknown };
  return typeof author.id === "string";
}
