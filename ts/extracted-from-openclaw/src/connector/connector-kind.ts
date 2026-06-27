// Owned by Recoder. The set of real social-gateway channels extracted from
// OpenClaw under ts/extracted-from-openclaw/social-gateways/*. Each kind has a
// real, working monitor/send/probe/normalize implementation in that tree which
// the per-channel adapters (built in a later phase) wrap behind ConnectorPort.

/**
 * Channels with real extracted source under `social-gateways/`. These are the
 * eight gateways the foundation must support. Planned-but-not-yet-extracted
 * adapters (wordpress/gmail/teams/linkedin/meet) are intentionally NOT listed
 * here — they belong to a separate `PlannedConnectorKind` so the foundation
 * never implies a channel is real when it is not.
 */
export const CONNECTOR_KINDS = [
  "telegram",
  "slack",
  "discord",
  "signal",
  "line",
  "feishu",
  "imessage",
  "whatsapp",
] as const;

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export function isConnectorKind(value: unknown): value is ConnectorKind {
  return (
    typeof value === "string" && (CONNECTOR_KINDS as readonly string[]).includes(value)
  );
}
