/**
 * `connector-secrets.adapter` — the {@link ConnectorSecretsPort} implementation.
 * It resolves a channel's bot token (`kind:'token'`) or webhook signing secret
 * (`kind:'signing'`) from the channel's VAULT REFERENCE (never a value baked into
 * config).
 *
 * TRUTHFUL + fail-safe: a channel with no configured ref, or a vault that cannot
 * resolve it, yields `null` (the caller then marks the channel `down`) — NEVER a
 * fabricated value that would fake a live connection. A `directResolver` seam
 * lets bootstrap inject a local/dev secret source without a vault; when neither a
 * direct source nor a vault is present, every resolve is truthfully `null`.
 */
import type { ChannelId } from '../types.js';
import type { ConnectorSecretsPort, SecretKind } from '../ports/connector-secrets.port.js';

/** A minimal vault seam: resolve a reference → its secret value (or `null`). */
export interface SecretVaultResolver {
  resolve(ref: string, kind: SecretKind): Promise<string | null>;
}

/** A direct (local/dev) secret source injected by bootstrap; no vault required. */
export type DirectSecretResolver = (channel: ChannelId, kind: SecretKind) => Promise<string | null> | string | null;

export interface ConnectorSecretsDeps {
  /** Per-channel token refs (from `SocialConfig.channels[channel].secretRef`). */
  readonly tokenRefs: Partial<Record<ChannelId, string | null>>;
  /** Per-channel webhook signing refs; falls back to the token ref when absent. */
  readonly signingRefs?: Partial<Record<ChannelId, string | null>>;
  /** Vault seam that resolves a ref to a value (degrade-safe; absent ⇒ null). */
  readonly vault?: SecretVaultResolver;
  /** Direct local secret source (takes precedence over the vault when present). */
  readonly directResolver?: DirectSecretResolver;
}

/** Build the connector-secrets adapter. Pure factory; fail-safe by construction. */
export function createConnectorSecretsAdapter(deps: ConnectorSecretsDeps): ConnectorSecretsPort {
  const { tokenRefs, signingRefs, vault, directResolver } = deps;

  function refFor(channel: ChannelId, kind: SecretKind): string | null {
    if (kind === 'signing') return signingRefs?.[channel] ?? tokenRefs[channel] ?? null;
    return tokenRefs[channel] ?? null;
  }

  return {
    async resolve(channel: ChannelId, kind: SecretKind): Promise<string | null> {
      // 1. Direct source (local/dev) wins when configured.
      if (directResolver) {
        const direct = await safe(async () => directResolver(channel, kind));
        if (direct) return direct;
      }
      // 2. Vault-backed reference resolution.
      const ref = refFor(channel, kind);
      if (!ref || !vault) return null; // no ref or no vault ⇒ truthfully unavailable.
      return (await safe(() => vault.resolve(ref, kind))) ?? null;
    },
  };
}

async function safe<T>(fn: () => Promise<T> | T): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
