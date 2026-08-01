/**
 * `PrometheusMetrics` — the concrete {@link MetricsPort} + the `/metrics` scrape
 * renderer. It is a self-contained in-process registry (counters/gauges/
 * histograms + default process collectors) that renders the Prometheus text
 * exposition format — so the whole backend gets a truthful `/metrics` with ZERO
 * new runtime dependency, and the registry is ALWAYS `up` (no external dep).
 *
 * `prom-client` can later be swapped in behind this exact port without touching a
 * single call site: the domains all inject `MetricsPort`, never this class. The
 * RED/USE helper collectors (`http_requests_total`, `http_request_duration_seconds`,
 * …) are registered by the telemetry middleware through the port.
 *
 * Degrade law: metrics are in-process, so there is no `down` state — a scrape
 * always renders the current series. Auth for the scrape edge is enforced at the
 * route (INTERNAL_SERVICE_KEY), not here.
 */
import type {
  CounterHandle,
  GaugeHandle,
  HistogramHandle,
  MetricLabels,
  MetricSample,
  MetricSpec,
  MetricsPort,
  MetricsReader,
  TimerHandle,
} from '../ports/metrics.port.js';

type SeriesMap = Map<string, number>;

/** Serialize label values to a stable series key (sorted keys). */
function seriesKey(labels: MetricLabels | undefined): string {
  if (!labels) return '';
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${String(labels[k])}`)
    .join(',');
}

/** Render the label block `{k="v",...}` (escaped), or empty when no labels. */
function renderLabels(labels: MetricLabels | undefined): string {
  if (!labels) return '';
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabel(String(labels[k]))}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

interface CounterSeries {
  readonly kind: 'counter';
  readonly spec: MetricSpec;
  readonly values: SeriesMap;
  readonly labelSets: Map<string, MetricLabels | undefined>;
}
interface GaugeSeries {
  readonly kind: 'gauge';
  readonly spec: MetricSpec;
  readonly values: SeriesMap;
  readonly labelSets: Map<string, MetricLabels | undefined>;
}
interface HistogramSeries {
  readonly kind: 'histogram';
  readonly spec: MetricSpec;
  readonly buckets: readonly number[];
  /** series key → bucket counts (cumulative computed at render) + sum + count. */
  readonly observations: Map<
    string,
    { readonly labels: MetricLabels | undefined; counts: number[]; sum: number; count: number }
  >;
}
type Series = CounterSeries | GaugeSeries | HistogramSeries;

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class PrometheusMetrics implements MetricsPort, MetricsReader {
  private readonly registry = new Map<string, Series>();
  private readonly startedAt = Date.now();

  counter(spec: MetricSpec): CounterHandle {
    const series = this.ensure(spec, 'counter') as CounterSeries;
    return {
      inc: (labels, value = 1) => {
        const key = seriesKey(labels);
        series.values.set(key, (series.values.get(key) ?? 0) + value);
        series.labelSets.set(key, labels);
      },
    };
  }

  gauge(spec: MetricSpec): GaugeHandle {
    const series = this.ensure(spec, 'gauge') as GaugeSeries;
    const write = (labels: MetricLabels | undefined, delta: number, absolute: boolean): void => {
      const key = seriesKey(labels);
      const next = absolute ? delta : (series.values.get(key) ?? 0) + delta;
      series.values.set(key, next);
      series.labelSets.set(key, labels);
    };
    return {
      set: (labels, value) => write(labels, value, true),
      inc: (labels, value = 1) => write(labels, value, false),
      dec: (labels, value = 1) => write(labels, -value, false),
    };
  }

  histogram(spec: MetricSpec): HistogramHandle {
    const series = this.ensureHistogram(spec);
    return {
      observe: (labels, value) => {
        const key = seriesKey(labels);
        let entry = series.observations.get(key);
        if (!entry) {
          entry = { labels, counts: new Array(series.buckets.length).fill(0), sum: 0, count: 0 };
          series.observations.set(key, entry);
        }
        entry.sum += value;
        entry.count += 1;
        for (let i = 0; i < series.buckets.length; i += 1) {
          if (value <= series.buckets[i]) entry.counts[i] += 1;
        }
      },
    };
  }

  startTimer(spec: MetricSpec): TimerHandle {
    const h = this.histogram(spec);
    const start = process.hrtime.bigint();
    return {
      stop: (labels) => {
        const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
        h.observe(labels, elapsedSec);
        return elapsedSec;
      },
    };
  }

  // --- Read surface (MetricsReader) -----------------------------------------
  // In-process reads for evaluators (SLO attainment / recording rules). No
  // scraping, no allocation on the hot write path — this only reads the maps.

  /** Current value of the exact series (all labels match), or `null` if absent. */
  getValue(name: string, labels?: MetricLabels): number | null {
    const series = this.registry.get(name);
    if (!series) return null;
    if (series.kind === 'histogram') {
      const entry = series.observations.get(seriesKey(labels));
      return entry ? entry.count : null;
    }
    const value = series.values.get(seriesKey(labels));
    return value === undefined ? null : value;
  }

  /** Every recorded sample for a counter/gauge (histogram → per-series count). */
  getSamples(name: string): readonly MetricSample[] {
    const series = this.registry.get(name);
    if (!series) return [];
    if (series.kind === 'histogram') {
      return [...series.observations.values()].map((e) => ({
        labels: e.labels ?? {},
        value: e.count,
      }));
    }
    const out: MetricSample[] = [];
    for (const [key, value] of series.values.entries()) {
      out.push({ labels: series.labelSets.get(key) ?? {}, value });
    }
    return out;
  }

  private ensure(spec: MetricSpec, kind: 'counter' | 'gauge'): Series {
    const existing = this.registry.get(spec.name);
    if (existing) return existing;
    const series: Series =
      kind === 'counter'
        ? { kind, spec, values: new Map(), labelSets: new Map() }
        : { kind, spec, values: new Map(), labelSets: new Map() };
    this.registry.set(spec.name, series);
    return series;
  }

  private ensureHistogram(spec: MetricSpec): HistogramSeries {
    const existing = this.registry.get(spec.name);
    if (existing && existing.kind === 'histogram') return existing;
    const series: HistogramSeries = {
      kind: 'histogram',
      spec,
      buckets: spec.buckets ?? DEFAULT_BUCKETS,
      observations: new Map(),
    };
    this.registry.set(spec.name, series);
    return series;
  }

  /** Snapshot the default process collectors (memory/uptime) as gauges at render. */
  private renderProcess(): string {
    const mem = process.memoryUsage();
    const uptime = (Date.now() - this.startedAt) / 1000;
    const lines = [
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${mem.rss}`,
      '# HELP nodejs_heap_used_bytes Node.js heap used in bytes.',
      '# TYPE nodejs_heap_used_bytes gauge',
      `nodejs_heap_used_bytes ${mem.heapUsed}`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime.toFixed(3)}`,
    ];
    return lines.join('\n');
  }

  /** Render the full registry in Prometheus text exposition format. */
  render(): string {
    const blocks: string[] = [this.renderProcess()];
    for (const series of this.registry.values()) {
      blocks.push(this.renderSeries(series));
    }
    return `${blocks.join('\n')}\n`;
  }

  private renderSeries(series: Series): string {
    const lines: string[] = [`# HELP ${series.spec.name} ${series.spec.help}`];
    if (series.kind === 'histogram') {
      lines.push(`# TYPE ${series.spec.name} histogram`);
      for (const entry of series.observations.values()) {
        let cumulative = 0;
        const baseLabels = entry.labels ?? {};
        for (let i = 0; i < series.buckets.length; i += 1) {
          cumulative += entry.counts[i];
          const le = { ...baseLabels, le: String(series.buckets[i]) };
          lines.push(`${series.spec.name}_bucket${renderLabels(le)} ${cumulative}`);
        }
        const inf = { ...baseLabels, le: '+Inf' };
        lines.push(`${series.spec.name}_bucket${renderLabels(inf)} ${entry.count}`);
        lines.push(`${series.spec.name}_sum${renderLabels(entry.labels)} ${entry.sum}`);
        lines.push(`${series.spec.name}_count${renderLabels(entry.labels)} ${entry.count}`);
      }
      return lines.join('\n');
    }
    lines.push(`# TYPE ${series.spec.name} ${series.kind}`);
    for (const [key, value] of series.values.entries()) {
      lines.push(`${series.spec.name}${renderLabels(series.labelSets.get(key))} ${value}`);
    }
    return lines.join('\n');
  }
}

/** Render a registry's scrape text (thin free function for the route). */
export function renderMetrics(metrics: PrometheusMetrics): string {
  return metrics.render();
}
