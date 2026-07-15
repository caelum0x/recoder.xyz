/**
 * Truthful inference health (ARCHITECTURE §10.1). The module reports the state of
 * its delivery ladder + its durable accounting store, never a faked `up`:
 *
 *  - `gateway:<tier>` — which delivery tier would serve (`napi` in-process = up;
 *    `loopback` reachable = up; `none` = down). A configured-but-unreachable
 *    loopback is `down` with the probe reason.
 *  - `ledger-db`      — the persistence pool the usage ledger + outcome trail
 *    append into; `down` when unavailable (accounting no-ops, delivery still works).
 *
 * Rollup: no tier can serve → `down`. Otherwise `degraded` when the ledger DB is
 * unreachable (delivery works but usage is not durably recorded); else `up`. So a
 * Postgres-less boot with a live gateway is truthfully `degraded`, never a
 * fabricated `up`; a gateway-less boot is truthfully `down`.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { InferenceGatewayPort } from './ports/inference-gateway.port.js';

export interface InferenceHealthDeps {
  readonly gateway: InferenceGatewayPort;
  /** Whether the usage ledger's durable backing is available. */
  readonly ledgerDurable: boolean;
}

/** Build the inference component health from the live gateway + persistence. */
export async function buildInferenceHealth(deps: InferenceHealthDeps): Promise<ComponentHealth> {
  const gw = await deps.gateway.health();

  const gatewayEngine: EngineStatus = {
    name: `gateway:${gw.tier}`,
    status: gw.available ? 'up' : 'down',
    ...(gw.available ? {} : { reason: gw.reason ?? 'no delivery tier available' }),
  };

  const ledgerDb: EngineStatus = deps.ledgerDurable
    ? { name: 'ledger-db', status: 'up' }
    : {
        name: 'ledger-db',
        status: 'down',
        reason: 'persistence pool unavailable — usage ledger + delivery outcomes are not durably recorded',
      };

  const engines: readonly EngineStatus[] = [gatewayEngine, ledgerDb];

  let status: HealthStatus;
  if (!gw.available) {
    status = 'down';
  } else if (!deps.ledgerDurable) {
    status = 'degraded';
  } else {
    status = 'up';
  }

  const base = {
    name: 'inference',
    status,
    degraded: status !== 'up',
    engines,
    detail: {
      tier: gw.tier,
      napiBound: gw.napiBound,
      loopbackConfigured: gw.loopbackConfigured,
      ...(gw.loopbackReachable !== undefined ? { loopbackReachable: gw.loopbackReachable } : {}),
    },
  };

  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
