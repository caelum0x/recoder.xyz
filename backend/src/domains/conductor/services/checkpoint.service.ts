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
 *    dirty, a commit (`snapshotSha`) whose tree is the exact edited state —
 *    including UNTRACKED files — built through a THROWAWAY temp index
 *    (`GIT_INDEX_FILE=<tmp> git add -A` → `git write-tree` → `git commit-tree`)
 *    so the user's real index, working tree, and stash list are never touched;
 *    then tags `snapshotSha` as `recoder-checkpoint/<id>` (stable + listable).
 *    (`git stash create` is deliberately NOT used: it silently drops untracked
 *    work — recoder-itjb.)
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
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
/**
 * Identity pinned onto the snapshot's `commit-tree` so capture succeeds even in a
 * worktree with no configured git `user.name`/`user.email`. It never touches the
 * user's config — it is passed only as env to the one `commit-tree` invocation.
 */
const CHECKPOINT_COMMIT_IDENTITY: Readonly<Record<string, string>> = {
  GIT_AUTHOR_NAME: 'Recoder Checkpoint',
  GIT_AUTHOR_EMAIL: 'checkpoint@recoder.local',
  GIT_COMMITTER_NAME: 'Recoder Checkpoint',
  GIT_COMMITTER_EMAIL: 'checkpoint@recoder.local',
};

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
  // The optional `env` overlay is how capture points git at a THROWAWAY index
  // (`GIT_INDEX_FILE`) and pins a commit identity — without ever mutating the
  // user's real index, worktree, stash, or git config. It is an OVERLAY (extra
  // vars only); `execFileSafe` merges it onto `process.env` per the ExecOptions
  // contract.
  return async (cwd: string, args: string[], env?: Record<string, string>): Promise<string> => {
    const { stdout } = await exec('git', ['-C', cwd, ...args], {
      maxBuffer: 16 * 1024 * 1024,
      ...(env ? { env } : {}),
    });
    return stdout.trim();
  };
}

/**
 * Capture the worktree's CURRENT full state (tracked edits AND untracked files)
 * as a real commit whose tree is that state, WITHOUT touching the user's real
 * index/worktree/stash. Uses a throwaway `GIT_INDEX_FILE` outside the worktree:
 * `git add -A` stages everything into it, `git write-tree` freezes the tree, and
 * `git commit-tree` (parented on `headSha`) wraps it in a GC-safe, branch-able
 * commit — the drop-in replacement for `git stash create`, which cannot include
 * untracked work (recoder-itjb). Returns the snapshot commit sha.
 */
async function captureWorktreeSnapshot(
  git: (cwd: string, args: string[], env?: Record<string, string>) => Promise<string>,
  cwd: string,
  headSha: string,
  id: string,
): Promise<string> {
  // The temp index lives OUTSIDE the worktree so its `.lock` sibling is never
  // itself swept up by `git add -A` into the snapshot tree.
  const tmpIndex = join(tmpdir(), `recoder-checkpoint-${id}.index`);
  const indexEnv = { GIT_INDEX_FILE: tmpIndex };
  try {
    await git(cwd, ['add', '-A'], indexEnv);
    const treeSha = await git(cwd, ['write-tree'], indexEnv);
    return await git(
      cwd,
      ['commit-tree', treeSha, '-p', headSha, '-m', 'recoder checkpoint'],
      { ...indexEnv, ...CHECKPOINT_COMMIT_IDENTITY },
    );
  } finally {
    await rm(tmpIndex, { force: true }).catch(() => {});
  }
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

  // A dirty worktree is captured into a commit whose tree is the exact edited
  // state — INCLUDING untracked files — via a throwaway temp index, WITHOUT
  // modifying the real worktree, index, or stash list. (`git stash create` is
  // not used: it silently drops untracked work — recoder-itjb.)
  let snapshotSha = headSha;
  let kind: CheckpointKind = 'commit';
  if (dirty) {
    snapshotSha = await captureWorktreeSnapshot(git, cwd, headSha, checkpointId);
    kind = 'tree';
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
      // Same temp-index capture as CREATE, so the pre-restore safety snapshot
      // also preserves UNTRACKED work (a stash-create snapshot would drop it).
      safetySha = await captureWorktreeSnapshot(
        git,
        cwd,
        currentHead,
        (deps.newId ?? defaultId)(),
      );
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
    // `checkout <sha> -- .` re-applies the snapshot's tracked files but does NOT
    // remove files that existed at headSha and were DELETED in the snapshot — so
    // restore would leave stale files the checkpoint had removed. Reproduce those
    // deletions explicitly so the restored tree matches the snapshot. (recoder-36lk)
    const deletedOut = await git(cwd, [
      'diff', '--name-only', '--diff-filter=D', record.headSha, record.snapshotSha,
    ]);
    const deletedPaths = deletedOut.split('\n').map((p) => p.trim()).filter(Boolean);
    if (deletedPaths.length > 0) {
      await git(cwd, ['rm', '--force', '--', ...deletedPaths]);
    }
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
