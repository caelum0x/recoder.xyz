/**
 * `MemoryMaintenanceService` — the memory domain's periodic maintenance loop, a
 * lifecycle interval driver modeled on agent-os `OutboxDrainService`. Each pass
 * ({@link sweepOnce}) fuses two engine-owned durability chores:
 *
 *  1. beads SYNC durability flush — commit the working-set of the Dolt-versioned
 *     issue graph (`bd vc commit`) so the note/update/close mutations agents make
 *     become a durable, versioned checkpoint (not just a dirty working set).
 *  2. beads GC (`bd gc`) — decay closed/expired memory wisps + compact the Dolt
 *     graph, CONFIG-GATED at a low cadence (`memory.gcEverySweeps` = run every
 *     Nth sweep; 0 = off, the default). Without it the wisp→promote candidate
 *     loop leaks closed/expired wisps forever.
 *  3. mem0 decay/consolidation sweep — drive mem0's batch consolidation/decay.
 *     mem0's real fact-merge / dedup / decay runs INLINE on every `add`, so the
 *     in-lib client reports a truthful no-op; a self-hosted sidecar's batch pass
 *     is triggered when wired.
 *
 * Both beads writes are stamped with the {@link MAINTENANCE_ACTOR} audit actor
 * so bd's interactions trail attributes them to this loop, not to $USER.
 *
 * Degrade-safe throughout: `bd` down → nothing committed / `{ran:false, reason}`
 * (truthful); mem0 absent → truthful skip. A pass NEVER throws and never
 * fabricates a commit, a gc, or a consolidation. Overlapping passes are skipped
 * and the timer is `unref`'d so it never keeps the process alive on its own.
 */
import type { Logger } from '../../../shared/logger.js';
import type { IssueGraphService } from '../ports/issue-graph.port.js';
import type { Mem0Port } from '../ports/mem0.port.js';

/** The bd audit-trail actor every maintenance write is attributed to. */
export const MAINTENANCE_ACTOR = 'memory-maintenance';

/** The truthful outcome of one maintenance pass. */
export interface MaintenanceStats {
  readonly operation: 'memory.maintenance';
  readonly beads: {
    /** True when a flush was attempted (the issue-graph facet reported bd up). */
    readonly attempted: boolean;
    /** True only when `bd vc commit` created a new Dolt commit. */
    readonly committed: boolean;
    readonly hash?: string;
    readonly reason?: string;
  };
  readonly gc: {
    /** True when the config-gated cadence made gc due this pass. */
    readonly attempted: boolean;
    /** True only when `bd gc` really ran (bd down ⇒ `false` + the reason). */
    readonly ran: boolean;
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
  /** The beads module facet — health probe + `flush` (`bd vc commit`). */
  readonly beads: IssueGraphService;
  readonly mem0: Mem0Port;
  readonly logger: Logger;
  readonly intervalMs: number;
  /** Run `bd gc` every Nth sweep (`memory.gcEverySweeps`); 0/absent = off. */
  readonly gcEverySweeps?: number;
  /** Commit message for the durability flush (defaults to a stable label). */
  readonly commitMessage?: string;
}

export class MemoryMaintenanceService {
  private readonly beads: IssueGraphService;
  private readonly mem0: Mem0Port;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private readonly gcEverySweeps: number;
  private readonly commitMessage: string;

  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private sweepCount = 0;

  constructor(deps: MemoryMaintenanceDeps) {
    this.beads = deps.beads;
    this.mem0 = deps.mem0;
    this.logger = deps.logger;
    this.intervalMs = deps.intervalMs;
    this.gcEverySweeps = deps.gcEverySweeps ?? 0;
    this.commitMessage =
      deps.commitMessage?.trim() || 'bd: memory durability flush';
  }

  /** Run one maintenance pass. NEVER throws — every fault degrades truthfully. */
  async sweepOnce(): Promise<MaintenanceStats> {
    this.sweepCount += 1;
    const beads = await this.flushBeads();
    // GC after the flush so the compaction works over a sealed working set.
    const gc = await this.gcIfDue();
    const mem0 = await this.consolidateMem0();
    return { operation: 'memory.maintenance', beads, gc, mem0 };
  }

  /** Beads durability flush — commit the Dolt working-set (`bd vc commit`). */
  private async flushBeads(): Promise<MaintenanceStats['beads']> {
    try {
      // Only attempt when the facet reports bd reachable — otherwise a truthful
      // "skipped" (attempted:false) instead of a flush that can never commit.
      const health = await this.beads.health();
      if (!health.available) {
        return {
          attempted: false,
          committed: false,
          reason: health.reason ?? 'bd unavailable',
        };
      }
      const res = await this.beads.flush(this.commitMessage, MAINTENANCE_ACTOR);
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

  /**
   * Beads lifecycle GC (`bd gc`) — decay closed/expired wisps + compact, run
   * only every Nth sweep per `gcEverySweeps` (0 = off). Truthful throughout:
   * not due ⇒ `{attempted:false, reason}`; bd down ⇒ `{ran:false, reason}`.
   */
  private async gcIfDue(): Promise<MaintenanceStats['gc']> {
    if (this.gcEverySweeps <= 0) {
      return { attempted: false, ran: false, reason: 'gc disabled (gcEverySweeps=0)' };
    }
    if (this.sweepCount % this.gcEverySweeps !== 0) {
      return {
        attempted: false,
        ran: false,
        reason: `not due (sweep ${this.sweepCount}, cadence ${this.gcEverySweeps})`,
      };
    }
    try {
      const res = await this.beads.gc(MAINTENANCE_ACTOR);
      if (res.ran) {
        this.logger.info(
          { sweep: this.sweepCount },
          'memory maintenance: beads gc compacted the issue graph'
        );
        return { attempted: true, ran: true };
      }
      return {
        attempted: true,
        ran: false,
        ...(res.reason ? { reason: res.reason } : {}),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'bd gc failed';
      this.logger.warn({ reason }, 'memory maintenance: beads gc faulted');
      return { attempted: true, ran: false, reason };
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
