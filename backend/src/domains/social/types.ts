/**
 * Social domain value types — the vocabulary the connector ingress, trust
 * boundary (mention gate + webhook), and dispatch bind to.
 *
 * The 8 channel connectors (telegram/slack/discord/signal/imessage/whatsapp/
 * line/feishu) are resolved lazily at runtime by the openclaw gateway. Seven are
 * LIVE; `discord` is recognized but NOT wired to a live runtime here.
 */

/** The 8 connector channels the foundation supports. */
export const CHANNEL_IDS = [
  'telegram',
  'slack',
  'discord',
  'signal',
  'imessage',
  'whatsapp',
  'line',
  'feishu',
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

/** The 7 LIVE channels (discord dropped from the live set). */
export const LIVE_CHANNEL_IDS: readonly ChannelId[] = [
  'telegram',
  'slack',
  'signal',
  'imessage',
  'whatsapp',
  'line',
  'feishu',
];

/** Narrow an untrusted string to a `ChannelId`. */
export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === 'string' && (CHANNEL_IDS as readonly string[]).includes(value);
}

/** Whether a channel is in the live set (not merely a foundation adapter). */
export function isLiveChannel(id: ChannelId): boolean {
  return LIVE_CHANNEL_IDS.includes(id);
}

/**
 * A normalized inbound message that has crossed the transport boundary (webhook
 * HMAC verified / long-poll) but NOT yet the trust boundary (mention gate). It is
 * still UNTRUSTED channel content until the gate admits it.
 */
export interface InboundEnvelope {
  readonly channel: ChannelId;
  /** Channel-native room/chat id (the allowlist key). */
  readonly chatRef: string;
  /** Channel-native sender id / username. */
  readonly senderId: string;
  /** Channel-native message id (dedup / replay key). */
  readonly providerMsgId: string;
  /** Raw message text (untrusted). */
  readonly text: string;
  /** Whether the message @-mentions this agent (channel-provided or parsed). */
  readonly mentioned?: boolean;
  /** Arbitrary channel-native metadata (never trusted for control decisions). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** The parsed control command carried by an admitted inbound message. */
export interface ParsedCommand {
  /** e.g. `run` for `/run …`; `undefined` when the message is conversational. */
  readonly command?: string;
  /** The remaining text after the command token. */
  readonly args: string;
}

/** The trust-boundary decision the mention gate returns (hostile-by-default). */
export interface MentionDecision {
  /** Whether the inbound message is admitted past the trust boundary. */
  readonly admitted: boolean;
  /** Stable reason code (allowlist_empty|not_allowlisted|not_mentioned|admitted|…). */
  readonly code: string;
  readonly reason: string;
  /** The parsed command — present only when `admitted`. */
  readonly command?: ParsedCommand;
  /** The dispatch kind an admitted message routes to. */
  readonly dispatchKind?: 'conductor' | 'reply' | 'none';
}

/** The outcome of dispatching an admitted inbound message. */
export interface DispatchOutcome {
  readonly kind: 'conductor' | 'reply' | 'none';
  /** Conductor Run id when `kind === 'conductor'`. */
  readonly runId?: string;
  /** The in-channel reply text when `kind === 'reply'`. */
  readonly reply?: string;
  /** Truthful failure reason when dispatch could not proceed. */
  readonly error?: string;
}

/** Truthful per-channel health. */
export interface ChannelHealth {
  readonly channel: ChannelId;
  readonly status: 'up' | 'down' | 'degraded';
  /** Whether credentials/secret are configured for this channel. */
  readonly configured: boolean;
  readonly reason?: string;
}

/** A governance-gated outbound send request. */
export interface SendRequest {
  readonly channel: ChannelId;
  readonly chatRef: string;
  readonly text: string;
}

/** A persisted connector row (mirror of `connectors`). */
export interface ConnectorRow {
  readonly id: string;
  readonly channel: ChannelId;
  readonly enabled: boolean;
  readonly secretRef?: string;
  readonly status: 'up' | 'down' | 'degraded';
}

/** A persisted allowlist binding (mirror of `channel_bindings`). */
export interface ChannelBinding {
  readonly id: string;
  readonly connectorId: string;
  readonly userId: string;
  readonly spaceId?: string;
  readonly chatRef: string;
  /** Hostile-by-default: false unless explicitly allowed. */
  readonly allow: boolean;
  readonly agentId?: string;
}

/** A recorded inbound-log row (mirror of `inbound_messages`). */
export interface InboundLogEntry {
  readonly id: string;
  readonly connectorId: string;
  readonly chatRef: string;
  readonly providerMsg: string;
  readonly userId?: string;
  readonly decision: 'admitted' | 'rejected' | 'ignored';
  readonly reason?: string;
  readonly dispatchKind?: 'conductor' | 'reply' | 'none';
  readonly runId?: string;
}
