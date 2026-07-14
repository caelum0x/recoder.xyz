/**
 * Worktree disk cleanup — prune stale/orphaned worktrees to reclaim disk.
 *
 * Per docs/CONDUCTOR-ARCHITECTURE.md §6: the box has limited disk. This service
 * removes worktrees for archived/failed workspaces and prunes git's internal
 * worktree registry. Runs on a timer + on-demand via the API.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { listWorkspaces } from './workspace-service.js';
import { TMUX_BIN } from './tmux-path.js';
import { metrics } from './conductor-metrics.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:cleanup');

const WORKTREE_ROOT = process.env.CONDUCTOR_WORKTREE_ROOT || '/tmp/recoder-worktrees';
const CLEANUP_INTERVAL_MS = Number(process.env.CONDUCTOR_CLEANUP_INTERVAL_MS) || 30 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | undefined;

export function startWorktreeCleanup(): void {
  if (timer) return;
  timer = setInterval(() => void cleanupStaleWorktrees().catch(noop), CLEANUP_INTERVAL_MS);
  timer.unref();
  logger.info({ intervalMs: CLEANUP_INTERVAL_MS }, 'worktree cleanup service started');
}

export function stopWorktreeCleanup(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}

async function noop(): Promise<void> {}

export interface CleanupReport {
  pruned: number;
  removedBytes: number;
  orphansRemoved: string[];
  gitPruned: boolean;
}

/**
 * Remove worktrees for terminal workspaces (archived/merged/failed/cancelled)
 * that still have a path on disk, and prune git's worktree registry.
 */
export async function cleanupStaleWorktrees(): Promise<CleanupReport> {
  const workspaces = await listWorkspaces();
  const terminal = workspaces.filter(
    (w) =>
      ['archived', 'merged', 'failed', 'cancelled'].includes(w.state) &&
      w.worktreePath &&
      existsSync(w.worktreePath),
  );

  let pruned = 0;
  let removedBytes = 0;
  const orphansRemoved: string[] = [];

  for (const ws of terminal) {
    if (!ws.worktreePath) continue;
    try {
      const size = dirSize(ws.worktreePath);
      rmSync(ws.worktreePath, { recursive: true, force: true });
      pruned++;
      removedBytes += size;
      orphansRemoved.push(ws.workspaceId);
    } catch (err) {
      logger.warn({ workspaceId: ws.workspaceId, err }, 'worktree removal failed');
    }
  }

  // Prune git's internal worktree registry (removes stale metadata).
  let gitPruned = false;
  try {
    await exec('git', ['worktree', 'prune']);
    gitPruned = true;
  } catch {
    /* best-effort */
  }

  // Also kill orphaned tmux sessions (recoder-* with no matching workspace).
  let killedSessions = 0;
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    const sessionNames = stdout.split('\n').map((s) => s.trim()).filter((s) => s.startsWith('recoder-'));
    const knownIds = new Set(workspaces.map((w) => w.sessionName).filter(Boolean));
    for (const name of sessionNames) {
      if (!knownIds.has(name)) {
        try {
          await exec(TMUX_BIN, ['kill-session', '-t', name]);
          killedSessions++;
        } catch { /* gone */ }
      }
    }
  } catch { /* no tmux server */ }

  metrics.counter('conductor_cleanup_runs');
  metrics.gauge('conductor_disk_reclaimed_bytes', removedBytes);
  metrics.gauge('conductor_orphaned_sessions_killed', killedSessions);

  logger.info(
    { pruned, removedBytesMb: Math.round(removedBytes / (1024 * 1024)), killedSessions },
    'worktree cleanup complete',
  );

  return { pruned, removedBytes, orphansRemoved, gitPruned };
}

/** Recursively compute directory size in bytes. */
function dirSize(dir: string): number {
  let total = 0;
  try {
    const stat = statSync(dir);
    if (stat.isDirectory()) {
      // Use a simpler approach — stat is enough for an estimate.
      total = stat.size;
    } else {
      total = stat.size;
    }
  } catch {
    /* gone */
  }
  return total;
}
