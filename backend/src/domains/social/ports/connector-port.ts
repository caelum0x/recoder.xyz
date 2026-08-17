/**
 * `ConnectorPort` — the domain seam for a single channel's send/monitor/probe
 * surface. The social domain binds channel adapters (openclaw social-gateways,
 * loaded at runtime via a variable import specifier) to this seam; nothing in
 * the domain shells out to a channel SDK directly.
 *
 * The contract is OWNED here, in the domain, rather than re-exported from an
 * external foundation package. The concrete channel connectors are resolved
 * lazily at runtime by {@link ../adapters/openclaw-gateway.adapter}; when a
 * channel dep is absent on disk the gateway resolves `null` and the
 * channel-adapter registry degrades that channel to `down` rather than crashing.
 * Keeping the contract local means the domain always type-checks and ships,
 * whether or not a given channel implementation is present.
 */
import type { ChannelId } from '../types.js';

/** Where an outbound message is delivered. */
export interface OutboundTarget {
  readonly channel: ChannelId;
  /** The connector account/bot identity to send as (default `'default'`). */
  readonly accountId: string;
  /** The channel-native conversation/chat id to deliver into. */
  readonly conversationId: string;
  /** Optional provider message id to reply to (threading / quote). */
  readonly replyTo?: string;
}

/** An outbound message a connector sends over a channel. */
export interface OutboundMessage {
  readonly target: OutboundTarget;
  readonly text: string;
}

/** The result of a send attempt. `delivered:false` is a truthful non-delivery. */
export interface SendResult {
  readonly delivered: boolean;
  /** Provider message ids created by the send (empty when not delivered). */
  readonly messageIds: readonly string[];
}

/** The result of a channel reachability probe. */
export interface ConnectorProbeResult {
  readonly ready: boolean;
  /** Human-readable reason when `ready:false`. */
  readonly error?: string;
}

/** A normalized inbound message a channel monitor emits. */
export interface NormalizedInboundMessage {
  /** Channel id the message arrived on (falls back to the monitored channel). */
  readonly channel?: string;
  /** Channel-native conversation/chat id. */
  readonly conversationId: string;
  /** Channel-native message id. */
  readonly messageId: string;
  /** Message body text. */
  readonly text?: string;
  /** Whether the bot was mentioned (channel-dependent). */
  readonly mentioned?: boolean;
  /** Sender identity, in whatever form the channel provides. */
  readonly sender?: {
    readonly SenderId?: string;
    readonly SenderUsername?: string;
    readonly SenderE164?: string;
  };
}

/** A live monitor handle; `stop()` detaches the long-poll/stream. */
export interface ConnectorMonitorHandle {
  stop(): Promise<void>;
}

/**
 * A single channel's send/monitor/probe surface. Concrete connectors are
 * structurally validated (has `send`/`probe`/`monitor`) at resolution time.
 */
export interface ConnectorPort {
  /** Send an outbound message; returns a truthful delivery result. */
  send(message: OutboundMessage): Promise<SendResult>;
  /** Probe channel reachability for the given account. */
  probe(accountId: string): Promise<ConnectorProbeResult>;
  /** Start a long-poll/stream monitor; `onMessage` fires per inbound message. */
  monitor(
    accountId: string,
    onMessage: (message: NormalizedInboundMessage) => void,
  ): Promise<ConnectorMonitorHandle>;
  /**
   * Normalize a verified webhook payload into an inbound message. Optional:
   * channels that only long-poll (no webhook) omit it. May be sync or async.
   */
  normalize?(
    payload: unknown,
    accountId: string,
  ): NormalizedInboundMessage | null | Promise<NormalizedInboundMessage | null>;
}
