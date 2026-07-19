/**
 * `MemoryMaintenanceService` — the memory domain's periodic maintenance loop, a
 * lifecycle interval driver modeled on agent-os `OutboxDrainService`. Each pass
 * ({@link sweepOnce}) fuses two engine-owned durability chores:
 *
 *  1. beads SYNC durability flush — commit the working-set of the Dolt-versioned
 *     issue graph (`bd vc commit`) so the note/update/close mutations agents make
 *     become a durable, versioned checkpoint (not just a dirty working set).
 *  2. mem0 decay/consolidation sweep — drive mem0's batch consolidation/decay.
 *     mem0's real fact-merge / dedup / decay runs INLINE on every `add`, so the
 *     in-lib client reports a truthful no-op; a self-hosted sidecar's batch pass
 *     is triggered when wired.
 *
 * Degrade-safe throughout: `bd` down → nothing committed (truthful reason); mem0
 * absent → truthful skip. A pass NEVER throws and never fabricates a commit or a
 * consolidation. Overlapping passes are skipped and the timer is `unref`'d so it
 * never keeps the process alive on its own.
 */
import type { Logger } from '../../../shared/logger.js';
import type { BeadsMemoryPort } from '../ports/beads-memory.port.js';
import type { Mem0Port } from '../ports/mem0.port.js';

/** The truthful outcome of one maintenance pass. */
export interface MaintenanceStats {
  readonly operation: 'memory.maintenance';
  readonly beads: {
    /** True when a flush was attempted (bd reported available AND supports flush). */
    readonly attempted: boolean;
    /** True only when `bd vc commit` created a new Dolt commit. */
    readonly committed: boolean;
    readonly hash?: string;
    readonly reason?: string;
  };
  readonly mem0: {
    /** True when a consolidate was attempted (the port exposes the seam). */
    readonly attempted: boolean;
    /** True only when a real batch consolidate ran (never a faked success). */
    readonly ok: boolean;
    readonly reason?: string;
  };
}

export interface MemoryMaintenanceDeps {
  readonly beads: BeadsMemoryPort;
  readonly mem0: Mem0Port;
  readonly logger: Logger;
  readonly intervalMs: number;
  /** Commit message for the durability flush (defaults to a stable label). */
  readonly commitMessage?: string;
}

export class MemoryMaintenanceService {
  private readonly beads: BeadsMemoryPort;
  private readonly mem0: Mem0Port;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private readonly commitMessage: string;

  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(deps: MemoryMaintenanceDeps) {
    this.beads = deps.beads;
    this.mem0 = deps.mem0;
    this.logger = deps.logger;
    this.intervalMs = deps.intervalMs;
    this.commitMessage =
      deps.commitMessage?.trim() || 'bd: memory durability flush';
  }

  /** Run one maintenance pass. NEVER throws — every fault degrades truthfully. */
  async sweepOnce(): Promise<MaintenanceStats> {
    const beads = this.flushBeads();
    const mem0 = await this.consolidateMem0();
    return { operation: 'memory.maintenance', beads, mem0 };
  }

  /** Beads durability flush — commit the Dolt working-set (`bd vc commit`). */
  private flushBeads(): MaintenanceStats['beads'] {
    // Only attempt when bd is reachable AND this port build exposes the flush
    // seam (older/fake ports may not) — otherwise a truthful "skipped".
    if (!this.beads.available() || typeof this.beads.flush !== 'function') {
      return {
        attempted: false,
        committed: false,
        reason: 'bd unavailable or flush unsupported',
      };
    }
    try {
      const res = this.beads.flush(this.commitMessage);
      return res.committed
        ? {
            attempted: true,
            committed: true,
            ...(res.hash ? { hash: res.hash } : {}),
          }
        : {
            attempted: true,
            committed: false,
            ...(res.reason ? { reason: res.reason } : {}),
          };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'bd vc commit failed';
      this.logger.warn({ reason }, 'memory maintenance: beads flush faulted');
      return { attempted: true, committed: false, reason };
    }
  }

  /** mem0 decay/consolidation sweep — best-effort batch trigger. */
  private async consolidateMem0(): Promise<MaintenanceStats['mem0']> {
    if (typeof this.mem0.consolidate !== 'function') {
      return {
        attempted: false,
        ok: false,
        reason: 'mem0 consolidate unsupported',
      };
    }
    try {
      const res = await this.mem0.consolidate();
      return res.ok
        ? { attempted: true, ok: true }
        : {
            attempted: true,
            ok: false,
            ...(res.reason ? { reason: res.reason } : {}),
          };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'mem0 consolidate failed';
      this.logger.warn(
        { reason },
        'memory maintenance: mem0 consolidate faulted'
      );
      return { attempted: true, ok: false, reason };
    }
  }

  /** Start the interval driver. Idempotent; overlapping passes are skipped. */
  start(): void {
    if (this.timer || this.intervalMs <= 0) return;
    this.timer = setInterval(() => {
      if (this.sweeping) return;
      this.sweeping = true;
      void this.sweepOnce()
        .then(stats => {
          if (stats.beads.committed) {
            this.logger.info(
              { hash: stats.beads.hash ?? null },
              'memory maintenance: durability flush committed graph'
            );
          }
        })
        .catch(err => {
          this.logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'memory maintenance pass failed'
          );
        })
        .finally(() => {
          this.sweeping = false;
        });
    }, this.intervalMs);
    // Never keep the event loop alive solely for the maintenance sweep.
    this.timer.unref?.();
  }

  /** Stop the interval driver. Idempotent, degrade-safe. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
