/**
 * Glob overlap for the locks module.
 *
 * MERGED from the private `globsOverlap`/`normalizeGlob`/`globRoot`/
 * `rootContains` helpers in
 * `packages/agent-os/src/services/work-lock-service.ts`. The actual overlap
 * logic was extracted, hardened, and centralized in `util/glob.ts` (single
 * owner so `dispatch/space-policy-filter` reuses the same matching). This file
 * re-exports those owners under the names the design's fusion map cites for
 * `locks/glob-overlap.ts`, plus the kind-aware overlap predicate that decides
 * whether two locks actually conflict.
 */

import type { WorkLock } from '../domain';
import { locksAreCompatible } from '../domain';
import { globsOverlap, globRoot, rootContains } from '../util/glob';

export { globsOverlap, globRoot, rootContains } from '../util/glob';

/**
 * True if two locks contend for the same path scope AND their kinds conflict.
 *
 * Path scope is decided by `globsOverlap` (do the globs cover an overlapping
 * path?). Kind conflict is decided by `locksAreCompatible` (two `shared` locks
 * never conflict; any `exclusive` participant makes them conflict). This is the
 * fusion of the original glob-overlap check with the new shared/exclusive
 * discriminator the foundation added to `WorkLock`.
 */
export function locksContend(left: WorkLock, right: WorkLock): boolean {
  if (locksAreCompatible(left, right)) {
    return false;
  }
  return globsOverlap(left.pathGlob, right.pathGlob);
}

/**
 * True if two candidate globs of the given kinds would contend. Used at acquire
 * time before a `WorkLock` row exists for the requester.
 */
export function globsContend(
  leftGlob: string,
  leftKind: WorkLock['kind'],
  rightGlob: string,
  rightKind: WorkLock['kind'],
): boolean {
  if (leftKind === 'shared' && rightKind === 'shared') {
    return false;
  }
  return globsOverlap(leftGlob, rightGlob);
}
