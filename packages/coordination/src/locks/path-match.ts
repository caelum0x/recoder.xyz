/**
 * Path matching for locks.
 *
 * MERGED from `lockCoversPath` (packages/agent-os/src/domain/work-lock.ts) and
 * the `pathMatchesRule` logic that the routing service duplicated. The actual
 * matchers live in `util/glob.ts` (single owner); this file binds them to the
 * `WorkLock` shape and provides the "does this lock cover this path?" predicate
 * the coverage code needs.
 */

import type { WorkLock } from '../domain';
import { globMatchesPath } from '../util/glob';

export { lockCoversPath } from '../domain';
export { pathMatchesRule } from '../util/glob';

/** Same space + same repo identity (treats undefined repo as ''). */
export function sameScope(
  left: Pick<WorkLock, 'spaceId' | 'repo'>,
  right: { spaceId: string; repo?: string },
): boolean {
  return left.spaceId === right.spaceId && (left.repo ?? '') === (right.repo ?? '');
}

/** True if `lock`'s glob would match `path` (ignores ownership and TTL). */
export function lockMatchesPath(lock: WorkLock, path: string): boolean {
  return globMatchesPath(lock.pathGlob, path);
}
