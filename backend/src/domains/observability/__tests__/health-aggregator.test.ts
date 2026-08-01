/**
 * T1 — the aggregator's TRUTHFULNESS invariant: one `down` engine → `degraded`
 * rollup (never masked green); a timed-out source → `unknown` (never a hang); the
 * SLO rollup + status counts are computed correctly and per-source truth preserved.
 */
import { describe, it, expect } from 'vitest';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { createHealthRegistry } from '../../../bootstrap/health-registry.js';
import {
  HealthAggregator,
  buildHealthFull,
  rollupStatus,
  countStatuses,
  sloRollupContributions,
} from '../services/health-aggregator.service.js';
import { SloEvaluator } from '../services/slo-evaluator.service.js';
import type { MetricSample, MetricsReader } from '../ports/metrics.port.js';
import type { SloRepository } from '../ports/observability.repository.js';
import type { EngineHealth, SloAttainment, SloTarget } from '../types.js';

const engines: readonly EngineHealth[] = [
  { engine: 'logging', status: 'up', degraded: false },
  { engine: 'metrics', status: 'up', degraded: false },
];

function comp(name: string, status: ComponentHealth['status']): ComponentHealth {
  return { name, status, degraded: status !== 'up' };
}

describe('rollupStatus', () => {
  it('empty → up', () => {
    expect(rollupStatus([])).toBe('up');
  });
  it('one down with an up → degraded (never masked green)', () => {
    expect(rollupStatus(['up', 'down'])).toBe('degraded');
  });
  it('all down → down', () => {
    expect(rollupStatus(['down', 'down'])).toBe('down');
  });
  it('any unknown (no worse) → degraded, never up', () => {
    expect(rollupStatus(['up', 'unknown'])).toBe('degraded');
  });
  it('all up → up', () => {
    expect(rollupStatus(['up', 'up'])).toBe('up');
  });
});

describe('buildHealthFull', () => {
  it('one down source degrades the whole report but preserves per-source truth', () => {
    const sources = [comp('persistence', 'up'), comp('conductor', 'down')];
    const full = buildHealthFull({
      sources,
      engines,
      slo: [],
      service: 'recoder-backend',
      instanceId: 'i1',
    });
    expect(full.status).toBe('degraded');
    expect(full.degraded).toBe(true);
    // per-source truth intact
    expect(full.sources.find((s) => s.name === 'conductor')?.status).toBe('down');
    expect(full.counts).toEqual({ up: 1, down: 1, degraded: 0, unknown: 0 });
  });

  it('SLO rollup is carried verbatim (no fabricated attainment)', () => {
    const full = buildHealthFull({
      sources: [comp('edge', 'up')],
      engines,
      slo: [{ id: 's1', name: 'api-latency-p99', target: 0.999, observed: null, met: null }],
      service: 'svc',
      instanceId: 'i',
    });
    expect(full.slo[0].observed).toBeNull();
    expect(full.slo[0].met).toBeNull();
  });
});

describe('countStatuses', () => {
  it('tallies every terminal state', () => {
    const counts = countStatuses([comp('a', 'up'), comp('b', 'degraded'), comp('c', 'unknown')]);
    expect(counts).toEqual({ up: 1, degraded: 1, unknown: 1, down: 0 });
  });
});

describe('HealthAggregator over the registry', () => {
  it('a source that hangs past the probe timeout becomes unknown → degraded, never hangs', async () => {
    const registry = createHealthRegistry({ probeTimeoutMs: 20 });
    registry.register({ name: 'fast', health: () => comp('fast', 'up') });
    registry.register({
      name: 'slow',
      health: () => new Promise<ComponentHealth>(() => {}), // never resolves
    });

    const agg = new HealthAggregator({
      registry,
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.status).toBe('degraded');
    expect(full.sources.find((s) => s.name === 'slow')?.status).toBe('unknown');
  });

  it('shallow report exposes no per-domain detail (only a count)', async () => {
    const registry = createHealthRegistry();
    registry.register({ name: 'edge', health: () => comp('edge', 'up') });
    const agg = new HealthAggregator({
      registry,
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const shallow = await agg.shallow();
    expect(shallow.sources).toBe(1);
    expect(shallow.status).toBe('up');
    expect(shallow).not.toHaveProperty('sources.0.name');
  });
});

// --- SLO folded into the rollup (BE-7.2) ------------------------------------

function attainment(partial: Partial<SloAttainment> = {}): SloAttainment {
  return { id: 's1', name: 'http-availability', target: 0.99, observed: 0.999, met: true, ...partial };
}

describe('sloRollupContributions', () => {
  it('a breached SLO (met false) contributes degraded', () => {
    expect(sloRollupContributions([attainment({ met: false, observed: 0.5 })])).toEqual(['degraded']);
  });
  it('a met SLO contributes nothing (rollup stays as sources dictate)', () => {
    expect(sloRollupContributions([attainment({ met: true })])).toEqual([]);
  });
  it('insufficient-data (observed/met null) contributes nothing (never fake-degraded)', () => {
    expect(sloRollupContributions([attainment({ observed: null, met: null })])).toEqual([]);
  });
  it('empty SLO set contributes nothing (degrade-safe default)', () => {
    expect(sloRollupContributions([])).toEqual([]);
  });
});

describe('buildHealthFull folds a breached SLO into the rollup', () => {
  it('all sources up but one SLO breached → overall degraded (truthful, not green)', () => {
    const full = buildHealthFull({
      sources: [comp('edge', 'up'), comp('conductor', 'up')],
      engines,
      slo: [attainment({ met: false, observed: 0.9 })],
      service: 'svc',
      instanceId: 'i',
    });
    expect(full.status).toBe('degraded');
    expect(full.degraded).toBe(true);
    // counts stay a SOURCE tally — the SLO breach does not invent a phantom source.
    expect(full.counts).toEqual({ up: 2, down: 0, degraded: 0, unknown: 0 });
  });

  it('insufficient-data SLO does NOT drag an all-up system to degraded', () => {
    const full = buildHealthFull({
      sources: [comp('edge', 'up')],
      engines,
      slo: [attainment({ observed: null, met: null })],
      service: 'svc',
      instanceId: 'i',
    });
    expect(full.status).toBe('up');
    // the SLO cell still tells the truth: no data, never a fabricated attainment.
    expect(full.slo[0].observed).toBeNull();
    expect(full.slo[0].met).toBeNull();
  });

  it('a met SLO keeps an all-up system green', () => {
    const full = buildHealthFull({
      sources: [comp('edge', 'up')],
      engines,
      slo: [attainment({ met: true, observed: 0.999 })],
      service: 'svc',
      instanceId: 'i',
    });
    expect(full.status).toBe('up');
  });
});

// --- HealthAggregator.full() wired to the SloEvaluator ----------------------

function fakeReader(samples: readonly MetricSample[]): MetricsReader {
  return {
    getSamples: (name) => (name === 'http_requests_total' ? samples : []),
    getValue: () => null,
  };
}

function fakeSloRepo(targets: readonly SloTarget[]): SloRepository {
  return {
    listTargets: async () => targets,
    upsertTarget: async (t) => t,
  };
}

function sloTarget(overrides: Partial<SloTarget> = {}): SloTarget {
  return {
    id: 's1',
    spaceId: 'default',
    name: 'http-availability',
    target: 0.99,
    windowSecs: 3600,
    metricQuery: '1 - rate(http_requests_total{status=~"5.."}[1h])',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('HealthAggregator.full surfaces REAL SLO attainment via the evaluator', () => {
  const registry = createHealthRegistry();
  registry.register({ name: 'edge', health: () => comp('edge', 'up') });

  it('computes observed attainment from the recorded RED counter and marks met', async () => {
    const reader = fakeReader([
      { labels: { status: '200' }, value: 995 },
      { labels: { status: '500' }, value: 5 },
    ]);
    const agg = new HealthAggregator({
      registry,
      slo: fakeSloRepo([sloTarget({ target: 0.99 })]),
      sloEvaluator: new SloEvaluator(reader),
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.slo).toHaveLength(1);
    expect(full.slo[0].observed).toBeCloseTo(0.995, 10);
    expect(full.slo[0].met).toBe(true);
    // met SLO + up source → overall up.
    expect(full.status).toBe('up');
  });

  it('a BREACHED SLO degrades /health/full even when every source is up', async () => {
    const reader = fakeReader([
      { labels: { status: '200' }, value: 500 },
      { labels: { status: '500' }, value: 500 },
    ]);
    const agg = new HealthAggregator({
      registry,
      slo: fakeSloRepo([sloTarget({ target: 0.99 })]),
      sloEvaluator: new SloEvaluator(reader),
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.slo[0].observed).toBeCloseTo(0.5, 10);
    expect(full.slo[0].met).toBe(false);
    expect(full.status).toBe('degraded');
  });

  it('zero traffic → insufficient data (null), never a fabricated 100%, and stays up', async () => {
    const agg = new HealthAggregator({
      registry,
      slo: fakeSloRepo([sloTarget()]),
      sloEvaluator: new SloEvaluator(fakeReader([])),
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.slo[0].observed).toBeNull();
    expect(full.slo[0].met).toBeNull();
    expect(full.status).toBe('up');
  });

  it('no SLO targets → empty attainment, degrade-safe (no evaluator call surfaced)', async () => {
    const agg = new HealthAggregator({
      registry,
      slo: fakeSloRepo([]),
      sloEvaluator: new SloEvaluator(fakeReader([])),
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.slo).toEqual([]);
    expect(full.status).toBe('up');
  });

  it('target-load failure is degrade-safe: empty attainment, no throw', async () => {
    const failingRepo: SloRepository = {
      listTargets: async () => {
        throw new Error('db down');
      },
      upsertTarget: async (t) => t,
    };
    const agg = new HealthAggregator({
      registry,
      slo: failingRepo,
      sloEvaluator: new SloEvaluator(fakeReader([])),
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.slo).toEqual([]);
    expect(full.status).toBe('up');
  });

  it('without an evaluator wired, attainment stays truthfully null (backward-compatible)', async () => {
    const agg = new HealthAggregator({
      registry,
      slo: fakeSloRepo([sloTarget()]),
      service: 'svc',
      instanceId: 'i',
      defaultSpaceId: 'default',
    });
    const full = await agg.full(engines);
    expect(full.slo).toHaveLength(1);
    expect(full.slo[0].observed).toBeNull();
    expect(full.slo[0].met).toBeNull();
  });
});
