/**
 * WorkLockPort — the collision-prevention write-lock seam (design §4.8 / §7).
 *
 * Two parallel workspaces must never hold overlapping write scope in the same
 * (space, repo) at once. The engine acquires an exclusive lock over a
 * workspace's declared write surface BEFORE launching the agent and releases it
 * on launch failure; reconcile re-acquires it for a live workspace after a
 * backend restart (the in-memory lock store is empty on restart).
 *
 * The backend injects the `@recoder/coordination`-backed `conductor-locks`
 * adapter; the result/input shapes mirror it 1:1 so the proven acquire→launch→
 * release ordering is preserved. DEGRADE-SAFE by contract: when the lock engine
 * is unavailable the adapter returns `skipped` (never a fake `acquired`), so the
 * engine launches without a lock rather than crashing — and never mistakes
 * "not locked" for "locked". Interface only.
 */

/** Identity of an active conflicting lock, surfaced truthfully to the caller. */
export interface LockConflictInfo {
  lockId: string;
  /** The workspace holding the conflicting lock. */
  ownerAgentId: string;
  /** The task the conflicting lock belongs to. */
  taskId: string;
  /** The path glob the conflicting lock covers. */
  pathGlob: string;
}

export interface AcquireWorkLockInput {
  /** The acquiring workspace — used as the lock owner so it never self-conflicts. */
  workspaceId: string;
  spaceId: string;
  taskId: string;
  /** Repo the worktree branches from; scopes the lock (only same-repo locks contend). */
  repo: string;
  /** Declared write surface; defaults to a repo-wide lock when absent. */
  targetPaths?: readonly string[];
}

export type AcquireWorkLockResult =
  | { status: 'acquired'; lockIds: string[] }
  | { status: 'conflict'; conflicts: LockConflictInfo[] }
  | { status: 'skipped'; reason: string };

export type ReacquireWorkLockResult =
  | { status: 'acquired'; lockIds: string[]; alreadyHeld: string[] }
  | { status: 'conflict'; conflicts: LockConflictInfo[] }
  | { status: 'skipped'; reason: string };

export interface ReleaseWorkLockInput {
  workspaceId: string;
  spaceId: string;
  taskId: string;
  /** When omitted, releases this workspace's locks across every repo in the space. */
  repo?: string;
}

export interface WorkLockPort {
  /** Acquire an exclusive write-lock over the workspace's scope BEFORE launch. */
  acquire(input: AcquireWorkLockInput): Promise<AcquireWorkLockResult>;
  /** Re-acquire a live workspace's lock during reconcile (self-safe, idempotent). */
  reacquire(input: AcquireWorkLockInput): Promise<ReacquireWorkLockResult>;
  /** Release every lock held by a workspace (launch failure / teardown). */
  release(input: ReleaseWorkLockInput): Promise<{ released: string[] }>;
}
