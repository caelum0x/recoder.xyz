/**
 * MetricsPort — the metrics/instrumentation seam (design §4.10 / §10).
 *
 * `observability/instrument.ts` records launch latency, capture/alive call
 * counts, active tails, and reconcile orphan counts through this port. No vendor
 * lock: the backend injects its metrics client, tests inject a no-op or
 * recording fake. Interface only.
 */
export type MetricLabels = Record<string, string>;

export interface MetricsPort {
  /** Increment a monotonic counter. */
  counter(name: string, value?: number, labels?: MetricLabels): void;
  /** Set a point-in-time gauge (active tails, registered substrates). */
  gauge(name: string, value: number, labels?: MetricLabels): void;
  /** Record a value into a histogram/distribution (latency in ms). */
  histogram(name: string, value: number, labels?: MetricLabels): void;
}
