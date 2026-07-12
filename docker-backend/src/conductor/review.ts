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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Workspace } from '@recoder/agent-os';
import { createLogger } from '../logger';

const execFileAsync = promisify(execFile);

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

export interface WorkspaceTree {
  workspaceId: string;
  /** Repo-relative file paths in the worktree (tracked + untracked), sorted. */
  files: string[];
  /** Subset of `files` that are changed vs the index/HEAD (added/modified/untracked). */
  changed: string[];
  /** True when the file list was capped (very large repo). */
  truncated: boolean;
}

/** Cap the tree so a huge repo can't flood the UI or the response. */
const MAX_TREE_FILES = 5000;

/** Run a git command in the worktree, returning trimmed non-empty stdout lines. Degrade-safe. */
async function gitLines(cwd: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.split('\n').map((s) => s.trimEnd()).filter(Boolean);
  } catch {
    // No git / not a repo / empty tree — surface an empty tree, never throw.
    return [];
  }
}

/**
 * List the workspace worktree's files as a flat, sorted path list (tracked via
 * `git ls-files` + untracked via `git status --porcelain`, gitignore-aware),
 * marking which are changed. This powers the right panel's "All files" tree —
 * the full workspace, not just the diff. Degrade-safe: a non-repo/empty worktree
 * yields an empty tree rather than an error.
 */
export async function workspaceTree(workspaceId: string): Promise<WorkspaceTree> {
  const workspace = await requireWorktree(workspaceId);
  const cwd = workspace.worktreePath;

  const tracked = await gitLines(cwd, ['ls-files']);
  const status = await gitLines(cwd, ['status', '--porcelain']);

  const changed = new Set<string>();
  const untracked: string[] = [];
  for (const line of status) {
    // Porcelain: "XY <path>"; renames are "R  old -> new" — take the new path.
    let path = line.slice(3).trim();
    const arrow = path.indexOf(' -> ');
    if (arrow !== -1) path = path.slice(arrow + 4).trim();
    if (!path) continue;
    changed.add(path);
    if (line.startsWith('??')) untracked.push(path);
  }

  const all = Array.from(new Set([...tracked, ...untracked])).sort((a, b) => a.localeCompare(b));
  const truncated = all.length > MAX_TREE_FILES;
  return {
    workspaceId,
    files: truncated ? all.slice(0, MAX_TREE_FILES) : all,
    changed: Array.from(changed),
    truncated,
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
