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
} from '../services/health-aggregator.service.js';
import type { EngineHealth } from '../types.js';

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
