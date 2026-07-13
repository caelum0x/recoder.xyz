// Owned by Recoder. Outbound target parsing + delivery for the Discord
// ConnectorPort adapter.
//
// Target parsing ports the REAL `parseDiscordTarget` semantics from ../targets.ts
// (which is welded to the un-extracted ../channels/targets.js + ../directory-live
// machinery): `<@id>` / `<@!id>` mentions and the `user:` / `channel:` /
// `discord:` prefixes resolve to a user (DM) or channel recipient. Delivery
// mirrors `sendMessageDiscord` (../send.outbound.ts): a user recipient first
// opens a DM channel, then each chunk is POSTed to channelMessages with the
// first chunk threaded under `replyTo`. The bot-core media/poll/markdown/chunk-
// mode/channel-activity couplings are intentionally dropped — this is the plain
// text send path the ConnectorPort contract delivers.

import type { DiscordApiClient, DiscordCreatedMessage } from "./discord-api.js";
import { DISCORD_MAX_MESSAGE_LENGTH } from "./discord-api.js";
import { chunkDiscordText } from "./chunk.js";

/** A parsed Discord recipient: a user (DM target) or a channel. */
export interface DiscordRecipient {
  readonly kind: "user" | "channel";
  readonly id: string;
}

/**
 * Parse a Discord recipient string into a {@link DiscordRecipient}. Mirrors the
 * real ../targets.ts precedence:
 *  - `<@id>` / `<@!id>` mention   -> user
 *  - `user:<id>`                  -> user (DM)
 *  - `channel:<id>`               -> channel
 *  - `discord:<id>`               -> user (DM)
 *  - `@<id>` (numeric)            -> user (DM)
 *  - bare numeric / other         -> channel (the connector conversationId is a
 *                                    channel id, so plain ids are channels)
 */
export function parseDiscordRecipient(raw: string): DiscordRecipient {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for Discord sends");
  }

  const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    return { kind: "user", id: mentionMatch[1] };
  }
  if (trimmed.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    if (!id) {
      throw new Error(`Discord recipient "user:" requires a user id`);
    }
    return { kind: "user", id };
  }
  if (trimmed.startsWith("channel:")) {
    const id = trimmed.slice("channel:".length).trim();
    if (!id) {
      throw new Error(`Discord recipient "channel:" requires a channel id`);
    }
    return { kind: "channel", id };
  }
  if (trimmed.startsWith("discord:")) {
    const id = trimmed.slice("discord:".length).trim();
    if (!id) {
      throw new Error(`Discord recipient "discord:" requires a user id`);
    }
    return { kind: "user", id };
  }
  if (trimmed.startsWith("@")) {
    const id = trimmed.slice(1).trim();
    if (!/^\d+$/.test(id)) {
      throw new Error("Discord DMs require a user id (use user:<id> or a <@id> mention)");
    }
    return { kind: "user", id };
  }
  // A connector conversationId is a channel id; bare ids are channel targets.
  return { kind: "channel", id: trimmed };
}

/** Normalize a custom-emoji reaction (`<:name:id>`) / unicode emoji to a url-safe id. */
export function normalizeReactionEmoji(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("emoji required");
  }
  const customMatch = trimmed.match(/^<a?:([^:>]+):(\d+)>$/);
  const identifier = customMatch
    ? `${customMatch[1]}:${customMatch[2]}`
    : trimmed.replace(/[\uFE0E\uFE0F]/g, "");
  return encodeURIComponent(identifier);
}

export interface DiscordDeliveryParams {
  readonly client: DiscordApiClient;
  /** Recipient string (channel id, `user:<id>`, `<@id>`, …). */
  readonly to: string;
  /** Full text body; chunked to {@link DISCORD_MAX_MESSAGE_LENGTH}. */
  readonly text: string;
  /** Pre-chunked segments; when present each is delivered as its own message. */
  readonly chunks?: readonly string[];
  /** Message id to reply to / thread the first chunk under. */
  readonly replyTo?: string;
}

export interface DiscordDeliveryResult {
  readonly delivered: boolean;
  readonly messageIds: string[];
  /** The channel the message(s) landed in (the resolved DM channel for users). */
  readonly channelId: string;
}

/** Resolve a recipient to a concrete channel id, opening a DM when needed. */
async function resolveChannelId(
  client: DiscordApiClient,
  recipient: DiscordRecipient,
): Promise<string> {
  if (recipient.kind === "channel") {
    return recipient.id;
  }
  return client.createDmChannel(recipient.id);
}

/**
 * Deliver `text`/`chunks` to a Discord recipient. Opens a DM channel for user
 * recipients, then POSTs each chunk to channelMessages; only the first chunk is
 * threaded under `replyTo`, matching the real `sendMessageDiscord` behavior.
 */
export async function deliverDiscordMessage(
  params: DiscordDeliveryParams,
): Promise<DiscordDeliveryResult> {
  const segments =
    params.chunks && params.chunks.length > 0
      ? params.chunks.flatMap((chunk) =>
          chunkDiscordText(chunk, { maxChars: DISCORD_MAX_MESSAGE_LENGTH }),
        )
      : chunkDiscordText(params.text, { maxChars: DISCORD_MAX_MESSAGE_LENGTH });

  const nonEmpty = segments.filter((segment) => segment.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("Message must be non-empty for Discord sends");
  }

  const recipient = parseDiscordRecipient(params.to);
  const channelId = await resolveChannelId(params.client, recipient);

  const messageIds: string[] = [];
  let last: DiscordCreatedMessage | undefined;
  for (let i = 0; i < nonEmpty.length; i += 1) {
    const created = await params.client.createMessage({
      channelId,
      content: nonEmpty[i],
      replyTo: i === 0 ? params.replyTo : undefined,
    });
    last = created;
    messageIds.push(String(created.id));
  }

  return {
    delivered: messageIds.length > 0,
    messageIds,
    channelId: last ? String(last.channel_id ?? channelId) : channelId,
  };
}
