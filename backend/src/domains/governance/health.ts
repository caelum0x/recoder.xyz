/**
 * Truthful governance health (ARCHITECTURE §10.1). The moat reports the state of
 * its three load-bearing engines, never a faked `up`:
 *
 *  - `kernel:<rung>` — which ladder rung answers (`napi` in-proc = fully up;
 *    `daemon`/`ts` = serving but `degraded`; `synthetic` = no rung = `down`).
 *    Truthful posture: when the napi addon is absent the ladder falls to the
 *    deny-biased pure-TS floor and this reports `degraded` (serving, not native).
 *  - `audit-db`     — the persistence pool the durable Merkle chain seals into;
 *    `down` when unavailable (writes fail-closed, the module still denies/reads).
 *  - `vault`        — the envelope-encryption seam; `down` when no master key
 *    (secrets refuse to store/read rather than persist plaintext).
 *
 * Rollup: kernel not serving → `down`. Otherwise `degraded` when the kernel is
 * non-native, the audit DB is unreachable, or the vault is unconfigured; else
 * `up`. So a Postgres-less / vault-less boot is truthfully `degraded`, never a
 * fabricated `up`.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { GovernanceKernelPort } from './ports/kernel.port.js';

/**
 * The minimal vault posture health needs: liveness + a truthful engine status.
 * Both the single-key {@link VaultAdapter} and the versioned `VaultKeyring`
 * satisfy this structurally, so health can report whichever seam the secrets
 * engine actually consumes (the keyring, once wired).
 */
export interface VaultHealthSource {
  readonly available: boolean;
  status(): EngineStatus;
}

export interface GovernanceHealthDeps {
  readonly kernel: GovernanceKernelPort;
  /** The persistence executor the durable audit chain + repos bind to. */
  readonly executor: QueryExecutor;
  /** The envelope-encryption seam behind the secrets engine (vault or keyring). */
  readonly vault: VaultHealthSource;
  /** Whether durable audit sealing is enabled (config). */
  readonly auditEnabled: boolean;
}

/** Build the governance component health from the live kernel + persistence + vault. */
export function buildGovernanceHealth(deps: GovernanceHealthDeps): ComponentHealth {
  const { kernel, executor, vault, auditEnabled } = deps;

  const ks = kernel.status();
  const kernelEngine: EngineStatus = {
    name: `kernel:${ks.engine}`,
    status: ks.status,
    ...(ks.reason ? { reason: ks.reason } : {}),
  };

  const auditDb: EngineStatus = executor.isAvailable()
    ? { name: 'audit-db', status: 'up' }
    : {
        name: 'audit-db',
        status: 'down',
        reason: 'persistence pool unavailable — durable Merkle chain cannot seal',
      };

  const vaultEngine = vault.status();

  const engines: readonly EngineStatus[] = [kernelEngine, auditDb, vaultEngine];

  // The pure-TS floor keeps the kernel serving; only a synthetic (no-rung) state
  // is truly `down`. A non-native rung + an unreachable audit DB or vault degrade.
  const kernelServing = ks.status === 'up' || ks.status === 'degraded';
  let status: HealthStatus;
  if (!kernelServing) {
    status = 'down';
  } else if (ks.degraded || auditDb.status !== 'up' || vaultEngine.status !== 'up') {
    status = 'degraded';
  } else {
    status = 'up';
  }

  const base = {
    name: 'governance',
    status,
    degraded: status !== 'up',
    engines,
    detail: { kernelEngine: ks.engine, auditEnabled, vaultAvailable: vault.available },
  };

  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
