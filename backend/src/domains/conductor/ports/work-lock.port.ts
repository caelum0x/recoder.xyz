/**
 * WorkLockPort — the collision-prevention write-lock seam.
 *
 * REUSE: re-exports the `@recoder/substrate` port verbatim so the conductor
 * `conductor-locks` adapter (over `@recoder/coordination`) and the engine name
 * ONE contract. Two parallel workspaces must never hold overlapping write scope
 * in the same (space, repo) at once: the engine acquires an exclusive lock over a
 * workspace's declared write surface BEFORE launch, releases it on launch
 * failure, and the reconciler re-acquires it for a surviving live workspace after
 * a backend restart.
 *
 * DEGRADE-SAFE by contract: when the lock engine is unavailable the adapter
 * returns `skipped` (never a fake `acquired`) — the engine launches without a
 * lock rather than crashing, and never mistakes "not locked" for "locked".
 */
export type {
  WorkLockPort,
  AcquireWorkLockInput,
  AcquireWorkLockResult,
  ReacquireWorkLockResult,
  LockConflictInfo,
} from '@recoder/substrate';
