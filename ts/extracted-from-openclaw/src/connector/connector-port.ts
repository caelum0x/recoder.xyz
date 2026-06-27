// Owned by Recoder. The uniform connector contract every social gateway must
// implement (interop §7.4 ports/connector-port.ts). Grounded in the real
// extracted gateway signatures: monitorTelegramProvider / sendMessageTelegram /
// probeTelegram / reactMessageTelegram (and their slack/discord/signal/line/
// feishu/imessage/whatsapp equivalents). The per-channel adapters built in a
// later phase wrap each gateway's native functions behind this single port.

import type { ConnectorKind } from "./connector-kind.js";
import type { NormalizedInboundMessage } from "./inbound-message.js";
import type {
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "./outbound-message.js";

/** Truthful readiness of a connector account (interop: never fake health). */
export interface ConnectorProbeResult {
  readonly channel: ConnectorKind;
  readonly accountId: string;
  /** True only when the account is genuinely reachable and authorized. */
  readonly ready: boolean;
  /** Optional channel-reported identity (bot username, phone, workspace). */
  readonly identity?: string;
  /** Truthful error string when not ready — surfaced, never swallowed. */
  readonly error?: string;
  /** Epoch ms the probe ran. */
  readonly checkedAt: number;
}

/** Handle returned by `monitor()` so callers can stop the ingress loop. */
export interface ConnectorMonitorHandle {
  /** Stop monitoring and release the channel connection/poller. */
  stop(): Promise<void>;
}

/** Callback invoked for each normalized inbound message. */
export type InboundHandler = (message: NormalizedInboundMessage) => void | Promise<void>;

/**
 * The uniform connector contract. Every channel under `social-gateways/*`
 * implements exactly this shape. Hostile-by-default: `monitor` emits already
 * `normalize`d messages, but authorization is the gating layer's job, not the
 * port's — the port never decides whether to act.
 */
export interface ConnectorPort {
  /** Which channel this connector speaks. */
  readonly kind: ConnectorKind;

  /**
   * Start ingress for the given account, invoking `onMessage` with each
   * normalized inbound message. Mirrors `monitor<Channel>Provider` (e.g.
   * `monitorTelegramProvider`). Resolves to a handle that stops the loop.
   */
  monitor(accountId: string, onMessage: InboundHandler): Promise<ConnectorMonitorHandle>;

  /**
   * Deliver an outbound message. Mirrors `sendMessage<Channel>` (e.g.
   * `sendMessageTelegram`). Chunks `text` to the channel's max payload when no
   * explicit `chunks` are provided.
   */
  send(message: OutboundMessage): Promise<SendResult>;

  /**
   * Check truthful readiness of an account. Mirrors `probe<Channel>` (e.g.
   * `probeTelegram`). Must never report `ready` unless genuinely reachable.
   */
  probe(accountId: string): Promise<ConnectorProbeResult>;

  /**
   * Convert one channel-native event payload into a wire-agnostic message.
   * Mirrors each gateway's `normalize` (e.g. telegram update → message). Pure
   * where possible; returns undefined for events that carry no actionable
   * message (system/edit/typing events).
   */
  normalize(rawEvent: unknown, accountId: string): NormalizedInboundMessage | undefined;

  /**
   * Apply an emoji reaction / ack to an inbound message. Mirrors
   * `reactMessage<Channel>` (e.g. `reactMessageTelegram`). Channels without
   * reaction support resolve `false`.
   */
  react(request: ReactionRequest): Promise<boolean>;
}
