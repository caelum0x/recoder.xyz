/**
 * `GovernanceConfig` — the typed slice this domain consumes, derived from the
 * injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain code).
 *
 * The foundational `AppConfig` (Phase 0) does not yet carry a `governance` /
 * `vault` slice, so this accessor derives what it can from existing slices
 * (`internal`, `runtime`) and applies degrade-safe defaults for the rest. A
 * future `AppConfig.governance` slice (bootstrap-owned) can supply the daemon
 * socket, napi toggle, vault master key, and rate-limit buckets; until then the
 * fail-safe posture holds:
 *   - no vault master key  -> secrets report `down` (never a faked write).
 *   - no daemon socket/bin -> kernel degrades to the pure-TS deny-biased rung.
 * `withGovernanceOverrides` lets bootstrap inject the not-yet-in-AppConfig
 * values without any domain code reading the environment.
 */
import { z } from 'zod';
import type { AppConfig } from '../../shared/app-config.js';

export const governanceConfigSchema = z.object({
  /** True when an `INTERNAL_SERVICE_KEY` is configured (gates `/internal/*`). */
  internalServiceKeyPresent: z.boolean(),
  /** Whether the in-proc napi kernel may be loaded (default on; degrade-safe). */
  napiEnabled: z.boolean(),
  /** Explicit UDS path for the governance daemon; `null` -> adapter resolves. */
  daemonSocketPath: z.string().nullable(),
  /** Whether the daemon may run without `INTERNAL_SERVICE_KEY` (local dev only). */
  allowInsecureDaemon: z.boolean(),
  /**
   * The vault master key (base64, 32 bytes) for envelope encryption. `null`
   * (default) makes the secrets engine report `down` — never a silent plaintext
   * or dropped write.
   */
  vaultMasterKey: z.string().nullable(),
  /** Whether audit sealing into the durable Merkle chain is enabled. */
  auditEnabled: z.boolean(),
  isProduction: z.boolean(),
});

export type GovernanceConfig = z.infer<typeof governanceConfigSchema>;

/** The not-yet-in-AppConfig governance values bootstrap may inject. */
export interface GovernanceConfigOverrides {
  readonly napiEnabled?: boolean;
  readonly daemonSocketPath?: string | null;
  readonly allowInsecureDaemon?: boolean;
  readonly vaultMasterKey?: string | null;
  readonly auditEnabled?: boolean;
}

/**
 * Project the governance slice out of the whole config. Derives the two values
 * `AppConfig` already carries (`internal.serviceKeyPresent`,
 * `runtime.isProduction`) and defaults the rest degrade-safe. `overrides` is the
 * seam bootstrap uses to supply the vault key / daemon socket without env reads.
 */
export function sliceGovernanceConfig(
  app: AppConfig,
  overrides: GovernanceConfigOverrides = {},
): GovernanceConfig {
  return governanceConfigSchema.parse({
    internalServiceKeyPresent: app.internal.serviceKeyPresent,
    napiEnabled: overrides.napiEnabled ?? true,
    daemonSocketPath: overrides.daemonSocketPath ?? null,
    allowInsecureDaemon: overrides.allowInsecureDaemon ?? !app.runtime.isProduction,
    vaultMasterKey: overrides.vaultMasterKey ?? null,
    auditEnabled: overrides.auditEnabled ?? true,
    isProduction: app.runtime.isProduction,
  });
}
