/**
 * LockService — the pure work-lock engine.
 *
 * MERGED from `WorkLockService`
 * (packages/agent-os/src/services/work-lock-service.ts). Preserved behavior:
 *  - `listActive(locks, now)` — filter by `expiresAt`.
 *  - `acquire(input)` — compute the active set, `findConflicts`, throw
 *    `LockConflictError` (was `WorkLockConflictError`) carrying the conflicts,
 *    else return `{ lock, locks }` (immutable: a new array).
 *  - `release` — remove the lock (owner/task scoped).
 *  - `findCoveringLock` / `hasCoveringLock` / `findConflicts`.
 *
 * PURE: all IO (id generation, fence-token issuance, persistence, the clock) is
 * injected by the caller. `acquire` takes the pre-issued `lockId`,
 * `fenceToken`, and `now`; it never reaches for `Date.now()` or a random id.
 * This is what lets the whole module be unit-tested without a DB or a clock and
 * keeps it composable behind the engine's effect-runner.
 *
 * EXTENDED beyond the original with shared/exclusive `kind`, fence tokens, and
 * renewal (`renew`), per design §4.2.
 */

import type { LockConflict, WorkLock } from '../domain';
import { LockConflictError } from '../errors';
import { findConflicts, type ConflictQuery } from './lock-conflict-detector';
import { findCoveringLock, hasCoveringLock, type CoverageQuery } from './lock-coverage';
import { assertFenceToken } from './lock-fencing';
import { activeLocks, computeExpiry, isLockActive } from './lock-ttl';

/** Pre-resolved acquire input: the impure bits (id, token, now) are injected. */
export type AcquireInput = {
  /** The existing locks for the scope (active + expired); defaults to none. */
  existingLocks?: readonly WorkLock[];
  /** Pre-issued lock id (from `IdGeneratorPort`). */
  lockId: string;
  /** Pre-issued monotonic fence token (from `LeaseFencerPort`). */
  fenceToken: number;
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  /** Defaults to `exclusive` (original behavior). */
  kind?: WorkLock['kind'];
  /** ISO `now` (from `ClockPort`). */
  now: string;
  ttlMs?: number;
};

export type AcquireResult = {
  lock: WorkLock;
  /** The new active lock set (immutable copy: prior active + the new lock). */
  locks: WorkLock[];
};

export type ReleaseInput = {
  lockId: string;
  ownerAgentId?: string;
  taskId?: string;
  /** When provided, a stale token must not release the lock. */
  fenceToken?: number;
};

export type RenewInput = {
  lockId: string;
  ownerAgentId: string;
  taskId: string;
  fenceToken: number;
  now: string;
  ttlMs?: number;
};

export type RenewResult = {
  lock: WorkLock;
  locks: WorkLock[];
};

/**
 * Stateless service: every method is a pure transform over the passed-in lock
 * set. (A class is kept to mirror the original `WorkLockService` shape and the
 * design's `export { LockService }` surface, but it holds no fields.)
 */
export class LockService {
  /** Active locks at `now`. MERGED from `listActive`. */
  listActive(locks: readonly WorkLock[], now: string): WorkLock[] {
    return activeLocks(locks, now);
  }

  /** Conflicts for a candidate acquire against the active set. */
  findConflicts(activeSet: readonly WorkLock[], query: ConflictQuery): LockConflict[] {
    return findConflicts(activeSet, query);
  }

  findCoveringLock(locks: readonly WorkLock[], query: CoverageQuery): WorkLock | undefined {
    return findCoveringLock(locks, query);
  }

  hasCoveringLock(locks: readonly WorkLock[], query: CoverageQuery): boolean {
    return hasCoveringLock(locks, query);
  }

  /**
   * Acquire a lock. Computes the active set, checks for conflicts, and throws
   * `LockConflictError` (carrying typed conflicts) when blocked; otherwise
   * returns the new lock + new active lock set. Immutable: never mutates input.
   */
  acquire(input: AcquireInput): AcquireResult {
    const active = this.listActive(input.existingLocks ?? [], input.now);
    const kind = input.kind ?? 'exclusive';

    const conflicts = this.findConflicts(active, {
      spaceId: input.spaceId,
      repo: input.repo,
      pathGlob: input.pathGlob,
      ownerAgentId: input.ownerAgentId,
      taskId: input.taskId,
      kind,
    });

    if (conflicts.length > 0) {
      throw new LockConflictError(conflicts.map((conflict) => conflict.existing));
    }

    const lock: WorkLock = {
      lockId: input.lockId,
      spaceId: input.spaceId,
      repo: input.repo,
      pathGlob: input.pathGlob,
      ownerAgentId: input.ownerAgentId,
      taskId: input.taskId,
      acquiredAt: input.now,
      expiresAt: computeExpiry(input.now, input.ttlMs),
      fenceToken: input.fenceToken,
      kind,
    };

    return { lock, locks: [...active, lock] };
  }

  /**
   * Release a lock by id (optionally owner/task scoped). When a `fenceToken` is
   * supplied it must be current for the matched lock, else
   * `FenceTokenViolationError` is thrown (a stale writer cannot release a
   * lock another agent now holds). MERGED from `release`, fence-hardened.
   */
  release(locks: readonly WorkLock[], input: ReleaseInput): WorkLock[] {
    return locks.filter((lock) => {
      if (lock.lockId !== input.lockId) {
        return true;
      }
      if (input.ownerAgentId && lock.ownerAgentId !== input.ownerAgentId) {
        return true;
      }
      if (input.taskId && lock.taskId !== input.taskId) {
        return true;
      }
      if (input.fenceToken !== undefined) {
        assertFenceToken(lock, input.fenceToken);
      }
      return false;
    });
  }

  /**
   * Renew an active lock's lease. The renewer must own the lock and present a
   * current fence token. Returns the renewed lock (new `expiresAt`, fence token
   * unchanged) and the new lock set. Throws `LockConflictError` with no
   * conflicts when the lock is missing or already expired (renewal of a dead
   * lock is a re-acquire, not a renew).
   */
  renew(locks: readonly WorkLock[], input: RenewInput): RenewResult {
    const target = locks.find((lock) => lock.lockId === input.lockId);

    if (
      !target ||
      !isLockActive(target, input.now) ||
      target.ownerAgentId !== input.ownerAgentId ||
      target.taskId !== input.taskId
    ) {
      throw new LockConflictError([]);
    }

    assertFenceToken(target, input.fenceToken);

    const renewed: WorkLock = {
      ...target,
      acquiredAt: input.now,
      expiresAt: computeExpiry(input.now, input.ttlMs),
    };

    return {
      lock: renewed,
      locks: locks.map((lock) => (lock.lockId === renewed.lockId ? renewed : lock)),
    };
  }
}
