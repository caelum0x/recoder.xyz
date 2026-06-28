// Owned by Recoder. Ported from OpenClaw's `src/infra/channel-activity.ts`. An
// in-process last-inbound/last-outbound activity tracker keyed by channel +
// account. The upstream `ChannelId` type lives in the un-extracted plugin graph
// (`channels/plugins/types.core.ts`), so it is mirrored here structurally — the
// real `ChatChannelId | (string & {})` union over the known channel ids — rather
// than dragging the whole plugin surface in. Logic unchanged real code.

/** The known chat-channel ids, mirrored from upstream `CHAT_CHANNEL_ORDER`. */
export type ChatChannelId =
  | "telegram"
  | "whatsapp"
  | "discord"
  | "irc"
  | "googlechat"
  | "slack"
  | "signal"
  | "imessage";

/** A channel id: a known chat channel or any other channel-plugin id string. */
export type ChannelId = ChatChannelId | (string & {});

export type ChannelDirection = "inbound" | "outbound";

type ActivityEntry = {
  inboundAt: number | null;
  outboundAt: number | null;
};

const activity = new Map<string, ActivityEntry>();

function keyFor(channel: ChannelId, accountId: string) {
  return `${channel}:${accountId || "default"}`;
}

function ensureEntry(channel: ChannelId, accountId: string): ActivityEntry {
  const key = keyFor(channel, accountId);
  const existing = activity.get(key);
  if (existing) {
    return existing;
  }
  const created: ActivityEntry = { inboundAt: null, outboundAt: null };
  activity.set(key, created);
  return created;
}

export function recordChannelActivity(params: {
  channel: ChannelId;
  accountId?: string | null;
  direction: ChannelDirection;
  at?: number;
}) {
  const at = typeof params.at === "number" ? params.at : Date.now();
  const accountId = params.accountId?.trim() || "default";
  const entry = ensureEntry(params.channel, accountId);
  if (params.direction === "inbound") {
    entry.inboundAt = at;
  }
  if (params.direction === "outbound") {
    entry.outboundAt = at;
  }
}

export function getChannelActivity(params: {
  channel: ChannelId;
  accountId?: string | null;
}): ActivityEntry {
  const accountId = params.accountId?.trim() || "default";
  return (
    activity.get(keyFor(params.channel, accountId)) ?? {
      inboundAt: null,
      outboundAt: null,
    }
  );
}

export function resetChannelActivityForTest() {
  activity.clear();
}
