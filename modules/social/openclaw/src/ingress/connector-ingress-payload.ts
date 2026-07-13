// Owned by Recoder. The connectors-side half of the signature-verified ingress
// seam into the workspace loop (interop §7.4).
//
// A `NormalizedInboundMessage` is gated channel traffic, but it is still UNSIGNED
// — it cannot enter `@recoder/interop`'s hostile-by-default edge until it is
// wrapped in a canonical signed envelope and re-proven AT THE EDGE. interop owns
// the sealing + admission (`sealConnectorIngress` / `admitConnectorIngress`);
// this module owns the projection from the rich connector domain type onto the
// minimal, wire-agnostic payload interop carries through verification.
//
// Deliberately DEPENDENCY-FREE: it does NOT import `@recoder/interop`. interop is
// a core control-plane edge and the two packages stay decoupled (monorepo
// boundary rule) — interop must not import a connector runtime, and the
// connectors foundation must not depend on the edge. The local
// `ConnectorIngressPayload` here is byte-compatible with interop's exported type
// of the same name, so a sealed payload round-trips through the edge unchanged.

import type { NormalizedInboundMessage } from "../connector/inbound-message.js";

/**
 * The wire-agnostic subset of a normalized connector message that the interop
 * edge carries through signature verification into the workspace loop. Mirrors
 * `@recoder/interop`'s `ConnectorIngressPayload` field-for-field. Kept local so
 * the connectors foundation has zero edge dependency; the shapes are validated
 * to match by interop's own tests.
 */
export interface ConnectorIngressPayload {
  /** Which channel produced this message (telegram/slack/discord/…). */
  readonly channel: string;
  /** Connector account id the message arrived on (multi-account aware). */
  readonly accountId: string;
  /** Channel-native message id, used for replies/reactions/dedupe. */
  readonly messageId: string;
  /** Channel-native conversation id (chat/channel/thread). */
  readonly conversationId: string;
  /** Plain-text body of the message. */
  readonly text: string;
  /** Whether the assistant was explicitly @mentioned. */
  readonly wasMentioned: boolean;
  /** Epoch milliseconds the channel reports for the message. */
  readonly timestamp: number;
}

/**
 * Project a normalized inbound connector message onto the minimal ingress
 * payload interop seals + verifies. Pure and lossless for the carried fields;
 * the rich domain extras (sender identity, attachments, raw event, chatType) are
 * intentionally dropped at the trust boundary — the workspace loop receives only
 * the verified, channel-agnostic essentials. The original message stays
 * available connector-side for replies/reactions via the `ConnectorPort`.
 */
export function toConnectorIngressPayload(
  message: NormalizedInboundMessage,
): ConnectorIngressPayload {
  return {
    channel: message.channel,
    accountId: message.accountId,
    messageId: message.messageId,
    conversationId: message.conversationId,
    text: message.text,
    wasMentioned: message.wasMentioned,
    timestamp: message.timestamp,
  };
}
