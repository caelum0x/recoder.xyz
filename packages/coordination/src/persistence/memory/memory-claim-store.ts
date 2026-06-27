/**
 * MemoryClaimStore — CAS-over-a-Map `ClaimStorePort`, recovery-window aware.
 *
 * This is the in-memory analog of the Postgres `SELECT ... FOR UPDATE SKIP
 * LOCKED` exactly-once claim. `compareAndSet` succeeds only when no live (or
 * recovery-window-protected) claim already exists for the task — so two racing
 * dispatches of one task yield exactly one winner. Single-threaded JS makes the
 * read-then-write atomic without a real lock; the Postgres adapter (wave-2)
 * provides true concurrency safety.
 *
 * The recovery window (multica `claimResponseRecoveryWindow`) is enforced via
 * the injected window length: an in-flight start that has not yet emitted
 * `RunStarted` is never reclaimed.
 */

import type { TaskClaim } from '../../domain';
import { ClaimCoordinator } from '../../dispatch/claim-coordinator';
import type { ClaimStorePort } from '../../ports';

export type MemoryClaimStoreOptions = {
  /** multica claimResponseRecoveryWindow — protects an in-flight start. */
  recoveryWindowMs: number;
  /** Clock for window/lease evaluation; defaults to wall-clock. */
  now?: () => string;
};

export class MemoryClaimStore implements ClaimStorePort {
  private readonly byTask = new Map<string, TaskClaim>();
  private readonly byId = new Map<string, TaskClaim>();
  private readonly coordinator = new ClaimCoordinator();
  private readonly recoveryWindowMs: number;
  private readonly now: () => string;

  constructor(options: MemoryClaimStoreOptions) {
    this.recoveryWindowMs = options.recoveryWindowMs;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async getByTask(taskId: string): Promise<TaskClaim | undefined> {
    const claim = this.byTask.get(taskId);
    return claim ? { ...claim } : undefined;
  }

  async compareAndSet(claim: TaskClaim): Promise<TaskClaim | undefined> {
    const existing = this.byTask.get(claim.taskId);
    const now = this.now();

    // Idempotency: the same logical dispatch never produces a second claim. A
    // retry with the same idempotency key returns the already-stored claim.
    if (existing && existing.idempotencyKey === claim.idempotencyKey) {
      return { ...existing };
    }

    if (existing && this.coordinator.blocksNewClaim(existing, now, this.recoveryWindowMs)) {
      return undefined; // another agent holds a live/protected claim — loser
    }

    const stored: TaskClaim = { ...claim };
    this.byTask.set(stored.taskId, stored);
    this.byId.set(stored.claimId, stored);
    return { ...stored };
  }

  async renew(
    claimId: string,
    fenceToken: number,
    leaseUntil: string,
  ): Promise<TaskClaim | undefined> {
    const existing = this.byId.get(claimId);
    if (!existing || existing.fenceToken !== fenceToken) {
      return undefined;
    }
    const renewed: TaskClaim = { ...existing, leaseUntil };
    this.byId.set(claimId, renewed);
    this.byTask.set(renewed.taskId, renewed);
    return { ...renewed };
  }

  async release(claimId: string): Promise<void> {
    const existing = this.byId.get(claimId);
    if (!existing) {
      return;
    }
    this.byId.delete(claimId);
    if (this.byTask.get(existing.taskId)?.claimId === claimId) {
      this.byTask.delete(existing.taskId);
    }
  }

  /**
   * List all recorded claims, optionally scoped to spaces. Supports the
   * coherence snapshot loader's `ClaimSnapshotPort` (the reconcile-tick read
   * the per-task `ClaimStorePort` cannot serve).
   */
  async listClaims(spaceIds?: string[]): Promise<TaskClaim[]> {
    const wanted = spaceIds && spaceIds.length > 0 ? new Set(spaceIds) : undefined;
    const out: TaskClaim[] = [];
    for (const claim of this.byId.values()) {
      if (!wanted || wanted.has(claim.spaceId)) {
        out.push({ ...claim });
      }
    }
    return out;
  }
}
