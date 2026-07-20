/**
 * memory-maintenance.service tests — proves the maintenance driver FIRES the
 * engines it fuses: the beads durability flush (`bd vc commit`) and the mem0
 * consolidation sweep, both degrade-truthful (never throw, never fake).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  BeadsFlushResult,
  IssueGraphService,
} from '../ports/issue-graph.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import type { Mem0Port, Mem0ConsolidateResult } from '../ports/mem0.port.js';
import { MemoryMaintenanceService } from './memory-maintenance.service.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() {
    return silentLogger;
  },
} as never;

function beads(overrides: Partial<IssueGraphService> = {}): IssueGraphService {
  return fakeIssueGraph({
    health: async () => ({ available: true }),
    flush: async () => ({ committed: true, hash: 'abc123' }),
    ...overrides,
  });
}

function mem0(overrides: Partial<Mem0Port> = {}): Mem0Port {
  return {
    async search() {
      return [];
    },
    async add() {
      return { ok: true };
    },
    async health() {
      return { available: true, mode: 'oss' };
    },
    async consolidate(): Promise<Mem0ConsolidateResult> {
      return { ok: false, reason: 'inline on add' };
    },
    ...overrides,
  };
}

describe('MemoryMaintenanceService.sweepOnce', () => {
  it('fires the beads durability flush and reports the commit hash', async () => {
    const flush = vi.fn(async (): Promise<BeadsFlushResult> => ({
      committed: true,
      hash: 'deadbeef',
    }));
    const svc = new MemoryMaintenanceService({
      beads: beads({ flush }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(stats.beads.attempted).toBe(true);
    expect(stats.beads.committed).toBe(true);
    expect(stats.beads.hash).toBe('deadbeef');
  });

  it('fires the mem0 consolidation sweep', async () => {
    const consolidate = vi.fn(async (): Promise<Mem0ConsolidateResult> => ({
      ok: true,
    }));
    const svc = new MemoryMaintenanceService({
      beads: beads(),
      mem0: mem0({ consolidate }),
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(consolidate).toHaveBeenCalledTimes(1);
    expect(stats.mem0.attempted).toBe(true);
    expect(stats.mem0.ok).toBe(true);
  });

  it('skips the flush truthfully when bd is unavailable', async () => {
    const flush = vi.fn(async (): Promise<BeadsFlushResult> => ({ committed: true }));
    const svc = new MemoryMaintenanceService({
      beads: beads({
        health: async () => ({ available: false, reason: 'bd binary not found' }),
        flush,
      }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(flush).not.toHaveBeenCalled();
    expect(stats.beads.attempted).toBe(false);
    expect(stats.beads.committed).toBe(false);
  });

  it('surfaces a truthful "nothing to commit" without faking a commit', async () => {
    const svc = new MemoryMaintenanceService({
      beads: beads({
        flush: async () => ({ committed: false, reason: 'nothing to commit' }),
      }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(stats.beads.attempted).toBe(true);
    expect(stats.beads.committed).toBe(false);
    expect(stats.beads.reason).toMatch(/nothing to commit/i);
  });

  it('never throws when the flush faults (degrade-safe)', async () => {
    const svc = new MemoryMaintenanceService({
      beads: beads({
        flush: async () => {
          throw new Error('bd exploded');
        },
      }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(stats.beads.committed).toBe(false);
    expect(stats.beads.reason).toMatch(/exploded/i);
  });

  it('skips mem0 consolidate truthfully when the port does not expose it', async () => {
    const noConsolidate = mem0();
    delete (noConsolidate as { consolidate?: unknown }).consolidate;
    const svc = new MemoryMaintenanceService({
      beads: beads(),
      mem0: noConsolidate,
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(stats.mem0.attempted).toBe(false);
    expect(stats.mem0.ok).toBe(false);
  });
});

describe('MemoryMaintenanceService interval driver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs a sweep on each interval tick and stops cleanly', async () => {
    const flush = vi.fn(async (): Promise<BeadsFlushResult> => ({
      committed: false,
      reason: 'nothing to commit',
    }));
    const svc = new MemoryMaintenanceService({
      beads: beads({ flush }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 1000,
    });

    svc.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(2);

    svc.stop();
    const callsAtStop = flush.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(flush.mock.calls.length).toBe(callsAtStop);
  });

  it('is disabled when intervalMs is 0 (never ticks)', async () => {
    const flush = vi.fn(async (): Promise<BeadsFlushResult> => ({ committed: true }));
    const svc = new MemoryMaintenanceService({
      beads: beads({ flush }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
    });

    svc.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(flush).not.toHaveBeenCalled();
    svc.stop();
  });
});
