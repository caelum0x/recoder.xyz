/**
 * `HealthAggregator` — THE owner of health aggregation across all 14 domains
 * (conflict #7). It pulls every registered `HealthSource.health()` through the
 * boot-time `HealthRegistry` (structurally a {@link HealthSourceRegistry}), fuses
 * them into the shallow `/health` (liveness) and the deep `/health/full` (per-
 * engine `up|down|degraded|unknown` + SLO rollup + this module's own engines).
 *
 * THE TRUTHFULNESS INVARIANT (never violated):
 *  - down-rollup     : any source `down` (with ≥1 `up`) ⇒ overall `degraded`;
 *                      ALL `down` ⇒ overall `down`. A single `down` is never
 *                      masked as green.
 *  - timeout→unknown : a source whose `health()` exceeds the probe timeout becomes
 *                      `unknown` (handled inside the registry probe), and overall
 *                      is `degraded` — the aggregate never HANGS on a slow domain.
 *  - per-source truth: every source's own truthful status is preserved verbatim in
 *                      `sources[]`; the aggregator only computes the ROLLUP, it
 *                      never rewrites a domain's self-reported state.
 *
 * FROZEN CONTRACT: the shallow + full projections + the rollup rule are the
 * `/health` and `/health/full` API contracts other tooling depends on. Do not
 * change the rollup semantics without a contract migration.
 */
import type { ComponentHealth, HealthStatus } from '../../../shared/health-types.js';
import type { HealthSourceRegistry } from '../ports/health-source.port.js';
import type { SloRepository } from '../ports/observability.repository.js';
import type { MetricsPort } from '../ports/metrics.port.js';
import type {
  EngineHealth,
  HealthFull,
  HealthShallow,
  SloAttainment,
} from '../types.js';

/** Worst-of rollup across component statuses. Empty registry ⇒ `up`. */
export function rollupStatus(statuses: readonly HealthStatus[]): HealthStatus {
  if (statuses.length === 0) return 'up';
  const anyUp = statuses.includes('up');
  const anyDown = statuses.includes('down');
  const anyDegraded = statuses.includes('degraded');
  const anyUnknown = statuses.includes('unknown');

  if (anyDown && !anyUp) return 'down';
  if (anyDown || anyDegraded) return 'degraded';
  if (anyUnknown) return 'degraded';
  return 'up';
}

/** Tally how many sources landed in each terminal state (fast triage). */
export function countStatuses(sources: readonly ComponentHealth[]): Record<HealthStatus, number> {
  const counts: Record<HealthStatus, number> = { up: 0, down: 0, degraded: 0, unknown: 0 };
  for (const s of sources) counts[s.status] += 1;
  return counts;
}

export interface HealthAggregatorDeps {
  /** The registry of all domain HealthSources (from bootstrap). */
  readonly registry: HealthSourceRegistry;
  /** SLO targets backing the `/health/full` rollup (optional; empty when absent). */
  readonly slo?: SloRepository;
  /** The metrics registry, so SLO attainment can read current values (optional). */
  readonly metrics?: MetricsPort;
  readonly service: string;
  readonly instanceId: string;
  /** Space id SLO targets are read under. */
  readonly defaultSpaceId: string;
}

/**
 * Build the deep `/health/full` from probed sources + the module's engines + SLO
 * attainment. Pure — takes the already-probed inputs so it is trivially testable
 * (the down→degraded / timeout→unknown / SLO-rollup unit tests call this directly).
 */
export function buildHealthFull(input: {
  readonly sources: readonly ComponentHealth[];
  readonly engines: readonly EngineHealth[];
  readonly slo: readonly SloAttainment[];
  readonly service: string;
  readonly instanceId: string;
  readonly checkedAt?: string;
}): HealthFull {
  const status = rollupStatus(input.sources.map((s) => s.status));
  return {
    status,
    degraded: status !== 'up',
    sources: input.sources,
    engines: input.engines,
    slo: input.slo,
    counts: countStatuses(input.sources),
    service: input.service,
    instanceId: input.instanceId,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  };
}

export class HealthAggregator {
  constructor(private readonly deps: HealthAggregatorDeps) {}

  /**
   * The shallow liveness report — process up + the rollup only, NO per-domain
   * detail and NO secrets. Safe for an open load-balancer probe.
   */
  async shallow(): Promise<HealthShallow> {
    const report = await this.deps.registry.report();
    return {
      status: report.status,
      degraded: report.degraded,
      service: this.deps.service,
      instanceId: this.deps.instanceId,
      sources: report.sources.length,
      checkedAt: report.checkedAt,
    };
  }

  /**
   * The deep report — every domain's truthful ComponentHealth, this module's
   * engine breakdown, and the SLO rollup. `engines` is supplied by the composer
   * (its own logging/metrics/tracing/signals/audit state).
   */
  async full(engines: readonly EngineHealth[]): Promise<HealthFull> {
    const report = await this.deps.registry.report();
    const slo = await this.attainment();
    return buildHealthFull({
      sources: report.sources,
      engines,
      slo,
      service: this.deps.service,
      instanceId: this.deps.instanceId,
      checkedAt: report.checkedAt,
    });
  }

  /**
   * Current SLO attainment. Without an SLO repo (or the metrics backing) this is
   * empty — never a fabricated attainment. `observed` is `null` (met `null`) when
   * the backing metric can't be read, so an SLO panel shows "no data" truthfully.
   */
  private async attainment(): Promise<readonly SloAttainment[]> {
    if (!this.deps.slo) return [];
    let targets;
    try {
      targets = await this.deps.slo.listTargets(this.deps.defaultSpaceId);
    } catch {
      return [];
    }
    return targets.map((t) => ({
      id: t.id,
      name: t.name,
      target: t.target,
      // SLO evaluation against a live metric backend is not wired to a query
      // engine here; observed is truthfully null until a recording-rule evaluator
      // is attached (never a faked attainment number).
      observed: null,
      met: null,
    }));
  }
}
