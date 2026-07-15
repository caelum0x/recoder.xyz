/**
 * Truthful billing health (ARCHITECTURE §10.1). Billing is a LADDER: the static
 * plan matrix + free tier serve even with nothing configured, so the module is
 * rarely fully `down` — it reports `degraded` when a dependency is impaired and
 * never a fabricated `up`.
 *
 * Engines rolled up:
 *  - `metering-db`  — the persistence pool the usage ledger + projections live in;
 *    `down` when unavailable (quota checks then DENY, features still serve).
 *  - `entitlement`  — the gate's own health (degraded when metering/provider off).
 *  - `metering`     — the ledger + flush loop (degraded without a provider/DB).
 *  - `provider:<name>` — the ACTIVE MoR provider readiness (`down` when its key
 *    is absent or the API is unreachable — paid grants then can't confirm).
 *
 * Rollup: metering DB down OR active provider down/unconfigured ⇒ `degraded`
 * (the free tier + static entitlements still serve); everything `up` ⇒ `up`.
 */
import {
  type ComponentHealth,
  type EngineStatus,
  type HealthStatus,
} from '../../shared/health-types.js';
import type { MeteringRepository } from './ports/metering-repo.port.js';
import type { EntitlementGate } from './ports/entitlement.port.js';
import type { MeteringService } from './services/metering.service.js';
import type { BillingProviderPort } from './ports/billing-provider.port.js';

export interface BillingHealthDeps {
  readonly repo: MeteringRepository;
  readonly gate: EntitlementGate;
  readonly metering: MeteringService;
  /** The ACTIVE MoR provider (its truthful readiness drives the rollup). */
  readonly provider: BillingProviderPort;
}

/** Build the billing component health from the live repo + gate + metering + provider. */
export async function buildBillingHealth(deps: BillingHealthDeps): Promise<ComponentHealth> {
  const { repo, gate, metering, provider } = deps;

  const meteringDb: EngineStatus = repo.isAvailable()
    ? { name: 'metering-db', status: 'up' }
    : {
        name: 'metering-db',
        status: 'down',
        reason: 'persistence pool unavailable — quota checks deny (fail safe), free tier still serves',
      };

  const gateHealth = gate.health();
  const entitlement: EngineStatus = {
    name: 'entitlement',
    status: gateHealth.status,
    ...(gateHealth.reason ? { reason: gateHealth.reason } : {}),
  };

  const meteringHealth = metering.health();
  const meteringEngine: EngineStatus = {
    name: 'metering',
    status: meteringHealth.status,
    ...(meteringHealth.reason ? { reason: meteringHealth.reason } : {}),
  };

  let providerEngine: EngineStatus;
  try {
    const ph = await provider.health();
    providerEngine = {
      name: `provider:${ph.name}`,
      status: ph.status,
      ...(ph.reason ? { reason: ph.reason } : {}),
    };
  } catch (error) {
    providerEngine = {
      name: `provider:${provider.name}`,
      status: 'unknown',
      reason: error instanceof Error ? error.message : 'provider health probe failed',
    };
  }

  const engines: readonly EngineStatus[] = [meteringDb, entitlement, meteringEngine, providerEngine];

  // The free tier + static plan matrix always serve, so billing is never `down`
  // for a missing dependency — it degrades truthfully instead.
  const anyImpaired = engines.some((e) => e.status !== 'up');
  const status: HealthStatus = anyImpaired ? 'degraded' : 'up';

  const base = {
    name: 'billing',
    status,
    degraded: status !== 'up',
    engines,
    detail: {
      activeProvider: provider.name,
      meteringAvailable: repo.isAvailable(),
    },
  };
  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
