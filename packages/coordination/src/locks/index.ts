/**
 * locks/ barrel — work-locks module (fuses agent-os `WorkLockService`).
 *
 * Pure decision core (`LockService`, conflict/coverage/ttl/fencing/reaper) +
 * the impure shell (`LockManager`). The engine imports from here; consumers
 * import `LockService` via the package root.
 */

export { LockService } from './lock-service';
export type {
  AcquireInput,
  AcquireResult,
  ReleaseInput,
  RenewInput,
  RenewResult,
} from './lock-service';

export { LockManager } from './lock-manager';
export type { LockManagerPorts } from './lock-manager';

export { findConflicts, hasConflict } from './lock-conflict-detector';
export type { ConflictQuery } from './lock-conflict-detector';

export { findCoveringLock, hasCoveringLock } from './lock-coverage';
export type { CoverageQuery } from './lock-coverage';

export {
  fenceScopeKey,
  lockFenceScopeKey,
  isFenceTokenCurrent,
  isFenceTokenStale,
  assertFenceToken,
  highestFenceToken,
} from './lock-fencing';

export {
  computeExpiry,
  isLockActive,
  isLockExpired,
  lockRemainingMs,
  isRenewable,
  activeLocks,
  expiredLocks,
} from './lock-ttl';

export { locksContend, globsContend, globsOverlap, globRoot, rootContains } from './glob-overlap';
export { lockCoversPath, pathMatchesRule, sameScope, lockMatchesPath } from './path-match';

export {
  lockEventDedupKey,
  lockAcquiredEvent,
  lockReleasedEvent,
  lockExpiredEvent,
  acquireEffects,
  releaseEffects,
} from './lock-events';
export type { LockEventInput } from './lock-events';

export { reapExpiredLocks } from './lock-reaper';
export type { ReapInput, ReapResult } from './lock-reaper';
