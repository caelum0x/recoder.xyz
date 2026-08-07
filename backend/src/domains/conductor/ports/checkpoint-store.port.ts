/**
 * CheckpointStorePort — the conductor's checkpoint metadata persistence seam.
 *
 * A CHECKPOINT is a named, restorable snapshot of one workspace's git state (a
 * tag anchored at the committed HEAD plus any captured uncommitted work) bundled
 * with the run context/metadata it was taken under. The GIT object lives in the
 * workspace's repo (a real tag/commit — the source of truth for the file state);
 * this port persists only the METADATA the control plane needs to LIST, RESTORE,
 * and BRANCH from a checkpoint.
 *
 * Ownership + degrade posture mirror the rest of the conductor persistence: the
 * default adapter (`adapters/checkpoint-store.adapter.ts`) is a bounded in-process
 * store, degrade-truthful by construction — it never claims a durability it does
 * not have. A durable executor-backed adapter can be injected later WITHOUT any
 * call-site change (dependency inversion). Interface only.
 */

/** How a checkpoint's file state was captured into the git object graph. */
export type CheckpointKind =
  /** Clean worktree — the snapshot tag points straight at the committed HEAD. */
  | 'commit'
  /**
   * Dirty worktree — a non-mutating temp-index snapshot (`git add -A` →
   * `write-tree` → `commit-tree`) captured the edits, INCLUDING untracked files.
   */
  | 'tree'
  /**
   * Legacy dirty snapshot captured via `git stash create` (dropped untracked
   * work). No longer produced — retained so old persisted records still decode.
   */
  | 'stash';

/**
 * A persisted checkpoint record: the durable METADATA describing one snapshot.
 * The restorable file state lives in git under `ref`/`commitSha`; this record is
 * how the control plane lists, restores, and branches from it.
 */
export interface CheckpointRecord {
  readonly checkpointId: string;
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly projectId: string;
  readonly taskId: string;
  /** Optional human label (e.g. "before refactor"). */
  readonly label?: string;
  /** Optional longer description of what the checkpoint captures. */
  readonly description?: string;
  /** How the file state was captured (clean commit vs stash-create snapshot). */
  readonly kind: CheckpointKind;
  /** The git ref the snapshot is anchored under (a tag; stable + human-listable). */
  readonly ref: string;
  /**
   * The committed HEAD sha at capture time — the base the checkpoint sits on. A
   * restore resets the branch here, then re-applies any captured dirty edits.
   */
  readonly headSha: string;
  /**
   * The snapshot commit sha whose TREE is the exact captured file state: equal to
   * `headSha` for a clean checkpoint, or a temp-index snapshot commit (tracked
   * edits AND untracked files) for a dirty one. Branching a new workspace uses
   * this as the base.
   */
  readonly snapshotSha: string;
  /** True when the worktree had uncommitted changes folded into the snapshot. */
  readonly dirty: boolean;
  /** The workspace branch the checkpoint was taken on. */
  readonly branch: string;
  /** The workspace base ref at capture time (context only). */
  readonly baseRef: string;
  /** Absolute repo path the snapshot was taken in (branch source for new workspaces). */
  readonly repoPath: string;
  /** The runtime driving the run at capture time (context for a branched workspace). */
  readonly runtimeId: string;
  /** The substrate the source workspace ran on (context only). */
  readonly substrate: string;
  /** The active run id at capture time, when there was one. */
  readonly runId?: string;
  /** Free-form run context/metadata captured with the snapshot (no secrets). */
  readonly metadata: Record<string, unknown>;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** The metadata store the checkpoint capability persists records through. */
export interface CheckpointStorePort {
  /** Insert-or-replace a checkpoint record; returns the stored row. */
  save(record: CheckpointRecord): Promise<CheckpointRecord>;
  /** Read one checkpoint by id, or `null` when it was never persisted. */
  get(checkpointId: string): Promise<CheckpointRecord | null>;
  /** List a workspace's checkpoints, newest-first, for the review/branch surfaces. */
  listForWorkspace(workspaceId: string): Promise<readonly CheckpointRecord[]>;
  /**
   * Truthful durability flag: `true` only when records survive a restart. The
   * default in-process adapter returns `false` so health/UX never overstate it.
   */
  isDurable(): boolean;
}
