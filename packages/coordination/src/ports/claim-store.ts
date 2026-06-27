/**
 * ClaimStorePort — atomic task-claim store. `compareAndSet` is the heart of
 * exactly-once dispatch: under concurrent claims at most one wins (Postgres uses
 * `SELECT ... FOR UPDATE SKIP LOCKED`; memory uses a Map CAS). The recovery
 * window (multica `claimResponseRecoveryWindow`) is enforced here so an
 * in-flight start is not reclaimed.
 */

import type { TaskClaim } from '../domain';

export interface ClaimStorePort {
  /** Current live claim for a task, if any. */
  getByTask(taskId: string): Promise<TaskClaim | undefined>;
  /**
   * Atomically take a claim. Returns the committed claim on success, or
   * undefined if another agent already holds a live (or recovery-window-protected)
   * claim. Never double-commits.
   */
  compareAndSet(claim: TaskClaim): Promise<TaskClaim | undefined>;
  /** Renew a claim's lease if the caller still holds it (fence-checked). */
  renew(claimId: string, fenceToken: number, leaseUntil: string): Promise<TaskClaim | undefined>;
  /** Release a claim the caller holds. */
  release(claimId: string): Promise<void>;
}
