/**
 * LockManager — the impure shell around the pure `LockService`.
 *
 * This is the ONLY lock file that touches ports. It reads the current lock set
 * from `LockStorePort`, issues ids + fence tokens via `IdGeneratorPort` /
 * `LeaseFencerPort`, runs the pure `LockService` transform, then persists +
 * publishes via the store and event bus. Errors are returned as `Result`
 * (never thrown across the boundary, per design §9).
 *
 * The pure decision and the IO are kept strictly separate: `LockService`
 * decides, `LockManager` commits. The design's effect-runner can alternatively
 * interpret the `Effect[]` from `lock-events`/`lock-reaper`; this manager is the
 * direct-commit convenience path used by the engine's lock commands.
 */

import type {
  AcquireLockRequest,
  ReleaseLockRequest,
  RenewLockRequest,
  WorkLock,
} from '../domain';
import type {
  ClockPort,
  EventBusPort,
  IdGeneratorPort,
  LeaseFencerPort,
  LockScope,
  LockStorePort,
  MetricsPort,
} from '../ports';
import { toCoordinationError, type CoordinationError } from '../errors';
import { err, ok, type Result } from '../result';
import { LockService } from './lock-service';
import { fenceScopeKey } from './lock-fencing';
import { lockAcquiredEvent, lockReleasedEvent } from './lock-events';

export type LockManagerPorts = {
  store: LockStorePort;
  fencer: LeaseFencerPort;
  ids: IdGeneratorPort;
  clock: ClockPort;
  events?: EventBusPort;
  metrics?: MetricsPort;
};

/** No-op metrics so the manager never depends on a backend. */
const NOOP_METRICS: MetricsPort = {
  increment: () => undefined,
  observe: () => undefined,
  gauge: () => undefined,
};

export class LockManager {
  private readonly service = new LockService();
  private readonly store: LockStorePort;
  private readonly fencer: LeaseFencerPort;
  private readonly ids: IdGeneratorPort;
  private readonly clock: ClockPort;
  private readonly events?: EventBusPort;
  private readonly metrics: MetricsPort;

  constructor(ports: LockManagerPorts) {
    this.store = ports.store;
    this.fencer = ports.fencer;
    this.ids = ports.ids;
    this.clock = ports.clock;
    this.events = ports.events;
    this.metrics = ports.metrics ?? NOOP_METRICS;
  }

  /** Active locks for a scope at the current time. */
  async listActive(scope: LockScope): Promise<WorkLock[]> {
    const locks = await this.store.list(scope);
    return this.service.listActive(locks, this.clock.iso());
  }

  /**
   * Acquire a lock: read scope, issue id + fence token, run the pure acquire,
   * persist + publish. Returns `LockConflictError` (with conflicts[]) on
   * collision — never throws.
   */
  async acquire(request: AcquireLockRequest): Promise<Result<WorkLock, CoordinationError>> {
    try {
      const now = this.clock.iso();
      const existingLocks = await this.store.list({ spaceId: request.spaceId, repo: request.repo });
      const fenceToken = await this.fencer.issue(
        fenceScopeKey(request.spaceId, request.repo, request.pathGlob),
      );

      const { lock } = this.service.acquire({
        existingLocks,
        lockId: request.lockId ?? this.ids.lockId(),
        fenceToken,
        spaceId: request.spaceId,
        repo: request.repo,
        pathGlob: request.pathGlob,
        ownerAgentId: request.ownerAgentId,
        taskId: request.taskId,
        kind: request.kind,
        now,
        ttlMs: request.ttlMs,
      });

      const stored = await this.store.put(lock);
      this.metrics.increment('coordination_active_locks');
      await this.events?.publish(
        lockAcquiredEvent(stored, { eventId: this.ids.eventId(), time: now }),
      );
      return ok(stored);
    } catch (error) {
      this.metrics.increment('coordination_lock_conflicts_total');
      return err(toCoordinationError(error));
    }
  }

  /** Release a lock. Verifies fence token (if presented) before deleting. */
  async release(request: ReleaseLockRequest): Promise<Result<void, CoordinationError>> {
    try {
      const existing = await this.store.get(request.lockId);
      if (existing) {
        // Pure fence/ownership check via the service (throws on stale token).
        this.service.release([existing], {
          lockId: request.lockId,
          ownerAgentId: request.ownerAgentId,
          taskId: request.taskId,
          fenceToken: request.fenceToken,
        });
        await this.store.delete(request.lockId, {
          ownerAgentId: request.ownerAgentId,
          taskId: request.taskId,
        });
        await this.events?.publish(
          lockReleasedEvent(existing, { eventId: this.ids.eventId(), time: this.clock.iso() }),
        );
      }
      return ok(undefined);
    } catch (error) {
      return err(toCoordinationError(error));
    }
  }

  /** Renew an active lock's lease. Returns the renewed lock. */
  async renew(request: RenewLockRequest): Promise<Result<WorkLock, CoordinationError>> {
    try {
      const now = this.clock.iso();
      const existing = await this.store.get(request.lockId);
      const locks = existing ? [existing] : [];
      const { lock } = this.service.renew(locks, {
        lockId: request.lockId,
        ownerAgentId: request.ownerAgentId,
        taskId: request.taskId,
        fenceToken: request.fenceToken,
        now,
        ttlMs: request.ttlMs,
      });
      const stored = await this.store.put(lock);
      return ok(stored);
    } catch (error) {
      return err(toCoordinationError(error));
    }
  }
}
