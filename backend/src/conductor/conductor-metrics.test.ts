/**
 * Tests for conductor-metrics — the in-process observability registry.
 *
 * These exercise the REAL registry (the module-level counter/gauge/histogram
 * Maps and the real snapshot/labelKey logic). Nothing is stubbed. `metrics.reset()`
 * isolates each test from the shared module-level state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { metrics, recordLaunch, recordReconcile, recordWorkflow } from './conductor-metrics.js';

beforeEach(() => {
  metrics.reset();
});

describe('conductor-metrics counters', () => {
  it('increments a counter per call and keys by sorted labels', () => {
    metrics.counter('conductor_launches_total', { runtime: 'claude_code', status: 'success' });
    metrics.counter('conductor_launches_total', { runtime: 'claude_code', status: 'success' });
    metrics.counter('conductor_launches_total', { runtime: 'claude_code', status: 'failure' });

    const snap = metrics.snapshot();
    expect(snap.counters['conductor_launches_total{runtime="claude_code",status="success"}']).toBe(2);
    expect(snap.counters['conductor_launches_total{runtime="claude_code",status="failure"}']).toBe(1);
  });

  it('produces a stable label key regardless of insertion order (sorted)', () => {
    metrics.counter('m', { b: '2', a: '1' });
    metrics.counter('m', { a: '1', b: '2' });
    const snap = metrics.snapshot();
    // Both calls collapse to the same sorted key, so the count is 2.
    expect(snap.counters['m{a="1",b="2"}']).toBe(2);
    expect(Object.keys(snap.counters)).toHaveLength(1);
  });

  it('supports an unlabeled counter', () => {
    metrics.counter('conductor_reconcile_total');
    metrics.counter('conductor_reconcile_total');
    expect(metrics.snapshot().counters['conductor_reconcile_total{}']).toBe(2);
  });
});

describe('conductor-metrics gauges', () => {
  it('sets (overwrites) the latest gauge value rather than accumulating', () => {
    metrics.gauge('conductor_orphans', 3);
    metrics.gauge('conductor_orphans', 1);
    expect(metrics.snapshot().gauges['conductor_orphans{}']).toBe(1);
  });

  it('keeps gauges with different labels independent', () => {
    metrics.gauge('conductor_workflow_steps', 5, { pattern: 'fanout' });
    metrics.gauge('conductor_workflow_steps', 2, { pattern: 'pipeline' });
    const snap = metrics.snapshot();
    expect(snap.gauges['conductor_workflow_steps{pattern="fanout"}']).toBe(5);
    expect(snap.gauges['conductor_workflow_steps{pattern="pipeline"}']).toBe(2);
  });
});

describe('conductor-metrics histograms', () => {
  it('observes count/sum/min/max and computes the average in the snapshot', () => {
    metrics.histogram('conductor_launch_duration_ms', 100, { runtime: 'claude_code' });
    metrics.histogram('conductor_launch_duration_ms', 300, { runtime: 'claude_code' });
    metrics.histogram('conductor_launch_duration_ms', 200, { runtime: 'claude_code' });

    const h = metrics.snapshot().histograms['conductor_launch_duration_ms{runtime="claude_code"}'];
    expect(h.count).toBe(3);
    expect(h.min).toBe(100);
    expect(h.max).toBe(300);
    expect(h.avg).toBeCloseTo(200, 5);
  });

  it('reports a zeroed min/avg for a name that was never observed (absent key)', () => {
    metrics.histogram('observed', 50);
    const snap = metrics.snapshot();
    expect(snap.histograms['observed{}'].min).toBe(50);
    // A never-observed name simply has no entry.
    expect(snap.histograms['never{}']).toBeUndefined();
  });
});

describe('conductor-metrics snapshot + reset isolation', () => {
  it('snapshot is a point-in-time copy carrying an ISO timestamp', () => {
    metrics.counter('x');
    const snap = metrics.snapshot();
    expect(typeof snap.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(snap.timestamp))).toBe(false);
    // Mutating the returned snapshot does not affect the live registry.
    snap.counters['x{}'] = 999;
    expect(metrics.snapshot().counters['x{}']).toBe(1);
  });

  it('reset clears all counters, gauges and histograms', () => {
    metrics.counter('c');
    metrics.gauge('g', 1);
    metrics.histogram('h', 10);
    metrics.reset();
    const snap = metrics.snapshot();
    expect(snap.counters).toEqual({});
    expect(snap.gauges).toEqual({});
    expect(snap.histograms).toEqual({});
  });
});

describe('conductor-metrics convenience helpers', () => {
  it('recordLaunch writes a status-labeled counter and a duration histogram', () => {
    recordLaunch('claude_code', true, 250);
    recordLaunch('claude_code', false, 80);
    const snap = metrics.snapshot();
    expect(snap.counters['conductor_launches_total{runtime="claude_code",status="success"}']).toBe(1);
    expect(snap.counters['conductor_launches_total{runtime="claude_code",status="failure"}']).toBe(1);
    const h = snap.histograms['conductor_launch_duration_ms{runtime="claude_code"}'];
    expect(h.count).toBe(2);
    expect(h.min).toBe(80);
    expect(h.max).toBe(250);
  });

  it('recordReconcile increments the reconcile counter and sets the orphans gauge', () => {
    recordReconcile(4);
    recordReconcile(0);
    const snap = metrics.snapshot();
    expect(snap.counters['conductor_reconcile_total{}']).toBe(2);
    // Gauge holds the LATEST value.
    expect(snap.gauges['conductor_orphans{}']).toBe(0);
  });

  it('recordWorkflow tracks per-pattern status counters and step gauges', () => {
    recordWorkflow('fanout', 3, true);
    recordWorkflow('fanout', 5, false);
    const snap = metrics.snapshot();
    expect(snap.counters['conductor_workflows_total{pattern="fanout",status="success"}']).toBe(1);
    expect(snap.counters['conductor_workflows_total{pattern="fanout",status="failure"}']).toBe(1);
    // Latest step count for the pattern.
    expect(snap.gauges['conductor_workflow_steps{pattern="fanout"}']).toBe(5);
  });
});
