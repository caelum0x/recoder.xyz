// Owned by Recoder. Slack channel-type inference + mapping to the foundation
// ChatType. Ported verbatim in behavior from the real extracted
// `slack/monitor/context.ts` (`inferSlackChannelType` /
// `normalizeSlackChannelType`). The id-prefix heuristics (D→im, C→channel,
// G→group) and the channel_type → ChatType collapse are the same real logic.

import type { ChatType } from "../../../src/connector/index.js";

/** Slack-native conversation type as reported on events. */
export type SlackChannelType = "im" | "mpim" | "channel" | "group";

/** Infer the Slack channel type from a channel id prefix (real heuristic). */
export function inferSlackChannelType(channelId?: string | null): SlackChannelType | undefined {
  const trimmed = channelId?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("D")) {
    return "im";
  }
  if (trimmed.startsWith("C")) {
    return "channel";
  }
  if (trimmed.startsWith("G")) {
    return "group";
  }
  return undefined;
}

/** Normalize an event-reported channel_type, falling back to id inference. */
export function normalizeSlackChannelType(
  channelType?: string | null,
  channelId?: string | null,
): SlackChannelType {
  const normalized = channelType?.trim().toLowerCase();
  if (
    normalized === "im" ||
    normalized === "mpim" ||
    normalized === "channel" ||
    normalized === "group"
  ) {
    return normalized;
  }
  return inferSlackChannelType(channelId) ?? "channel";
}

/** Collapse a Slack channel type to the wire-agnostic foundation ChatType. */
export function slackChatTypeToChatType(channelType: SlackChannelType): ChatType {
  if (channelType === "im") {
    return "direct";
  }
  if (channelType === "mpim" || channelType === "group") {
    return "group";
  }
  return "channel";
}
