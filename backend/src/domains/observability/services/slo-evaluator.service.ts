/**
 * `SloEvaluator` — the recording-rule evaluator that finally FEEDS the built-but-
 * unfed SLO surface. It reads the in-process HTTP RED counter through an injected
 * {@link MetricsReader} (NO scraping, NO PromQL engine) and computes observed
 * attainment per {@link SloTarget}:
 *
 *   availability = 1 − errors / total     (over the recorded RED samples)
 *
 * where `total` is every `http_requests_total` sample and `errors` are the samples
 * whose `status` label is a server error (>= 500, configurable).
 *
 * TRUTHFULNESS INVARIANT (the whole reason this exists):
 *  - ZERO traffic (`total === 0`) ⇒ `observed = null`, `met = null`, reason
 *    `insufficient data`. It NEVER reports a fabricated 100% attainment from an
 *    empty counter — "no data" is reported as no data, not as success.
 *  - Pure + deterministic: given the same reader snapshot it returns the same
 *    result. The metrics source is injectable, so tests pass a fake with no DB,
 *    no network, no clock.
 *
 * SCOPE NOTE: the in-process counter is cumulative (the fallback registry keeps no
 * per-sample timestamps), so `windowSecs` is carried on the target but attainment
 * is computed over all recorded samples. This is honest for a single-process
 * lifetime; a true rolling window belongs to a scrape-backed backend behind the
 * same {@link MetricsReader} seam.
 */
import type { MetricLabels, MetricsReader } from '../ports/metrics.port.js';
import type { SloAttainment, SloTarget } from '../types.js';

/** How RED availability is derived from the requests counter. All injectable. */
export interface RedAvailabilityConfig {
  /** The RED requests counter name. */
  readonly requestsMetric: string;
  /** The label carrying the HTTP status code. */
  readonly statusLabel: string;
  /** A sample counts as an error when `Number(status) >= errorMinStatus`. */
  readonly errorMinStatus: number;
}

export const DEFAULT_RED_CONFIG: RedAvailabilityConfig = {
  requestsMetric: 'http_requests_total',
  statusLabel: 'status',
  errorMinStatus: 500,
};

/** Why an observation is `insufficient` (no attainment could be computed). */
export type SloInsufficientReason = 'insufficient data';

/** Per-target evaluation result (richer than the wire {@link SloAttainment}). */
export interface SloEvaluation {
  readonly target: SloTarget;
  /** Availability in [0,1]; `null` when there is no traffic to measure. */
  readonly observed: number | null;
  /** True only when `observed` is present and meets `target`; `null` on no data. */
  readonly met: boolean | null;
  /** Total requests counted in the window (0 ⇒ insufficient). */
  readonly total: number;
  /** Requests counted as errors (status >= errorMinStatus). */
  readonly errors: number;
  /** Present only when `observed` is `null`. */
  readonly reason?: SloInsufficientReason;
}

/** Does `sample` carry every key/value in `match`? (subset / superset match). */
function matches(labels: MetricLabels, match: MetricLabels | undefined): boolean {
  if (!match) return true;
  for (const key of Object.keys(match)) {
    if (String(labels[key]) !== String(match[key])) return false;
  }
  return true;
}

export class SloEvaluator {
  private readonly config: RedAvailabilityConfig;

  constructor(
    private readonly reader: MetricsReader,
    config: Partial<RedAvailabilityConfig> = {},
  ) {
    this.config = { ...DEFAULT_RED_CONFIG, ...config };
  }

  /**
   * Compute observed HTTP availability from the RED counter. `matchLabels`
   * optionally scopes the SLO to a subset of series (e.g. one route). Returns a
   * standalone reading (not tied to a target) — the building block `evaluate`
   * uses. `observed`/`met` are `null` under zero traffic (truthful "no data").
   */
  observeAvailability(matchLabels?: MetricLabels): {
    readonly observed: number | null;
    readonly total: number;
    readonly errors: number;
    readonly reason?: SloInsufficientReason;
  } {
    const samples = this.reader.getSamples(this.config.requestsMetric);
    let total = 0;
    let errors = 0;
    for (const sample of samples) {
      if (!matches(sample.labels, matchLabels)) continue;
      total += sample.value;
      const status = Number(sample.labels[this.config.statusLabel]);
      if (Number.isFinite(status) && status >= this.config.errorMinStatus) {
        errors += sample.value;
      }
    }
    if (total <= 0) {
      return { observed: null, total: 0, errors: 0, reason: 'insufficient data' };
    }
    return { observed: 1 - errors / total, total, errors };
  }

  /** Evaluate one target against the current RED snapshot. */
  evaluateTarget(target: SloTarget, matchLabels?: MetricLabels): SloEvaluation {
    const reading = this.observeAvailability(matchLabels);
    if (reading.observed === null) {
      return {
        target,
        observed: null,
        met: null,
        total: reading.total,
        errors: reading.errors,
        reason: reading.reason,
      };
    }
    return {
      target,
      observed: reading.observed,
      met: reading.observed >= target.target,
      total: reading.total,
      errors: reading.errors,
    };
  }

  /** Evaluate every target. Deterministic, order-preserving, side-effect free. */
  evaluate(targets: readonly SloTarget[]): readonly SloEvaluation[] {
    return targets.map((t) => this.evaluateTarget(t));
  }

  /**
   * Project evaluations onto the frozen {@link SloAttainment} wire shape consumed
   * by `/health/full` — so this evaluator can back the health rollup without
   * changing that contract. `observed`/`met` stay `null` on insufficient data.
   */
  attainment(targets: readonly SloTarget[]): readonly SloAttainment[] {
    return this.evaluate(targets).map((e) => ({
      id: e.target.id,
      name: e.target.name,
      target: e.target.target,
      observed: e.observed,
      met: e.met,
    }));
  }
}
