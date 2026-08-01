/**
 * SloEvaluator invariants — the SLO recording-rule evaluator must be TRUTHFUL:
 *  - attainment math: availability = 1 − errors/total over the RED counter, and
 *    `met` is true iff observed >= target (boundary inclusive).
 *  - ZERO-traffic degrade: an empty counter yields `observed = null`, `met = null`,
 *    reason `insufficient data` — NEVER a fabricated 100% attainment.
 *  - pure + injectable: the metrics source is a fake/real MetricsReader, no DB, no
 *    network, no clock; the same snapshot always yields the same result.
 *  - additive read surface: the real PrometheusMetrics.getValue/getSamples reflect
 *    recorded counter series exactly (and report null for absent series).
 */
import { describe, it, expect } from 'vitest';
import { PrometheusMetrics } from '../adapters/prometheus-registry.adapter.js';
import type {
  MetricLabels,
  MetricSample,
  MetricsReader,
} from '../ports/metrics.port.js';
import { SloEvaluator } from '../services/slo-evaluator.service.js';
import type { SloTarget } from '../types.js';

function target(overrides: Partial<SloTarget> = {}): SloTarget {
  return {
    id: 's1',
    spaceId: 'space-1',
    name: 'http-availability',
    target: 0.99,
    windowSecs: 3600,
    metricQuery: '1 - rate(http_requests_total{status=~"5.."}[1h])',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A pure, deterministic MetricsReader fake over a fixed sample list. */
function fakeReader(samples: readonly MetricSample[]): MetricsReader {
  return {
    getSamples: (name) => (name === 'http_requests_total' ? samples : []),
    getValue: (name, labels?: MetricLabels) => {
      if (name !== 'http_requests_total') return null;
      const key = JSON.stringify(labels ?? {});
      const found = samples.find((s) => JSON.stringify(s.labels) === key);
      return found ? found.value : null;
    },
  };
}

describe('SloEvaluator — attainment math', () => {
  it('availability = 1 - errors/total (5xx counts as error)', () => {
    const reader = fakeReader([
      { labels: { method: 'GET', route: '/a', status: '200' }, value: 900 },
      { labels: { method: 'GET', route: '/a', status: '500' }, value: 100 },
    ]);
    const [ev] = new SloEvaluator(reader).evaluate([target({ target: 0.9 })]);
    expect(ev.total).toBe(1000);
    expect(ev.errors).toBe(100);
    expect(ev.observed).toBeCloseTo(0.9, 10);
    // observed (0.9) meets target (0.9) — boundary inclusive.
    expect(ev.met).toBe(true);
  });

  it('marks NOT met when observed falls below target', () => {
    const reader = fakeReader([
      { labels: { status: '200' }, value: 50 },
      { labels: { status: '503' }, value: 50 },
    ]);
    const [ev] = new SloEvaluator(reader).evaluate([target({ target: 0.99 })]);
    expect(ev.observed).toBeCloseTo(0.5, 10);
    expect(ev.met).toBe(false);
  });

  it('4xx does NOT count as an error (only status >= 500)', () => {
    const reader = fakeReader([
      { labels: { status: '200' }, value: 800 },
      { labels: { status: '404' }, value: 200 },
    ]);
    const [ev] = new SloEvaluator(reader).evaluate([target()]);
    expect(ev.errors).toBe(0);
    expect(ev.observed).toBe(1);
    expect(ev.met).toBe(true);
  });

  it('errorMinStatus is configurable (e.g. count 4xx+5xx as errors)', () => {
    const reader = fakeReader([
      { labels: { status: '200' }, value: 800 },
      { labels: { status: '404' }, value: 200 },
    ]);
    const [ev] = new SloEvaluator(reader, { errorMinStatus: 400 }).evaluate([
      target({ target: 0.9 }),
    ]);
    expect(ev.errors).toBe(200);
    expect(ev.observed).toBeCloseTo(0.8, 10);
    expect(ev.met).toBe(false);
  });

  it('matchLabels scopes availability to a subset of series (per-route SLO)', () => {
    const reader = fakeReader([
      { labels: { route: '/a', status: '200' }, value: 100 },
      { labels: { route: '/a', status: '500' }, value: 0 },
      { labels: { route: '/b', status: '500' }, value: 500 },
    ]);
    const evaluator = new SloEvaluator(reader);
    const scoped = evaluator.observeAvailability({ route: '/a' });
    expect(scoped.total).toBe(100);
    expect(scoped.errors).toBe(0);
    expect(scoped.observed).toBe(1);
  });

  it('evaluate is order-preserving and per-target', () => {
    const reader = fakeReader([
      { labels: { status: '200' }, value: 99 },
      { labels: { status: '500' }, value: 1 },
    ]);
    const evals = new SloEvaluator(reader).evaluate([
      target({ id: 'a', target: 0.99 }),
      target({ id: 'b', target: 0.999 }),
    ]);
    expect(evals.map((e) => e.target.id)).toEqual(['a', 'b']);
    // observed is 0.99 for both; met differs by each target threshold.
    expect(evals[0].met).toBe(true);
    expect(evals[1].met).toBe(false);
  });
});

describe('SloEvaluator — zero-traffic degrade (never a fake 100%)', () => {
  it('empty counter → observed null, met null, reason "insufficient data"', () => {
    const [ev] = new SloEvaluator(fakeReader([])).evaluate([target()]);
    expect(ev.observed).toBeNull();
    expect(ev.met).toBeNull();
    expect(ev.reason).toBe('insufficient data');
    // The trap this exists to avoid: an empty counter must NOT read as 100%.
    expect(ev.observed).not.toBe(1);
  });

  it('all-zero-valued samples still count as insufficient data (total 0)', () => {
    const reader = fakeReader([{ labels: { status: '200' }, value: 0 }]);
    const [ev] = new SloEvaluator(reader).evaluate([target()]);
    expect(ev.total).toBe(0);
    expect(ev.observed).toBeNull();
    expect(ev.met).toBeNull();
  });

  it('a target for an absent metric degrades truthfully (no data, no crash)', () => {
    const emptyReader: MetricsReader = { getSamples: () => [], getValue: () => null };
    const attainment = new SloEvaluator(emptyReader).attainment([target()]);
    expect(attainment).toEqual([
      { id: 's1', name: 'http-availability', target: 0.99, observed: null, met: null },
    ]);
  });
});

describe('SloEvaluator over the real PrometheusMetrics read surface', () => {
  it('reads the live RED counter and computes attainment end-to-end', () => {
    const metrics = new PrometheusMetrics();
    const requests = metrics.counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests.',
      labelNames: ['method', 'route', 'status'],
    });
    // 995 ok, 5 server errors → 99.5% availability.
    requests.inc({ method: 'GET', route: '/x', status: '200' }, 995);
    requests.inc({ method: 'GET', route: '/x', status: '500' }, 5);

    // getValue reflects the exact recorded series.
    expect(metrics.getValue('http_requests_total', { method: 'GET', route: '/x', status: '200' })).toBe(995);
    expect(metrics.getValue('http_requests_total', { method: 'GET', route: '/x', status: '404' })).toBeNull();
    expect(metrics.getValue('does_not_exist')).toBeNull();

    const [ev] = new SloEvaluator(metrics).evaluate([target({ target: 0.99 })]);
    expect(ev.total).toBe(1000);
    expect(ev.errors).toBe(5);
    expect(ev.observed).toBeCloseTo(0.995, 10);
    expect(ev.met).toBe(true);
  });

  it('getSamples returns every recorded counter series; empty for unrecorded', () => {
    const metrics = new PrometheusMetrics();
    const c = metrics.counter({ name: 'http_requests_total', help: 'h', labelNames: ['status'] });
    c.inc({ status: '200' }, 3);
    c.inc({ status: '500' }, 2);
    const samples = metrics.getSamples('http_requests_total');
    expect(samples).toHaveLength(2);
    expect(samples.reduce((sum, s) => sum + s.value, 0)).toBe(5);
    expect(metrics.getSamples('never_recorded')).toEqual([]);
  });

  it('a fresh registry (no requests recorded) is insufficient data, not 100%', () => {
    const metrics = new PrometheusMetrics();
    const [ev] = new SloEvaluator(metrics).evaluate([target()]);
    expect(ev.observed).toBeNull();
    expect(ev.reason).toBe('insufficient data');
  });
});
