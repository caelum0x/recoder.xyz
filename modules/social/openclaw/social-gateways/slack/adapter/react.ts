// Owned by Recoder. Slack reaction (emoji ack) for the connector adapter. The
// real SDK call + emoji normalization are ported verbatim from the extracted
// `slack/actions.ts` (`reactSlackMessage` → `client.reactions.add`, with the
// `:emoji:` colon-stripping normalizer). Returns true on success; Slack's
// `already_reacted` is treated as success since the ack is idempotent.

import type { ReactionRequest } from "../../../src/connector/index.js";
import type { SlackWebClient } from "./web-client.js";

/** Strip surrounding colons from an emoji name (real `normalizeEmoji`). */
export function normalizeSlackEmoji(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Emoji is required for Slack reactions");
  }
  return trimmed.replace(/^:+|:+$/g, "");
}

/**
 * Apply an emoji reaction to an inbound Slack message via the real
 * `reactions.add` API. `conversationId` is the channel id and `messageId` is
 * the message ts. Returns false (rather than throwing) when Slack rejects the
 * reaction for a recoverable reason, so an ack failure never aborts a run.
 */
export async function reactSlackMessage(
  client: SlackWebClient,
  request: ReactionRequest,
): Promise<boolean> {
  const name = normalizeSlackEmoji(request.emoji);
  const response = await client.reactions.add({
    channel: request.conversationId,
    timestamp: request.messageId,
    name,
  });
  if (response.ok === false) {
    // `already_reacted` is a benign no-op: the ack is effectively in place.
    return response.error === "already_reacted";
  }
  return true;
}

/** Remove a previously-applied reaction (real `removeSlackReaction`). */
export async function unreactSlackMessage(
  client: SlackWebClient,
  request: ReactionRequest,
): Promise<boolean> {
  const name = normalizeSlackEmoji(request.emoji);
  const response = await client.reactions.remove({
    channel: request.conversationId,
    timestamp: request.messageId,
    name,
  });
  if (response.ok === false) {
    return response.error === "no_reaction";
  }
  return true;
}
