/**
 * MetricsPort — observability seam: counters, histograms, gauges. A no-op
 * adapter is the default so the pure core never depends on a metrics backend.
 */

export type MetricLabels = Record<string, string>;

export interface MetricsPort {
  increment(name: string, labels?: MetricLabels, value?: number): void;
  observe(name: string, value: number, labels?: MetricLabels): void;
  gauge(name: string, value: number, labels?: MetricLabels): void;
}
