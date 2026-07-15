/**
 * The observability module's OWN health — the state of its four internal engines,
 * folded into the aggregate `/health` like every other domain (ARCHITECTURE
 * §10.1, truthful degrade):
 *
 *  - logging  — always `up` (in-process pino sink; no external dependency).
 *  - metrics  — always `up` (in-process registry; no external dependency).
 *  - tracing  — `up` but `degraded:true` when no OTLP collector is configured
 *               (spans minted for correlation, not exported).
 *  - signals  — `up` when the ops-recorder sidecar answers; `down` when the
 *               sidecar/venv is absent (NO fabricated signals) — this is the
 *               truthfulness gate the manual check asserts.
 *  - audit    — `up` when the governance verify seam is reachable; `degraded`
 *               when the last verify was degraded; `down` when unavailable.
 *
 * Rollup: any engine `down` ⇒ module `degraded` (the module still serves the
 * surfaces its live engines back); a `degraded` engine ⇒ `degraded`; all `up` ⇒
 * `up`. The module is never `down` as a whole — its metrics/logging surfaces stay
 * up even when signals/tracing are impaired.
 */
import type { ComponentHealth } from '../../shared/health-types.js';
import type { EngineHealth } from './types.js';

/** Fold the module's engine breakdown into a single truthful ComponentHealth. */
export function observabilityHealth(engines: readonly EngineHealth[]): ComponentHealth {
  const anyDown = engines.some((e) => e.status === 'down');
  const anyDegraded = engines.some((e) => e.status === 'degraded' || e.degraded);
  const anyUnknown = engines.some((e) => e.status === 'unknown');
  const engineStatuses = engines.map((e) => ({
    name: e.engine,
    status: e.status,
    ...(e.reason ? { reason: e.reason } : {}),
  }));

  if (!anyDown && !anyDegraded && !anyUnknown) {
    return {
      name: 'observability',
      status: 'up',
      degraded: false,
      engines: engineStatuses,
    };
  }

  const impaired = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.engine}: ${e.status}${e.reason ? ` (${e.reason})` : ''}`)
    .join('; ');

  return {
    name: 'observability',
    status: 'degraded',
    degraded: true,
    reason: impaired || 'one or more observability engines impaired',
    engines: engineStatuses,
  };
}
