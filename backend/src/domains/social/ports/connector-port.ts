/**
 * `ConnectorPort` — the domain seam for a single channel's send/monitor/probe
 * surface, NARROWED from the `@recoder/connectors` foundation contract. The
 * social domain binds channel adapters (openclaw social-gateways, in place) to
 * this seam; nothing in the domain shells out to a channel SDK directly.
 *
 * Re-exported straight from the foundation so there is exactly ONE contract
 * (never a second copy). If the foundation package is absent on disk, the
 * channel-adapter registry degrades that channel to `down` rather than crashing.
 */
export type {
  ConnectorPort,
  NormalizedInboundMessage,
  ConnectorProbeResult,
  OutboundMessage,
  OutboundTarget,
  SendResult,
} from '@recoder/connectors';
