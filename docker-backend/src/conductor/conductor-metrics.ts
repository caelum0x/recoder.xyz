/**
 * Conductor metrics — in-process counters and gauges for observability.
 *
 * Per docs/CONDUCTOR-ARCHITECTURE.md §6 and docs/agent-os/08-observability.md:
 * production-grade metrics for the conductor surface. Uses a lightweight in-process
 * registry (no vendor lock); the health endpoint exposes the snapshot.
 *
 * Counters: launch count, failure count, reconcile runs, workflow launches.
 * Gauges: active workspaces, active tails, free disk.
 * Histograms: launch latency, run duration.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('conductor:metrics');

interface CounterEntry { value: number; labels: Record<string, string> }
interface GaugeEntry { value: number; labels: Record<string, string> }
interface HistogramEntry {
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: Record<string, number>;
}

const counters = new Map<string, CounterEntry>();
const gauges = new Map<string, GaugeEntry>();
const histograms = new Map<string, HistogramEntry>();

function labelKey(name: string, labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return `${name}{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

export const metrics = {
  counter(name: string, labels: Record<string, string> = {}): void {
    const key = labelKey(name, labels);
    const entry = counters.get(key) ?? { value: 0, labels };
    entry.value++;
    counters.set(key, entry);
  },

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    gauges.set(labelKey(name, labels), { value, labels });
  },

  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = labelKey(name, labels);
    let entry = histograms.get(key);
    if (!entry) {
      entry = { count: 0, sum: 0, min: Infinity, max: 0, buckets: {} };
      histograms.set(key, entry);
    }
    entry.count++;
    entry.sum += value;
    entry.min = Math.min(entry.min, value);
    entry.max = Math.max(entry.max, value);
    // Simple bucket boundaries for latency (ms): 100, 500, 1k, 5k, 10k, 60k
    const bounds = [100, 500, 1000, 5000, 10000, 60000];
    for (const b of bounds) {
      if (value <= b) {
        entry.buckets[`${b}`] = (entry.buckets[`${b}`] ?? 0) + 1;
      }
    }
  },

  snapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; avg: number; min: number; max: number; p50: number; p99: number }>;
    timestamp: string;
  } {
    const counterSnap: Record<string, number> = {};
    for (const [key, entry] of counters) counterSnap[key] = entry.value;

    const gaugeSnap: Record<string, number> = {};
    for (const [key, entry] of gauges) gaugeSnap[key] = entry.value;

    const histSnap: Record<string, { count: number; avg: number; min: number; max: number; p50: number; p99: number }> = {};
    for (const [key, entry] of histograms) {
      histSnap[key] = {
        count: entry.count,
        avg: entry.count > 0 ? entry.sum / entry.count : 0,
        min: entry.min === Infinity ? 0 : entry.min,
        max: entry.max,
        p50: entry.min === Infinity ? 0 : entry.sum / entry.count, // simplified
        p99: entry.max,
      };
    }

    return { counters: counterSnap, gauges: gaugeSnap, histograms: histSnap, timestamp: new Date().toISOString() };
  },

  reset(): void {
    counters.clear();
    gauges.clear();
    histograms.clear();
  },
};

/** Convenience helpers for instrumenting conductor operations. */
export function recordLaunch(runtimeId: string, success: boolean, durationMs: number): void {
  metrics.counter('conductor_launches_total', { runtime: runtimeId, status: success ? 'success' : 'failure' });
  metrics.histogram('conductor_launch_duration_ms', durationMs, { runtime: runtimeId });
}

export function recordReconcile(orphanCount: number): void {
  metrics.counter('conductor_reconcile_total');
  metrics.gauge('conductor_orphans', orphanCount);
}

export function recordWorkflow(pattern: string, stepCount: number, success: boolean): void {
  metrics.counter('conductor_workflows_total', { pattern, status: success ? 'success' : 'failure' });
  metrics.gauge('conductor_workflow_steps', stepCount, { pattern });
}
