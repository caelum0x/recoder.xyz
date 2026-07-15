/**
 * `WorkLockRepository` — the persistence contract for path/work locks
 * (`governance_work_locks`). Backs conflict prevention before writes: at most
 * one active exclusive lock per resource path (enforced by a partial unique
 * index on `(resource_path) where released_at is null and mode = 'exclusive'`).
 *
 * Declared here; the concrete pg impl lives in
 * `repositories/approval-worklock.repository.ts`. Consumed by conductor /
 * agent-os via the `WorkLockService` (governance owns the table).
 */
import type { WorkLock } from '../types.js';

/** Fields to acquire a work lock. */
export interface WorkLockAcquireInput {
  readonly resourcePath: string;
  readonly holderAgentId: string;
  readonly taskId?: string | null;
  readonly mode?: 'exclusive' | 'shared';
  /** ISO-8601 expiry; a lock past this is stale and may be reacquired. */
  readonly expiresAt: string;
}

/** Result of an acquire attempt (never throws on a conflict). */
export interface WorkLockAcquireResult {
  readonly acquired: boolean;
  /** The held lock on success, or the CONFLICTING active lock on failure. */
  readonly lock: WorkLock | null;
  /** Populated when `acquired === false`. */
  readonly conflictReason?: string;
}

export interface WorkLockRepository {
  /**
   * Attempt to acquire a lock. Deny-biased: an exclusive-lock conflict returns
   * `{ acquired: false, lock: <conflicting> }` rather than throwing. Expired
   * locks (past `expires_at`) do not block a fresh acquire.
   */
  acquire(input: WorkLockAcquireInput): Promise<WorkLockAcquireResult>;

  /** Release a held lock by id (sets `released_at`). Returns `true` when released. */
  release(id: string, holderAgentId: string): Promise<boolean>;

  /** The active (unreleased, unexpired) lock covering a path, or `null`. */
  activeLockFor(resourcePath: string): Promise<WorkLock | null>;

  /** List active locks, optionally scoped to a holder or task. */
  listActive(query?: { holderAgentId?: string; taskId?: string }): Promise<readonly WorkLock[]>;
}
