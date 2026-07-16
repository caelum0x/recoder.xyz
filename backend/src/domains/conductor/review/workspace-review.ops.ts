/**
 * Conductor review ops — turn a workspace's work into a reviewable diff + file
 * tree, and archive the workspace when done. Ported from the proven v1
 * `conductor/review.ts` onto the domain's injected seams (engine advance,
 * substrate registry, exec) — no module singletons, no `process.env`.
 *
 * Host-side git on the workspace's isolated worktree (the Conductor model).
 * PR creation and merge are outward-facing actions and live in
 * `workspace-publish.ops.ts`. Every op is truthful: a missing workspace/worktree
 * throws a "not found" the route maps to 404; a non-repo tree degrades to empty.
 */
import { execFileSafe } from '@recoder/substrate';
import type { Workspace, WorkspaceState, WorkspaceSubstrate } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { ConductorSubstrate, WorkLockPort } from '../ports/index.js';

export interface WorkspaceDiffView {
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

export interface WorkspaceTreeView {
  workspaceId: string;
  /** Repo-relative file paths in the worktree (tracked + untracked), sorted. */
  files: string[];
  /** Subset of `files` changed vs the index/HEAD (added/modified/untracked). */
  changed: string[];
  /** True when the file list was capped (very large repo). */
  truncated: boolean;
}

/** Cap the tree so a huge repo can't flood the UI or the response. */
const MAX_TREE_FILES = 5000;

export type AdvanceWorkspaceFn = (
  workspaceId: string,
  to: WorkspaceState,
  patch?: Partial<Workspace>,
  metadata?: Record<string, unknown>,
) => Promise<Workspace>;

export interface ReviewOpsDeps {
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly advanceWorkspace: AdvanceWorkspaceFn;
  readonly getSubstrate: (id: WorkspaceSubstrate) => ConductorSubstrate;
  readonly logger: Logger;
  /** Optional write-lock port — archive releases the workspace's repo scope. */
  readonly lock?: WorkLockPort;
  /** Child-process seam for host git (tree); defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
}

async function requireWorktree(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<Workspace & { worktreePath: string }> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  return workspace as Workspace & { worktreePath: string };
}

/**
 * Compute the reviewable diff of the workspace's worktree against its base ref,
 * and move the workspace to `awaiting_review` (when it is currently running).
 */
export async function workspaceDiff(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<WorkspaceDiffView> {
  const workspace = await requireWorktree(deps, workspaceId);
  const base = workspace.baseRef || 'HEAD';

  const result = await deps.getSubstrate(workspace.substrate).diff(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    base,
  );

  if (workspace.state === 'running') {
    await deps.advanceWorkspace(workspaceId, 'awaiting_review', undefined, {
      changedFiles: result.changedFiles,
    });
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

/** Run a git command in the worktree, returning trimmed non-empty stdout lines. Degrade-safe. */
async function gitLines(deps: ReviewOpsDeps, cwd: string, args: string[]): Promise<string[]> {
  const exec = deps.exec ?? execFileSafe;
  try {
    const { stdout } = await exec('git', ['-C', cwd, ...args], {
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
 * the full workspace, not just the diff.
 */
export async function workspaceTree(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<WorkspaceTreeView> {
  const workspace = await requireWorktree(deps, workspaceId);
  const cwd = workspace.worktreePath;

  const tracked = await gitLines(deps, cwd, ['ls-files']);
  const status = await gitLines(deps, cwd, ['status', '--porcelain']);

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
 * Archive a finished workspace: stop its session, remove its worktree, release
 * its write-lock scope, and move the record to `archived`. Idempotent-ish; safe
 * to call after merge or failure.
 */
export async function archiveWorkspace(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<Workspace> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (workspace.state === 'archived') return workspace;

  // Release the workspace's write-lock so its repo scope is freed for the next
  // workspace. Degrade-safe (no-op when locking is disabled/unavailable).
  if (deps.lock) {
    try {
      await deps.lock.release({
        workspaceId,
        spaceId: workspace.spaceId,
        taskId: workspace.taskId,
      });
    } catch (err) {
      deps.logger.warn({ workspaceId, err }, 'lock release on archive failed');
    }
  }

  await deps.getSubstrate(workspace.substrate).teardown(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    { removeIsolation: true },
  );

  // archived is only reachable from merged|failed|cancelled — cancel first if needed.
  if (!['merged', 'failed', 'cancelled'].includes(workspace.state)) {
    await deps.advanceWorkspace(workspaceId, 'cancelled');
  }
  const archived = await deps.advanceWorkspace(workspaceId, 'archived', {
    worktreePath: undefined,
    sessionName: undefined,
  });
  deps.logger.info({ workspaceId }, 'workspace archived');
  return archived;
}
