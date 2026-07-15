/**
 * `ConnectorSecretsPort` — per-channel secret resolution (vault-backed). Resolves
 * a channel's bot token or webhook signing secret from its vault reference.
 *
 * Truthful + fail-safe: a missing secret resolves to `null` (the caller then
 * marks the channel `down`) — NEVER a fabricated value that would fake a
 * connection. The secret value never leaves this seam except to the connector.
 */
import type { ChannelId } from '../types.js';

/** The kind of secret a channel needs. */
export type SecretKind = 'token' | 'signing';

export interface ConnectorSecretsPort {
  /** Resolve a channel secret; `null` when absent (channel then reports `down`). */
  resolve(channel: ChannelId, kind: SecretKind): Promise<string | null>;
}
