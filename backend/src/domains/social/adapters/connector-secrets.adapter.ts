/**
 * `connector-secrets.adapter` — the {@link ConnectorSecretsPort} implementation.
 * It resolves a channel's bot token (`kind:'token'`) or webhook signing secret
 * (`kind:'signing'`) from the channel's VAULT REFERENCE (never a value baked into
 * config).
 *
 * TRUTHFUL + fail-safe: a channel with no configured ref, or a vault that cannot
 * resolve it, yields `null` (the caller then marks the channel `down`) — NEVER a
 * fabricated value that would fake a live connection. A `directResolver` seam
 * lets bootstrap inject a local/dev secret source without a vault.
 *
 * LAST-precedence fallback: the ENGINE's own env convention. The openclaw
 * connectors resolve their credentials from `process.env` themselves (e.g.
 * telegram's `RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN`), so
 * this adapter mirrors those EXACT names — otherwise `configured`/`send` would
 * report `down` while the in-process connector could genuinely deliver. The env
 * source is injectable for tests and defaults to the same `process.env` the
 * engine reads; this is deliberately the engine's convention surfacing through
 * the seam, not a new domain config channel. Precedence stays
 * directResolver > vault > engine env; nothing set ⇒ truthfully `null`.
 */
import type { ChannelId } from '../types.js';
import type { ConnectorSecretsPort, SecretKind } from '../ports/connector-secrets.port.js';

/** A minimal vault seam: resolve a reference → its secret value (or `null`). */
export interface SecretVaultResolver {
  resolve(ref: string, kind: SecretKind): Promise<string | null>;
}

/** A direct (local/dev) secret source injected by bootstrap; no vault required. */
export type DirectSecretResolver = (channel: ChannelId, kind: SecretKind) => Promise<string | null> | string | null;

/** An env-var source (injectable for tests; defaults to the engine's `process.env`). */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * The engine-owned env names each connector ITSELF reads for its default-account
 * bot token. These mirror the openclaw connectors exactly (verified against
 * `apps/desktop/engines/openclaw/social-gateways/<channel>`); channels whose
 * credentials are not a single env secret (signal, imessage, feishu) have no
 * entry and keep resolving `null` — truthful, never a guessed name.
 */
const ENGINE_TOKEN_ENV: Partial<Record<ChannelId, readonly string[]>> = {
  telegram: ['RECODER_CONNECTORS_TELEGRAM_BOT_TOKEN', 'OPENCLAW_TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN'],
  discord: ['RECODER_CONNECTORS_DISCORD_BOT_TOKEN', 'OPENCLAW_DISCORD_BOT_TOKEN', 'DISCORD_BOT_TOKEN'],
  slack: ['SLACK_BOT_TOKEN'],
  line: ['RECODER_LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_ACCESS_TOKEN'],
  whatsapp: ['WHATSAPP_TOKEN'],
};

/** Engine-owned webhook signing-secret env names (webhook channels only). */
const ENGINE_SIGNING_ENV: Partial<Record<ChannelId, readonly string[]>> = {
  slack: ['SLACK_SIGNING_SECRET'],
  line: ['RECODER_LINE_CHANNEL_SECRET', 'LINE_CHANNEL_SECRET'],
};

export interface ConnectorSecretsDeps {
  /** Per-channel token refs (from `SocialConfig.channels[channel].secretRef`). */
  readonly tokenRefs: Partial<Record<ChannelId, string | null>>;
  /** Per-channel webhook signing refs; falls back to the token ref when absent. */
  readonly signingRefs?: Partial<Record<ChannelId, string | null>>;
  /** Vault seam that resolves a ref to a value (degrade-safe; absent ⇒ null). */
  readonly vault?: SecretVaultResolver;
  /** Direct local secret source (takes precedence over the vault when present). */
  readonly directResolver?: DirectSecretResolver;
  /** Env source for the engine-convention fallback; defaults to `process.env`. */
  readonly env?: EnvSource;
}

/** Resolve a secret from the engine's own env convention; `null` when unset. */
export function resolveEngineEnvSecret(env: EnvSource, channel: ChannelId, kind: SecretKind): string | null {
  const names = (kind === 'signing' ? ENGINE_SIGNING_ENV : ENGINE_TOKEN_ENV)[channel] ?? [];
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** Build the connector-secrets adapter. Pure factory; fail-safe by construction. */
export function createConnectorSecretsAdapter(deps: ConnectorSecretsDeps): ConnectorSecretsPort {
  const { tokenRefs, signingRefs, vault, directResolver } = deps;
  // Default to the SAME process env the in-process engine connectors read, so the
  // domain gate cannot report `down` for a channel the connector can serve.
  const env: EnvSource = deps.env ?? process.env;

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
      if (ref && vault) {
        const fromVault = await safe(() => vault.resolve(ref, kind));
        if (fromVault) return fromVault;
      }
      // 3. The engine's own env convention (last precedence; null when unset).
      return resolveEngineEnvSecret(env, channel, kind);
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
