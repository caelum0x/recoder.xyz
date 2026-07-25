/**
 * `IdentityConfig` — the typed slice this domain consumes, derived PURELY from
 * the injected {@link AppConfig} (ARCHITECTURE §10.8: no `process.env` in domain
 * code). Secrets are represented as presence flags plus the in-memory value the
 * seam actually needs (the internal service key for constant-time compare).
 *
 * Fails SAFE: a missing Better Auth secret / auth DB URL surfaces as
 * `betterAuthSecretPresent=false` / `authDatabaseUrl=null`, which the adapter +
 * health translate into a truthful `down` — never a faked `up`.
 *
 * Note on the actual Better Auth secret + base URL: those are read by the
 * `@recoder/auth` package from its own env (`getAuthEnv`) at `createAuth()` time;
 * this slice only needs the *presence* to decide degrade, so the AppConfig
 * `auth` slice (presence-only) is sufficient and no `process.env` read happens in
 * this domain.
 */
import type { AppConfig } from '../../shared/app-config.js';

/** Static defaults for TTL/interval knobs not carried by AppConfig. */
export const IDENTITY_DEFAULTS = {
  /** RFC-8628 device grant lifetime. */
  deviceCodeTtlSeconds: 900,
  /** Minimum polling interval enforced on the device token endpoint. */
  devicePollIntervalSeconds: 5,
  /** Default `sk_` key expiry (null = non-expiring). */
  apiKeyDefaultTtlDays: null as number | null,
  /** The `sk_` key prefix segment length kept for the indexed lookup. */
  apiKeyPrefixLength: 12,
} as const;

export interface IdentityConfig {
  /** True when `BETTER_AUTH_SECRET` is configured (drives adapter degrade). */
  readonly betterAuthSecretPresent: boolean;
  /** Auth-database URL (the physically separate Better Auth DB), or `null`. */
  readonly authDatabaseUrl: string | null;
  /** Cross-subdomain cookie domain (falls back to the `@recoder/auth` default). */
  readonly cookieDomain: string | null;
  /** Strict auth — no anonymous fallback. Forced on in production. */
  readonly strictAuth: boolean;
  /** The `INTERNAL_SERVICE_KEY` value, held only in memory; never logged. */
  readonly internalServiceKey: string | null;
  /** True when an internal service key is configured. */
  readonly internalServiceKeyPresent: boolean;
  /** Solo/desktop mode — promote the local caller on mutating routes (see `RuntimeConfig.soloMode`). */
  readonly soloMode: boolean;
  readonly isProduction: boolean;
  readonly deviceCodeTtlSeconds: number;
  readonly devicePollIntervalSeconds: number;
  readonly apiKeyDefaultTtlDays: number | null;
  readonly apiKeyPrefixLength: number;
}

/** Project the identity slice out of the whole config. */
export function sliceIdentityConfig(app: AppConfig): IdentityConfig {
  return {
    betterAuthSecretPresent: app.auth.betterAuthSecretPresent,
    authDatabaseUrl: app.auth.authDatabaseUrl,
    cookieDomain: app.auth.cookieDomain,
    strictAuth: app.auth.strict,
    internalServiceKey: app.internal.serviceKey,
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    soloMode: app.runtime.soloMode === true,
    isProduction: app.runtime.isProduction,
    deviceCodeTtlSeconds: IDENTITY_DEFAULTS.deviceCodeTtlSeconds,
    devicePollIntervalSeconds: IDENTITY_DEFAULTS.devicePollIntervalSeconds,
    apiKeyDefaultTtlDays: IDENTITY_DEFAULTS.apiKeyDefaultTtlDays,
    apiKeyPrefixLength: IDENTITY_DEFAULTS.apiKeyPrefixLength,
  };
}
