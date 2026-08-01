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

/**
 * One versioned master-key ring entry (`{ version, masterKey }`). The keyring
 * (see `adapters/keyring.adapter.ts`) opens a stored row by ITS OWN version and
 * seals/re-keys new writes under the active (highest) version. `masterKey` may be
 * `null` for a rotated-out generation that must still ROUTE (open old rows) even
 * though it can no longer be the active sealer.
 */
export const vaultKeyringKeySchema = z.object({
  version: z.number().int().positive(),
  masterKey: z.string().nullable(),
});
export type VaultKeyringKeyConfig = z.infer<typeof vaultKeyringKeySchema>;

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
  /**
   * OPTIONAL versioned master-key ring. When supplied (2+ entries, or an explicit
   * ring), the secrets engine opens a row by its stored `keyVersion`, seals new
   * writes under the active version, and rotates v(n)→v(n+1) via `keyring.rekey`.
   * `null`/empty (default) ⇒ single-key mode = a v1-only ring derived from
   * `vaultMasterKey`, i.e. exactly today's behavior.
   */
  vaultKeys: z.array(vaultKeyringKeySchema).nullable(),
  /** Whether audit sealing into the durable Merkle chain is enabled. */
  auditEnabled: z.boolean(),
  /** Solo/desktop mode — click-is-approval clearance + audit fail-open (see `RuntimeConfig.soloMode`). */
  soloMode: z.boolean(),
  isProduction: z.boolean(),
});

export type GovernanceConfig = z.infer<typeof governanceConfigSchema>;

/** The not-yet-in-AppConfig governance values bootstrap may inject. */
export interface GovernanceConfigOverrides {
  readonly napiEnabled?: boolean;
  readonly daemonSocketPath?: string | null;
  readonly allowInsecureDaemon?: boolean;
  readonly vaultMasterKey?: string | null;
  /** Optional versioned key ring (additive); absent ⇒ single-key mode. */
  readonly vaultKeys?: readonly VaultKeyringKeyConfig[] | null;
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
    vaultKeys: overrides.vaultKeys ? [...overrides.vaultKeys] : null,
    auditEnabled: overrides.auditEnabled ?? true,
    soloMode: app.runtime.soloMode === true,
    isProduction: app.runtime.isProduction,
  });
}
