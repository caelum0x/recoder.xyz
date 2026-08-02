/**
 * Conductor checkpoint service — snapshot / list / restore / branch a workspace's
 * git state. Pure ops over injected seams (getWorkspace, the checkpoint store,
 * host `git` via `execFileSafe`, the new-workspace create fn), mirroring the
 * review/publish ops: NO governance gate here — the composer runs
 * `guardConductorWrite(...)` BEFORE calling every mutating op, so a deny never
 * reaches the git execution below.
 *
 * The snapshot model is git-native and non-destructive:
 *  - CREATE captures the committed HEAD (`headSha`) and, when the worktree is
 *    dirty, a `git stash create` commit (`snapshotSha`) whose tree is the exact
 *    edited state — WITHOUT touching the working tree or the stash list — then
 *    tags `snapshotSha` as `recoder-checkpoint/<id>` (stable + listable).
 *  - RESTORE first takes an automatic safety snapshot of the CURRENT state (so a
 *    restore never silently loses work), resets the branch to `headSha`, then
 *    re-applies the captured edits (`git checkout <snapshotSha> -- .`) as working
 *    changes — reproducing the exact checkpoint state.
 *  - BRANCH creates a NEW workspace whose base ref is the checkpoint tag, so its
 *    fresh worktree starts from the snapshot tree.
 *
 * Truthful throughout: a missing workspace/worktree throws a "not found"/"no
 * worktree" the composer maps to a truthful failure; a git failure surfaces its
 * real message — nothing is faked.
 */
import { execFileSafe } from '@recoder/substrate';
import type { CreateWorkspaceInput } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type {
  CheckpointKind,
  CheckpointRecord,
  CheckpointStorePort,
} from '../ports/checkpoint-store.port.js';

/** The prefix every checkpoint tag is written under (git-refname safe). */
const CHECKPOINT_TAG_PREFIX = 'recoder-checkpoint';
/** The prefix the automatic pre-restore safety snapshot tag is written under. */
const PRE_RESTORE_TAG_PREFIX = 'recoder-checkpoint-pre-restore';

/** The injected seams a checkpoint op runs over (no module singletons, no env). */
export interface CheckpointOpsDeps {
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly store: CheckpointStorePort;
  readonly logger: Logger;
  /** Child-process seam for host git; defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
  /** Id generator (fresh checkpoint ids); defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  /** Clock seam (ISO timestamps); defaults to `new Date()`. */
  readonly now?: () => string;
}

/** Extra seams the BRANCH op needs: launch a new workspace from the snapshot. */
export interface BranchOpsDeps extends CheckpointOpsDeps {
  /** Create + launch a new workspace (the composer's engine.createWorkspace). */
  readonly createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>;
}

/** Fields a caller may set when taking a checkpoint. */
export interface CreateCheckpointInput {
  readonly label?: string;
  readonly description?: string;
  /** The actor taking the checkpoint (stamped from the principal by the composer). */
  readonly createdBy: string;
}

/** Optional overrides when branching a new workspace from a checkpoint. */
export interface BranchFromCheckpointInput {
  /** Branch name for the new worktree (default: derived from the checkpoint). */
  readonly branch?: string;
  /** Runtime for the new workspace (default: the checkpoint's runtime). */
  readonly runtimeId?: string;
  /** Task id for the new workspace (default: the source workspace's task). */
  readonly taskId?: string;
  /** Prompt to launch the branched agent with (optional). */
  readonly prompt?: string;
  /** The actor branching (stamped from the principal by the composer). */
  readonly createdBy: string;
}

/** The truthful result of a restore. */
export interface RestoreResultView {
  readonly workspaceId: string;
  readonly checkpointId: string;
  /** The commit sha the working tree was reproduced from. */
  readonly restoredTo: string;
  /**
   * The tag of the automatic safety snapshot taken BEFORE the restore, so the
   * pre-restore state is recoverable. Absent only when the safety snapshot could
   * not be written (surfaced in logs; the restore still proceeded truthfully).
   */
  readonly safetyRef?: string;
}

/** The truthful result of branching a new workspace from a checkpoint. */
export interface BranchResultView {
  readonly checkpointId: string;
  readonly sourceWorkspaceId: string;
  readonly workspace: Workspace;
}

function runGit(deps: CheckpointOpsDeps) {
  const exec = deps.exec ?? execFileSafe;
  return async (cwd: string, args: string[]): Promise<string> => {
    const { stdout } = await exec('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  };
}

async function requireWorktree(
  deps: CheckpointOpsDeps,
  workspaceId: string,
): Promise<Workspace & { worktreePath: string }> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  return workspace as Workspace & { worktreePath: string };
}

/**
 * CAPTURE a checkpoint of the workspace's current git state. Non-destructive: the
 * working tree and stash list are untouched. Returns the persisted record.
 */
export async function createCheckpoint(
  deps: CheckpointOpsDeps,
  workspaceId: string,
  input: CreateCheckpointInput,
): Promise<CheckpointRecord> {
  const workspace = await requireWorktree(deps, workspaceId);
  const git = runGit(deps);
  const cwd = workspace.worktreePath;
  const checkpointId = (deps.newId ?? defaultId)();
  const createdAt = (deps.now ?? defaultNow)();

  const headSha = await git(cwd, ['rev-parse', 'HEAD']);
  const status = await git(cwd, ['status', '--porcelain']);
  const dirty = status.length > 0;

  // A dirty worktree is captured by `git stash create`: it writes a commit object
  // (parented on HEAD) whose tree is the edited state, WITHOUT modifying the
  // worktree or pushing onto the stash list. It emits the sha, or nothing when
  // there is only untracked content it cannot capture — then the HEAD is the
  // truthful snapshot and `dirty` still records that edits were present.
  let snapshotSha = headSha;
  let kind: CheckpointKind = 'commit';
  if (dirty) {
    const stashSha = await git(cwd, ['stash', 'create', 'recoder checkpoint']);
    if (stashSha) {
      snapshotSha = stashSha;
      kind = 'stash';
    }
  }

  const ref = `${CHECKPOINT_TAG_PREFIX}/${checkpointId}`;
  const record: CheckpointRecord = {
    checkpointId,
    workspaceId,
    spaceId: workspace.spaceId,
    projectId: workspace.projectId,
    taskId: workspace.taskId,
    ...(input.label ? { label: input.label } : {}),
    ...(input.description ? { description: input.description } : {}),
    kind,
    ref,
    headSha,
    snapshotSha,
    dirty,
    branch: workspace.branch,
    baseRef: workspace.baseRef,
    repoPath: cwd,
    runtimeId: workspace.runtimeId,
    substrate: workspace.substrate,
    ...(workspace.runId ? { runId: workspace.runId } : {}),
    metadata: {
      state: workspace.state,
      changedFilesPresent: dirty,
    },
    createdBy: input.createdBy,
    createdAt,
  };
  // Anchor the snapshot under a stable ANNOTATED tag whose message is the record
  // JSON: the tag survives GC + is listable, and git itself becomes the durable
  // metadata store — a restarted backend rebuilds the list/restore surface from
  // `git tag` (see `createGitCheckpointStore`) even when the in-process cache is
  // gone. The record is secret-free by contract (see `CheckpointRecord.metadata`).
  await git(cwd, ['tag', '-a', '-m', JSON.stringify(record), ref, snapshotSha]);
  await deps.store.save(record);
  deps.logger.info(
    { workspaceId, checkpointId, ref, kind, dirty },
    'workspace checkpoint captured',
  );
  return record;
}

/** LIST a workspace's checkpoints (newest-first). Read-only, degrade-safe. */
export async function listCheckpoints(
  deps: Pick<CheckpointOpsDeps, 'store'>,
  workspaceId: string,
): Promise<readonly CheckpointRecord[]> {
  return deps.store.listForWorkspace(workspaceId);
}

async function loadCheckpointForWorkspace(
  deps: CheckpointOpsDeps,
  workspaceId: string,
  checkpointId: string,
): Promise<CheckpointRecord> {
  // A durable store may only rehydrate per-WORKSPACE (the git-tag rebuild needs a
  // repo to scan), so a get() miss falls back to the workspace-scoped list before
  // refusing — a restore right after a backend restart still finds its record.
  const record =
    (await deps.store.get(checkpointId)) ??
    (await deps.store.listForWorkspace(workspaceId)).find((r) => r.checkpointId === checkpointId) ??
    null;
  if (!record) throw new Error(`checkpoint not found: ${checkpointId}`);
  if (record.workspaceId !== workspaceId) {
    throw new Error(`checkpoint ${checkpointId} does not belong to workspace ${workspaceId}`);
  }
  return record;
}

/**
 * RESTORE the workspace's worktree to a checkpoint. Takes an automatic safety
 * snapshot FIRST (never silently loses current work), resets the branch to the
 * checkpoint's committed base, then re-applies the captured edits as working
 * changes — reproducing the exact checkpoint state.
 */
export async function restoreCheckpoint(
  deps: CheckpointOpsDeps,
  workspaceId: string,
  checkpointId: string,
): Promise<RestoreResultView> {
  const workspace = await requireWorktree(deps, workspaceId);
  const record = await loadCheckpointForWorkspace(deps, workspaceId, checkpointId);
  const git = runGit(deps);
  const cwd = workspace.worktreePath;

  // SAFETY FIRST: snapshot the current state under a pre-restore tag so nothing
  // is lost. Best-effort — a failure here is logged, never a reason to abort the
  // restore the operator asked for (the reason is surfaced by the missing ref).
  let safetyRef: string | undefined;
  try {
    const currentHead = await git(cwd, ['rev-parse', 'HEAD']);
    const currentStatus = await git(cwd, ['status', '--porcelain']);
    let safetySha = currentHead;
    if (currentStatus.length > 0) {
      const stashSha = await git(cwd, ['stash', 'create', 'recoder pre-restore safety']);
      if (stashSha) safetySha = stashSha;
    }
    const tag = `${PRE_RESTORE_TAG_PREFIX}/${(deps.newId ?? defaultId)()}`;
    await git(cwd, ['tag', tag, safetySha]);
    safetyRef = tag;
  } catch (err) {
    deps.logger.warn({ workspaceId, checkpointId, err }, 'pre-restore safety snapshot failed');
  }

  // Reset the branch to the checkpoint's committed base, then re-apply the
  // captured edits as working changes (no-op when the checkpoint was clean).
  await git(cwd, ['reset', '--hard', record.headSha]);
  if (record.snapshotSha !== record.headSha) {
    await git(cwd, ['checkout', record.snapshotSha, '--', '.']);
  }

  deps.logger.info(
    { workspaceId, checkpointId, restoredTo: record.snapshotSha, safetyRef },
    'workspace restored to checkpoint',
  );
  return {
    workspaceId,
    checkpointId,
    restoredTo: record.snapshotSha,
    ...(safetyRef ? { safetyRef } : {}),
  };
}

/**
 * BRANCH a NEW workspace from a checkpoint: launch a fresh workspace whose base
 * ref is the checkpoint tag, so its new worktree starts from the snapshot tree.
 * Delegates the actual create to the injected `createWorkspace` (the composer's
 * engine), which persists-before-launch and drives the substrate as usual.
 */
export async function branchFromCheckpoint(
  deps: BranchOpsDeps,
  workspaceId: string,
  checkpointId: string,
  input: BranchFromCheckpointInput,
): Promise<BranchResultView> {
  const record = await loadCheckpointForWorkspace(deps, workspaceId, checkpointId);
  const shortId = checkpointId.slice(0, 8);
  const createInput: CreateWorkspaceInput = {
    spaceId: record.spaceId,
    projectId: record.projectId,
    taskId: input.taskId ?? record.taskId,
    repoPath: record.repoPath,
    runtimeId: input.runtimeId ?? record.runtimeId,
    // Start the new worktree from the checkpoint tag (its tree = the snapshot).
    baseRef: record.ref,
    ...(input.branch ? { branch: input.branch } : { branch: `checkpoint-${shortId}` }),
    ...(input.prompt ? { prompt: input.prompt } : {}),
    createdBy: input.createdBy,
    metadata: { branchedFromCheckpoint: checkpointId, sourceWorkspaceId: workspaceId },
  };
  const workspace = await deps.createWorkspace(createInput);
  deps.logger.info(
    { sourceWorkspaceId: workspaceId, checkpointId, newWorkspaceId: workspace.workspaceId },
    'branched new workspace from checkpoint',
  );
  return { checkpointId, sourceWorkspaceId: workspaceId, workspace };
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}
