/**
 * `HealthSource` — the contract a domain implements to be fused into the
 * aggregated `/health/full`. It mirrors the shared `HealthSource` (which every
 * `DomainModule` already satisfies via `ModuleBase`), re-exported here so the
 * observability aggregator + its consumers import the aggregation vocabulary from
 * ONE place.
 *
 * A `HealthReport` here is a single domain's {@link ComponentHealth} — NOT the
 * whole-registry aggregate (that is `HealthFull`). The aggregator bounds each
 * `health()` with a timeout so a slow source degrades to `unknown`, never a hang.
 */
import type { ComponentHealth, HealthSource } from '../../../shared/health-types.js';

export type { HealthSource } from '../../../shared/health-types.js';

/** One domain's truthful health, as consumed by the aggregator. */
export type HealthReport = ComponentHealth;

/**
 * A registry of health sources the aggregator pulls from. Structurally the
 * boot-time `HealthRegistry` (from `bootstrap`) satisfies this — the aggregator
 * depends on this minimal shape, not the concrete class, so it stays testable.
 */
export interface HealthSourceRegistry {
  /** Probe every source (bounded) and return per-source truthful reports. */
  report(): Promise<{
    readonly sources: readonly ComponentHealth[];
    readonly status: ComponentHealth['status'];
    readonly degraded: boolean;
    readonly checkedAt: string;
  }>;
  /** Registered source names (diagnostics). */
  names(): readonly string[];
}

/** Narrow guard: does an object satisfy the {@link HealthSource} contract? */
export function isHealthSource(value: unknown): value is HealthSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { health?: unknown }).health === 'function'
  );
}
