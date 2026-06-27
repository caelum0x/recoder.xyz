/**
 * NoopMetrics — a `MetricsPort` that discards everything. The default so the
 * pure core never depends on a metrics backend. A real Prometheus/OTel adapter
 * (wave-2) implements the same port.
 *
 * `RecordingMetrics` keeps emitted values in memory for assertions in tests.
 */

import type { MetricLabels, MetricsPort } from '../../ports';

export class NoopMetrics implements MetricsPort {
  increment(_name: string, _labels?: MetricLabels, _value?: number): void {
    // intentionally empty
  }

  observe(_name: string, _value: number, _labels?: MetricLabels): void {
    // intentionally empty
  }

  gauge(_name: string, _value: number, _labels?: MetricLabels): void {
    // intentionally empty
  }
}

export type RecordedMetric = {
  kind: 'increment' | 'observe' | 'gauge';
  name: string;
  value: number;
  labels?: MetricLabels;
};

export class RecordingMetrics implements MetricsPort {
  readonly records: RecordedMetric[] = [];

  increment(name: string, labels?: MetricLabels, value = 1): void {
    this.records.push({ kind: 'increment', name, value, ...(labels ? { labels } : {}) });
  }

  observe(name: string, value: number, labels?: MetricLabels): void {
    this.records.push({ kind: 'observe', name, value, ...(labels ? { labels } : {}) });
  }

  gauge(name: string, value: number, labels?: MetricLabels): void {
    this.records.push({ kind: 'gauge', name, value, ...(labels ? { labels } : {}) });
  }
}
