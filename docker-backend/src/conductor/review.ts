/**
 * Conductor review path — turn a workspace's work into a reviewable diff, and
 * archive the workspace when done.
 *
 * Host-side git on the workspace's isolated worktree (the Conductor model), as
 * opposed to the container-based a2a/worktree-manager.service. PR creation and
 * merge are outward-facing, approval-gated actions and live in review-publish.ts.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (review → merge → archive).
 */
import type { Workspace } from '@recoder/agent-os';
import { createLogger } from '../logger';

// The reviewable-diff parsing (`git diff --stat`/`-p` + porcelain untracked →
// SubstrateDiff) is now OWNED by @recoder/substrate (substrate.md §4.8 / §12
// step 4). Both substrate impls produce their SubstrateDiff through it; re-export
// the pure builders here so backend callers reach the single source of truth.
export {
  buildSubstrateDiff,
  parseUntracked,
  countChangedFiles,
} from '@recoder/substrate';
export type { RawGitDiffOutput } from '@recoder/substrate';
import { advanceWorkspace, getWorkspace } from './workspace-service.js';
import { getSubstrate } from './substrate.js';
import { stopRunTail } from './run-tailer.js';
import { releaseWorkspaceLock } from './conductor-locks.js';

const logger = createLogger('conductor:review');

export interface WorkspaceDiff {
  workspaceId: string;
  baseRef: string;
  branch: string;
  /** `git diff --stat` summary against the base. */
  stat: string;
  /** Full unified patch of tracked changes against the base. */
  patch: string;
  /** Untracked files in the worktree (not yet in the patch). */
  untracked: string[];
  changedFiles: number;
}

async function requireWorktree(workspaceId: string): Promise<Workspace & { worktreePath: string }> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  return workspace as Workspace & { worktreePath: string };
}

/**
 * Compute the reviewable diff of the workspace's worktree against its base ref,
 * and move the workspace to `awaiting_review` (when it is currently running).
 */
export async function workspaceDiff(workspaceId: string): Promise<WorkspaceDiff> {
  const workspace = await requireWorktree(workspaceId);
  const base = workspace.baseRef || 'HEAD';

  const result = await getSubstrate(workspace.substrate).diff(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    base,
  );

  if (workspace.state === 'running') {
    await advanceWorkspace(workspaceId, 'awaiting_review', undefined, { changedFiles: result.changedFiles });
  }

  return {
    workspaceId,
    baseRef: base,
    branch: workspace.branch,
    stat: result.stat,
    patch: result.patch,
    untracked: result.untracked,
    changedFiles: result.changedFiles,
  };
}

/**
 * Archive a finished workspace: stop its session, remove its worktree, and move
 * the record to `archived`. Idempotent-ish; safe to call after merge or failure.
 */
export async function archiveWorkspace(workspaceId: string): Promise<Workspace> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (workspace.state === 'archived') return workspace;

  stopRunTail(workspaceId);

  // Release the workspace's write-lock so its repo scope is freed for the next
  // workspace. Owner/task scoped; degrade-safe (no-op when locking is disabled).
  try {
    await releaseWorkspaceLock({
      workspaceId,
      spaceId: workspace.spaceId,
      taskId: workspace.taskId,
    });
  } catch (err) {
    logger.warn({ workspaceId, err }, 'lock release on archive failed');
  }

  await getSubstrate(workspace.substrate).teardown(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    { removeIsolation: true },
  );

  // archived is only reachable from merged|failed|cancelled — cancel first if needed.
  if (!['merged', 'failed', 'cancelled'].includes(workspace.state)) {
    await advanceWorkspace(workspaceId, 'cancelled');
  }
  const archived = await advanceWorkspace(workspaceId, 'archived', {
    worktreePath: undefined,
    sessionName: undefined,
  });
  logger.info({ workspaceId }, 'workspace archived');
  return archived;
}
