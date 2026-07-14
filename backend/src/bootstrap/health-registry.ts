/**
 * The health registry — aggregates every domain's {@link HealthSource} into one
 * truthful {@link HealthReport}.
 *
 * Truthfulness rules (ARCHITECTURE §10.1):
 * - An EMPTY registry is `up` with zero sources — healthy-but-nothing-registered,
 *   never a faked component.
 * - A source that throws or times out becomes `unknown` (never a hang, never a
 *   silent `up`); the per-source probe is bounded by `probeTimeoutMs`.
 * - Aggregate status is worst-of: any `down`/`degraded` → `degraded` while at
 *   least one source is `up`; all-`down` → `down`; any `unknown` (and no worse)
 *   → `unknown`.
 *
 * The full `/health/full` projection + SLO rollup is owned by the observability
 * domain (Phase 11); this registry is the boot-time seam it later consumes.
 */
import type { ComponentHealth, HealthReport, HealthSource, HealthStatus } from '../shared/health-types.js';

const DEFAULT_PROBE_TIMEOUT_MS = 2_000;

export interface HealthRegistryOptions {
  readonly probeTimeoutMs?: number;
}

export class HealthRegistry {
  private readonly sources: HealthSource[] = [];
  private readonly probeTimeoutMs: number;

  constructor(options?: HealthRegistryOptions) {
    this.probeTimeoutMs = options?.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  }

  /** Register a health source. Idempotent per name (last registration wins). */
  register(source: HealthSource): this {
    const existing = this.sources.findIndex((s) => s.name === source.name);
    if (existing >= 0) {
      this.sources[existing] = source;
    } else {
      this.sources.push(source);
    }
    return this;
  }

  /** Current number of registered sources. */
  get count(): number {
    return this.sources.length;
  }

  /** List registered source names (diagnostics). */
  names(): readonly string[] {
    return this.sources.map((s) => s.name);
  }

  /** Probe every source (bounded) and fold into one report. */
  async report(): Promise<HealthReport> {
    const components = await Promise.all(this.sources.map((source) => this.probe(source)));
    return {
      status: aggregateStatus(components),
      degraded: components.some((c) => c.status !== 'up'),
      sources: components,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Run one source's `health()` with a timeout; classify faults as `unknown`. */
  private async probe(source: HealthSource): Promise<ComponentHealth> {
    try {
      const result = await withTimeout(Promise.resolve(source.health()), this.probeTimeoutMs);
      return result;
    } catch (error) {
      const reason = error instanceof TimeoutError ? 'health probe timed out' : errorReason(error);
      return { name: source.name, status: 'unknown', degraded: true, reason };
    }
  }
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Worst-of aggregation across component statuses. Empty → `up`. */
function aggregateStatus(components: readonly ComponentHealth[]): HealthStatus {
  if (components.length === 0) return 'up';
  const statuses = components.map((c) => c.status);
  const anyUp = statuses.includes('up');
  const anyDown = statuses.includes('down');
  const anyDegraded = statuses.includes('degraded');
  const anyUnknown = statuses.includes('unknown');

  if (anyDown && !anyUp) return 'down';
  if (anyDown || anyDegraded) return 'degraded';
  if (anyUnknown) return 'unknown';
  return 'up';
}

/** Construct a fresh registry. */
export function createHealthRegistry(options?: HealthRegistryOptions): HealthRegistry {
  return new HealthRegistry(options);
}
