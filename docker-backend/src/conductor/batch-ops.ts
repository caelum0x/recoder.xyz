/**
 * Batch workspace operations — list by state, bulk cancel, bulk archive.
 *
 * Production operator surface: clean up stale workspaces, cancel runaway agents,
 * archive everything in a project. All operations are truthful (report what
 * happened to each workspace, never silently skip).
 */
import { createLogger } from '../logger.js';
import { listWorkspaces, advanceWorkspace } from './workspace-service.js';
import { archiveWorkspace } from './review.js';
import { stopRunTail } from './run-tailer.js';
import { getSubstrate } from './substrate.js';
import { releaseWorkspaceLock } from './conductor-locks.js';
import { metrics } from './conductor-metrics.js';
import type { Workspace } from '@recoder/agent-os';

const logger = createLogger('conductor:batch');

export interface BatchResult {
  total: number;
  processed: number;
  errors: { workspaceId: string; error: string }[];
}

/**
 * List workspaces filtered by state. Returns the full workspace records.
 */
export async function listByState(state: string): Promise<Workspace[]> {
  const all = await listWorkspaces();
  return all.filter((w) => w.state === state);
}

/**
 * Bulk cancel all non-terminal workspaces matching a filter (projectId or createdBy).
 * Stops run-tails, releases locks, transitions to cancelled.
 */
export async function bulkCancel(filter: {
  projectId?: string;
  createdBy?: string;
}): Promise<BatchResult> {
  const all = await listWorkspaces();
  const matching = all.filter(
    (w) =>
      !['archived', 'merged', 'failed', 'cancelled'].includes(w.state) &&
      (!filter.projectId || w.projectId === filter.projectId) &&
      (!filter.createdBy || w.createdBy === filter.createdBy),
  );

  const errors: { workspaceId: string; error: string }[] = [];
  for (const ws of matching) {
    try {
      stopRunTail(ws.workspaceId);
      try {
        await releaseWorkspaceLock({ workspaceId: ws.workspaceId, spaceId: ws.spaceId, taskId: ws.taskId });
      } catch { /* degrade-safe */ }
      // Kill the tmux session if it exists.
      if (ws.sessionName) {
        try {
          await getSubstrate(ws.substrate).teardown(
            { ref: ws.workspaceId, sessionName: ws.sessionName, worktreePath: ws.worktreePath },
            { removeIsolation: false },
          );
        } catch { /* best-effort */ }
      }
      await advanceWorkspace(ws.workspaceId, 'cancelled');
      metrics.counter('conductor_batch_cancellations');
    } catch (err) {
      errors.push({ workspaceId: ws.workspaceId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info({ cancelled: matching.length - errors.length, errors: errors.length }, 'bulk cancel complete');
  return { total: matching.length, processed: matching.length - errors.length, errors };
}

/**
 * Bulk archive all terminal workspaces (merged/failed/cancelled) matching a filter.
 * Frees disk by removing worktrees + killing sessions.
 */
export async function bulkArchive(filter: {
  projectId?: string;
  states?: string[];
}): Promise<BatchResult> {
  const all = await listWorkspaces();
  const terminalStates = filter.states ?? ['merged', 'failed', 'cancelled'];
  const matching = all.filter(
    (w) =>
      terminalStates.includes(w.state) &&
      (!filter.projectId || w.projectId === filter.projectId) &&
      w.state !== 'archived',
  );

  const errors: { workspaceId: string; error: string }[] = [];
  for (const ws of matching) {
    try {
      await archiveWorkspace(ws.workspaceId);
      metrics.counter('conductor_batch_archives');
    } catch (err) {
      errors.push({ workspaceId: ws.workspaceId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info({ archived: matching.length - errors.length, errors: errors.length }, 'bulk archive complete');
  return { total: matching.length, processed: matching.length - errors.length, errors };
}
