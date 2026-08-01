/**
 * `MetricsPort` — THE seam every one of the other 13 domains injects to record
 * metrics WITHOUT depending on the concrete registry (prom-client or the
 * in-process fallback). RED (rate/errors/duration) + USE (utilization/saturation/
 * errors) counters, gauges, and histograms flow through this thin interface, so
 * the metrics backend is swappable in exactly one place.
 *
 * FROZEN CONTRACT — Phase 11 seam. Domains compile against `counter/gauge/
 * histogram/timer` while the concrete adapter is composed behind it. A metric is
 * identified by `name` + a fixed label-key set; `labels` supplies the values.
 */

/** Immutable metric descriptor (declared once, incremented many times). */
export interface MetricSpec {
  /** Prometheus metric name, e.g. `http_requests_total`. */
  readonly name: string;
  /** Human help text (rendered as `# HELP`). */
  readonly help: string;
  /** The fixed set of label keys this metric carries. */
  readonly labelNames?: readonly string[];
  /** Histogram bucket upper-bounds (seconds/units); only for `histogram`. */
  readonly buckets?: readonly number[];
}

/** Label values for a single observation. */
export type MetricLabels = Readonly<Record<string, string | number>>;

/** A monotonic counter handle. */
export interface CounterHandle {
  /** Increment by `value` (default 1) at the given labels. */
  inc(labels?: MetricLabels, value?: number): void;
}

/** A settable gauge handle. */
export interface GaugeHandle {
  set(labels: MetricLabels | undefined, value: number): void;
  inc(labels?: MetricLabels, value?: number): void;
  dec(labels?: MetricLabels, value?: number): void;
}

/** A distribution/histogram handle. */
export interface HistogramHandle {
  /** Record one observation (e.g. a request duration in seconds). */
  observe(labels: MetricLabels | undefined, value: number): void;
}

/** A stopwatch that observes elapsed seconds into a histogram when stopped. */
export interface TimerHandle {
  /** Stop the timer and record the elapsed seconds (optionally with labels). */
  stop(labels?: MetricLabels): number;
}

/**
 * The metrics boundary. Idempotent per name: calling `counter(spec)` twice with
 * the same name returns the same underlying series (last help/labels win).
 */
export interface MetricsPort {
  counter(spec: MetricSpec): CounterHandle;
  gauge(spec: MetricSpec): GaugeHandle;
  histogram(spec: MetricSpec): HistogramHandle;
  /** Start a histogram timer; `stop()` records elapsed seconds. */
  startTimer(spec: MetricSpec): TimerHandle;
}

/** One recorded series sample: its label set + current value. */
export interface MetricSample {
  readonly labels: MetricLabels;
  readonly value: number;
}

/**
 * `MetricsReader` — the READ half of the metrics seam, kept as a SEPARATE
 * (additive) interface so the write-only {@link MetricsPort} that all 14 domains
 * inject stays frozen. In-process evaluators (SLO attainment, recording rules)
 * inject this to read current counter/gauge values WITHOUT scraping `/metrics`.
 * Pure + synchronous: it returns the registry's current snapshot, never blocks.
 */
export interface MetricsReader {
  /**
   * Current value of the EXACT series (all `labels` match), or `null` when no such
   * series has been recorded. For a histogram, returns the observation `count` of
   * the matching series. `null` is truthful "no data" — never a fabricated 0.
   */
  getValue(name: string, labels?: MetricLabels): number | null;
  /**
   * Every recorded sample for a counter/gauge metric (histograms report their
   * per-series observation `count`). Empty when the metric was never recorded.
   */
  getSamples(name: string): readonly MetricSample[];
}
