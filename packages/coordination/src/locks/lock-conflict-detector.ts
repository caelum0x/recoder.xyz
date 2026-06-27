/**
 * Conflict detection — the pure heart of work-locks.
 *
 * MERGED from `WorkLockService.findConflicts`
 * (packages/agent-os/src/services/work-lock-service.ts). Preserved rules:
 *  - only locks in the same (space, repo) scope can conflict;
 *  - a lock owned by the same (agent, task) as the requester never conflicts
 *    with the requester (you don't collide with yourself);
 *  - otherwise, the globs must overlap.
 *
 * EXTENDED for the foundation's shared/exclusive `kind`: two `shared` locks
 * never conflict even when their globs overlap (read-only agents co-locate);
 * any `exclusive` participant restores the original overlap-conflicts rule.
 *
 * The returned value is a typed `LockConflict[]` carrying the offending lock +
 * the reason, so the caller/UI can show exactly who holds the path (this is the
 * evidence `LockConflictError.conflicts` is built from).
 */

import type { LockConflict, WorkLock } from '../domain';
import { sameScope } from './path-match';
import { globsContend } from './glob-overlap';

/** The minimal shape a conflict check needs about the requester. */
export type ConflictQuery = {
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  /** Defaults to `exclusive` — the original behavior. */
  kind?: WorkLock['kind'];
};

/** True if `lock` is owned by the same (agent, task) as the requester. */
function isSameOwner(lock: WorkLock, query: ConflictQuery): boolean {
  return lock.ownerAgentId === query.ownerAgentId && lock.taskId === query.taskId;
}

/** Classify why a contending lock conflicts (for the typed evidence). */
function classify(existing: WorkLock, requestKind: WorkLock['kind']): LockConflict['kind'] {
  if (existing.kind === 'exclusive' || requestKind === 'exclusive') {
    return 'exclusive';
  }
  return 'overlap';
}

/**
 * Find every active lock that conflicts with the requested acquire.
 *
 * Callers MUST pass only active locks (use `activeLocks(...)` from `lock-ttl`);
 * an expired lock cannot conflict. This mirrors the original where
 * `findConflicts` ran over `listActive(...)`.
 */
export function findConflicts(
  activeLocks: readonly WorkLock[],
  query: ConflictQuery,
): LockConflict[] {
  const requestKind = query.kind ?? 'exclusive';
  const conflicts: LockConflict[] = [];

  for (const lock of activeLocks) {
    if (!sameScope(lock, query)) {
      continue;
    }
    if (isSameOwner(lock, query)) {
      continue;
    }
    if (!globsContend(lock.pathGlob, lock.kind, query.pathGlob, requestKind)) {
      continue;
    }

    const kind = classify(lock, requestKind);
    conflicts.push({
      kind,
      existing: lock,
      requestedPathGlob: query.pathGlob,
      reason:
        kind === 'exclusive'
          ? `Exclusive lock ${lock.lockId} held by agent ${lock.ownerAgentId} (task ${lock.taskId}) covers an overlapping path.`
          : `Lock ${lock.lockId} held by agent ${lock.ownerAgentId} (task ${lock.taskId}) overlaps the requested path.`,
    });
  }

  return conflicts;
}

/** True if the requested acquire has at least one conflict. */
export function hasConflict(activeLocks: readonly WorkLock[], query: ConflictQuery): boolean {
  return findConflicts(activeLocks, query).length > 0;
}
