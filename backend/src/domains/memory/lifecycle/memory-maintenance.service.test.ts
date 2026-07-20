/**
 * memory-maintenance.service tests — proves the maintenance driver FIRES the
 * engines it fuses: the beads durability flush (`bd vc commit`), the
 * config-gated beads gc (`bd gc` every Nth sweep, 0=off), and the mem0
 * consolidation sweep — all degrade-truthful (never throw, never fake), with
 * every beads write attributed to the `memory-maintenance` audit actor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  BeadsFlushResult,
  IssueGraphService,
} from '../ports/issue-graph.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import type { Mem0Port, Mem0ConsolidateResult } from '../ports/mem0.port.js';
import { MAINTENANCE_ACTOR, MemoryMaintenanceService } from './memory-maintenance.service.js';

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
    // The durability commit is attributed to the maintenance loop, not $USER.
    expect(flush).toHaveBeenCalledWith('bd: memory durability flush', MAINTENANCE_ACTOR);
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

describe('MemoryMaintenanceService gc sweep (config-gated, off by default)', () => {
  it('never runs bd gc when gcEverySweeps is unset/0 (truthful disabled reason)', async () => {
    const gc = vi.fn(async () => ({ ran: true }));
    const svc = new MemoryMaintenanceService({
      beads: beads({ gc }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
    });

    const stats = await svc.sweepOnce();
    expect(gc).not.toHaveBeenCalled();
    expect(stats.gc).toEqual({
      attempted: false,
      ran: false,
      reason: 'gc disabled (gcEverySweeps=0)',
    });
  });

  it('runs bd gc on every Nth sweep, attributed to memory-maintenance', async () => {
    const gc = vi.fn(async () => ({ ran: true }));
    const svc = new MemoryMaintenanceService({
      beads: beads({ gc }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
      gcEverySweeps: 2,
    });

    const first = await svc.sweepOnce();
    expect(gc).not.toHaveBeenCalled();
    expect(first.gc.attempted).toBe(false);
    expect(first.gc.reason).toContain('not due');

    const second = await svc.sweepOnce();
    expect(gc).toHaveBeenCalledTimes(1);
    // The graph compaction is stamped with the maintenance audit actor.
    expect(gc).toHaveBeenCalledWith(MAINTENANCE_ACTOR);
    expect(second.gc).toEqual({ attempted: true, ran: true });

    await svc.sweepOnce();
    const fourth = await svc.sweepOnce();
    expect(gc).toHaveBeenCalledTimes(2);
    expect(fourth.gc.ran).toBe(true);
  });

  it('reports a truthful {ran:false, reason} when bd is down (never fakes a gc)', async () => {
    const svc = new MemoryMaintenanceService({
      beads: beads({ gc: async () => ({ ran: false, reason: 'bd binary not found' }) }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
      gcEverySweeps: 1,
    });

    const stats = await svc.sweepOnce();
    expect(stats.gc).toEqual({
      attempted: true,
      ran: false,
      reason: 'bd binary not found',
    });
  });

  it('never throws when the gc faults (degrade-safe)', async () => {
    const svc = new MemoryMaintenanceService({
      beads: beads({
        gc: async () => {
          throw new Error('bd gc exploded');
        },
      }),
      mem0: mem0(),
      logger: silentLogger,
      intervalMs: 0,
      gcEverySweeps: 1,
    });

    const stats = await svc.sweepOnce();
    expect(stats.gc.attempted).toBe(true);
    expect(stats.gc.ran).toBe(false);
    expect(stats.gc.reason).toMatch(/exploded/i);
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
