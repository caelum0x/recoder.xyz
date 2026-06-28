/**
 * Reconciler — restart survivability (substrate.md §4.6).
 *
 * Ported VERBATIM (behavior-preserving) from
 * docker-backend/src/conductor/workspace-service.ts's `reconcile`. After a
 * backend restart the in-memory session map is empty, so reconcile queries the
 * REAL execution substrate directly (live sessions + worktrees, via the injected
 * SubstrateScanPort) and joins them against persisted workspaces to report the
 * true state — live, orphaned sessions, orphaned worktrees, dangling records.
 *
 * It FLAGS orphans (writes truthful reconcile metadata, finalizes crashed
 * non-terminal records) for a policy/operator to resolve; it never silently
 * kills live work.
 */
import {
  isTerminalTaskRunState,
  isTerminalWorkspaceState,
  transitionTaskRun,
  transitionWorkspace,
  type RunEvent,
  type Workspace,
} from '@recoder/agent-os';
import type { WorkspaceEngineDeps } from '../engine/deps.js';
import type { ReconcileReport } from '../engine/types.js';

/** Persisted lock scope (origin repo + declared write surface) for re-acquire on reconcile. */
interface PersistedLockScope {
  repo: string;
  targetPaths?: string[];
}

/** Read the persisted lock scope a workspace was launched with, if recorded. */
function readLockScope(workspace: Workspace): PersistedLockScope | undefined {
  const raw = workspace.metadata?.['lockScope'];
  if (!raw || typeof raw !== 'object') return undefined;
  const scope = raw as Record<string, unknown>;
  const repo = scope['repo'];
  if (typeof repo !== 'string') return undefined;
  const rawTargetPaths = scope['targetPaths'];
  const targetPaths = Array.isArray(rawTargetPaths)
    ? rawTargetPaths.filter((p): p is string => typeof p === 'string')
    : undefined;
  return { repo, targetPaths };
}

/**
 * Join persisted workspaces against the REAL substrate state (live sessions +
 * worktrees, queried directly so it is correct even after a backend restart).
 * Reports the truth; it does not silently mutate execution — orphaned
 * non-terminal workspaces are finalized to a terminal record state with truthful
 * metadata, never fabricated success.
 */
export async function reconcile(deps: WorkspaceEngineDeps): Promise<ReconcileReport> {
  const { repository, scan, clock, logger } = deps;

  const [workspaces, liveSessions, conductorWorktrees] = await Promise.all([
    repository.listWorkspaces(),
    scan.listLiveSessions(),
    scan.listConductorWorktrees(),
  ]);

  const sessionSet = new Set(liveSessions);
  const worktreeWorkspaceIds = new Set(conductorWorktrees);
  const knownSessionNames = new Set<string>();

  const live: string[] = [];
  const rebound: string[] = [];
  const relocked: string[] = [];
  const orphanedWorkspaces: string[] = [];
  const finalized: string[] = [];

  for (const ws of workspaces) {
    if (ws.sessionName) knownSessionNames.add(ws.sessionName);
    if (isTerminalWorkspaceState(ws.state)) continue;
    if (ws.sessionName && sessionSet.has(ws.sessionName)) {
      // SURVIVABLE LIVE WORKSPACE: its tmux session is still alive after a
      // backend restart. Rebind streaming + re-hold its write-lock so the run
      // resumes exactly where it left off and its scope stays exclusively claimed.
      live.push(ws.workspaceId);
      if (await rebindLiveWorkspace(deps, ws)) rebound.push(ws.workspaceId);
      if (await relockLiveWorkspace(deps, ws)) relocked.push(ws.workspaceId);
    } else if (ws.state === 'running' || ws.state === 'awaiting_approval') {
      // CRASHED ORPHAN: a non-terminal workspace whose session is gone. Finalize
      // it — read the true exit code, emit a terminal RunEvent, advance the
      // record + run to a terminal state, and free its lock — instead of leaving
      // it dangling forever.
      orphanedWorkspaces.push(ws.workspaceId);
      if (await finalizeOrphanedWorkspace(deps, ws)) finalized.push(ws.workspaceId);
    }
  }

  const knownWorkspaceIds = new Set(workspaces.map((w) => w.workspaceId));
  const orphanedSessions = liveSessions.filter((name) => !knownSessionNames.has(name));
  const orphanedWorktrees = [...worktreeWorkspaceIds].filter((id) => !knownWorkspaceIds.has(id));

  const report: ReconcileReport = {
    live,
    rebound,
    relocked,
    orphanedWorkspaces,
    finalized,
    orphanedSessions,
    orphanedWorktrees,
    checkedAt: clock.now(),
  };
  logger.info('conductor reconcile complete', report as unknown as Record<string, unknown>);
  return report;
}

/**
 * Rebind the run-tailer for a live workspace so terminal streaming resumes after
 * a backend restart (the in-memory tail map is empty on restart). Idempotent:
 * the tailer no-ops if a tail is already active for this workspace. Returns true
 * when a (re)bind was attempted, false when the record lacks a run/session to
 * tail. Never throws — a tail rebind failure must not fail reconcile.
 */
async function rebindLiveWorkspace(deps: WorkspaceEngineDeps, ws: Workspace): Promise<boolean> {
  if (!ws.runId || !ws.sessionName) return false;
  try {
    deps.runTailer.start({
      workspaceId: ws.workspaceId,
      taskId: ws.taskId,
      runId: ws.runId,
      substrate: ws.substrate,
      sessionName: ws.sessionName,
      worktreePath: ws.worktreePath,
    });
    return true;
  } catch (err) {
    deps.logger.warn('reconcile: run-tail rebind failed', { workspaceId: ws.workspaceId, err });
    return false;
  }
}

/**
 * Re-acquire a live workspace's write-lock using its persisted lock scope. After
 * a restart the in-memory lock store is empty, so the surviving workspace no
 * longer holds its scope; this re-binds it (self-safe — never conflicts with
 * itself). Returns true when the lock is (re)held for this workspace, false when
 * no scope was recorded or the engine is degraded. Never throws.
 */
async function relockLiveWorkspace(deps: WorkspaceEngineDeps, ws: Workspace): Promise<boolean> {
  if (!deps.lock) return false;
  const scope = readLockScope(ws);
  if (!scope) return false;
  try {
    const result = await deps.lock.reacquire({
      workspaceId: ws.workspaceId,
      spaceId: ws.spaceId,
      taskId: ws.taskId,
      repo: scope.repo,
      targetPaths: scope.targetPaths,
    });
    if (result.status === 'acquired') return true;
    if (result.status === 'conflict') {
      deps.logger.warn('reconcile: live workspace lost its lock to a peer (scope contended)', {
        workspaceId: ws.workspaceId,
        conflicts: result.conflicts,
      });
    }
    return false;
  } catch (err) {
    deps.logger.warn('reconcile: lock re-acquire failed', { workspaceId: ws.workspaceId, err });
    return false;
  }
}

/**
 * Finalize a crashed orphan: its session is gone but the record is non-terminal.
 * Read the true substrate exit code, emit a terminal RunEvent (completed on exit
 * 0 / handle-gone, failed on a non-zero exit), advance the run + workspace to a
 * terminal state, and release the write-lock. Best-effort and idempotent: a
 * partial failure logs and reports false rather than throwing out of reconcile.
 */
async function finalizeOrphanedWorkspace(
  deps: WorkspaceEngineDeps,
  ws: Workspace,
): Promise<boolean> {
  const { repository, registry, lock, clock, logger } = deps;
  const at = clock.now();

  // Read the true exit code from the substrate (distinguishes clean finish from
  // a crash). A gone handle / unknown code is treated as a clean completion.
  let exitCode: number | null | undefined;
  try {
    const substrate = registry.get(ws.substrate);
    if (substrate.exitCode) {
      exitCode = await substrate.exitCode({
        ref: ws.workspaceId,
        sessionName: ws.sessionName,
        worktreePath: ws.worktreePath,
      });
    }
  } catch (err) {
    logger.warn('reconcile: orphan exit-code probe failed', { workspaceId: ws.workspaceId, err });
    exitCode = undefined;
  }
  const crashed = typeof exitCode === 'number' && exitCode !== 0;

  // Emit a terminal RunEvent into the audit log (truthful: what the substrate
  // reports, not a fabricated success).
  if (ws.runId) {
    const event: RunEvent = {
      eventId: `event_${ws.runId}_reconcile_${clock.nowMs()}`,
      type: crashed ? 'failed' : 'completed',
      taskId: ws.taskId,
      runId: ws.runId,
      message: crashed
        ? `Agent session gone after restart; exited with code ${exitCode}`
        : 'Agent session ended (finalized by reconcile after restart)',
      createdAt: at,
      data: { sessionName: ws.sessionName, exitCode: exitCode ?? 0, finalizedBy: 'reconcile' },
    };
    try {
      await repository.appendEvent(event);
    } catch (err) {
      logger.warn('reconcile: terminal event append failed', { workspaceId: ws.workspaceId, err });
    }

    // Advance the control-plane run to a terminal state when it is still open.
    try {
      const runs = await repository.listRuns();
      const run = runs.find((r) => r.runId === ws.runId);
      if (run && !isTerminalTaskRunState(run.state)) {
        await repository.upsertRun(
          transitionTaskRun(run, crashed ? 'failed' : 'completed', {
            metadata: { finalizedBy: 'reconcile', exitCode: exitCode ?? 0 },
          }),
        );
      }
    } catch (err) {
      logger.warn('reconcile: run finalize failed', { workspaceId: ws.workspaceId, err });
    }
  }

  // Advance the workspace record to a terminal lifecycle state. running |
  // awaiting_approval → failed is legal; a clean completion is recorded as
  // failed-with-clean-exit metadata since the lifecycle has no non-merge
  // "completed" state (merged is reserved for the review/merge path).
  let advanced = false;
  try {
    await repository.upsertWorkspace(
      transitionWorkspace(ws, 'failed', {
        metadata: {
          reconcile: {
            sessionMissing: true,
            finalized: true,
            exitCode: exitCode ?? null,
            crashed,
            at,
          },
        },
      }),
    );
    advanced = true;
  } catch (err) {
    logger.warn('reconcile: workspace finalize transition failed', {
      workspaceId: ws.workspaceId,
      err,
    });
  }

  // Free the write-lock so the orphan's scope is released for the next workspace.
  if (lock) {
    try {
      await lock.release({ workspaceId: ws.workspaceId, spaceId: ws.spaceId, taskId: ws.taskId });
    } catch (err) {
      logger.warn('reconcile: orphan lock release failed', { workspaceId: ws.workspaceId, err });
    }
  }

  return advanced;
}
