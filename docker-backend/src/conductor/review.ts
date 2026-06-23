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
import { advanceWorkspace, getWorkspace } from './workspace-service.js';
import { killSession } from './tmux-orchestrator.js';

const exec = promisify(execFile);
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
  const cwd = workspace.worktreePath;
  const base = workspace.baseRef || 'HEAD';

  const [stat, patch, status] = await Promise.all([
    git(cwd, ['--no-pager', 'diff', '--stat', base]),
    git(cwd, ['--no-pager', 'diff', base]),
    git(cwd, ['status', '--porcelain']),
  ]);

  const untracked = status
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  const changedFiles =
    stat
      .trim()
      .split('\n')
      .filter((l) => l.includes('|')).length + untracked.length;

  if (workspace.state === 'running') {
    await advanceWorkspace(workspaceId, 'awaiting_review', undefined, { changedFiles });
  }

  return {
    workspaceId,
    baseRef: base,
    branch: workspace.branch,
    stat: stat.trim(),
    patch,
    untracked,
    changedFiles,
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

  await killSession(workspaceId, { removeWorktree: true });

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

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', cwd, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}
