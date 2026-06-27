/**
 * Coverage — "am I allowed to write path X?".
 *
 * MERGED from `WorkLockService.findCoveringLock` / `hasCoveringLock`
 * (packages/agent-os/src/services/work-lock-service.ts). A lock *covers* a write
 * when it is active, in the same (space, repo) scope, owned by the same
 * (agent, task), and its glob matches the path. EXTENDED with an optional fence
 * check: a covering lock only authorizes a write when the writer presents a
 * current fence token (closes the stale-writer race at the coverage gate too).
 */

import type { WorkLock } from '../domain';
import { isFenceTokenCurrent } from './lock-fencing';
import { lockMatchesPath, sameScope } from './path-match';
import { activeLocks } from './lock-ttl';

export type CoverageQuery = {
  spaceId: string;
  repo?: string;
  path: string;
  ownerAgentId: string;
  taskId: string;
  now: string;
  /** When provided, a covering lock must also have a current fence token. */
  fenceToken?: number;
};

function authorizes(lock: WorkLock, query: CoverageQuery): boolean {
  if (!sameScope(lock, query)) {
    return false;
  }
  if (lock.ownerAgentId !== query.ownerAgentId || lock.taskId !== query.taskId) {
    return false;
  }
  if (!lockMatchesPath(lock, query.path)) {
    return false;
  }
  if (query.fenceToken !== undefined && !isFenceTokenCurrent(lock, query.fenceToken)) {
    return false;
  }
  return true;
}

/**
 * The active lock (if any) that authorizes the requester to write `path`.
 * MERGED from `findCoveringLock`, made fence-aware and TTL-explicit.
 */
export function findCoveringLock(
  locks: readonly WorkLock[],
  query: CoverageQuery,
): WorkLock | undefined {
  return activeLocks(locks, query.now).find((lock) => authorizes(lock, query));
}

/** True if some active lock authorizes the requester to write `path`. */
export function hasCoveringLock(locks: readonly WorkLock[], query: CoverageQuery): boolean {
  return findCoveringLock(locks, query) !== undefined;
}
