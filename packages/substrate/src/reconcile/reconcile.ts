/**
 * Reconciler — restart survivability (substrate.md §4.6).
 *
 * Ported VERBATIM (behavior-preserving) from
 * backend/src/conductor/workspace-service.ts's `reconcile`. After a
 * backend restart the in-memory session map is empty, so reconcile queries the
 * REAL execution substrate directly (live sessions + worktrees, via the injected
 * SubstrateScanPort) and joins them against persisted workspaces to report the
 * true state — live, orphaned sessions, orphaned worktrees, dangling records.
 *
 * It FLAGS orphans (writes truthful reconcile metadata, finalizes crashed
 * non-terminal records) for a policy/operator to resolve; it never silently
 * kills live work.
 *
 * RESUME (lossy→lossless): a crashed `running` orphan whose durable state carries a
 * native session ref AND whose substrate has an in-place relaunch is RESUMED via the
 * agent's own resume flow (built by the injected resume planner) instead of being
 * finalized to `failed`. The AGENT owns its history on resume — Recoder never
 * replays its captured buffer. A session is resumed at most once per pass, and two
 * workspaces can never resume the SAME session (dedupe key). Conservative: with no
 * resume planner, no session ref, an unresumable runtime, or a relaunch fault, the
 * orphan stays finalized-to-failed — a real failure is never masked.
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
export async function reconcile(
  deps: WorkspaceEngineDeps
): Promise<ReconcileReport> {
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
  const resumed: string[] = [];
  // Per-pass guard so two orphans can never resume the SAME native session and a
  // session is resumed at most once.
  const resumedSessions = new Set<string>();

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
    } else if (ws.state === 'running') {
      // CRASHED ORPHAN: a non-terminal workspace whose session is gone.
      orphanedWorkspaces.push(ws.workspaceId);
      // Prefer a LOSSLESS native resume when the agent has its own durable session
      // (the agent replays its history) over a lossy finalize-to-failed.
      const resumeOutcome = await maybeResumeOrphan(deps, ws, resumedSessions);
      if (resumeOutcome === 'resumed') {
        resumed.push(ws.workspaceId);
        continue;
      }
      if (resumeOutcome === 'deferred') continue;
      // No resumable native session (or the relaunch faulted) ⇒ finalize truthfully:
      // read the true exit code, emit a terminal RunEvent, advance the record + run
      // to a terminal state, and free its lock — instead of leaving it dangling.
      if (await finalizeOrphanedWorkspace(deps, ws))
        finalized.push(ws.workspaceId);
    }
  }

  const knownWorkspaceIds = new Set(workspaces.map(w => w.workspaceId));
  const orphanedSessions = liveSessions.filter(
    name => !knownSessionNames.has(name)
  );
  const orphanedWorktrees = [...worktreeWorkspaceIds].filter(
    id => !knownWorkspaceIds.has(id)
  );

  const report: ReconcileReport = {
    live,
    rebound,
    relocked,
    orphanedWorkspaces,
    finalized,
    resumed,
    orphanedSessions,
    orphanedWorktrees,
    checkedAt: clock.now(),
  };
  logger.info(
    'conductor reconcile complete',
    report as unknown as Record<string, unknown>
  );
  return report;
}

/**
 * Rebind the run-tailer for a live workspace so terminal streaming resumes after
 * a backend restart (the in-memory tail map is empty on restart). Idempotent:
 * the tailer no-ops if a tail is already active for this workspace. Returns true
 * when a (re)bind was attempted, false when the record lacks a run/session to
 * tail. Never throws — a tail rebind failure must not fail reconcile.
 */
async function rebindLiveWorkspace(
  deps: WorkspaceEngineDeps,
  ws: Workspace
): Promise<boolean> {
  if (!ws.runId || !ws.sessionName) return false;
  try {
    deps.runTailer.start({
      workspaceId: ws.workspaceId,
      taskId: ws.taskId,
      runId: ws.runId,
      substrate: ws.substrate,
      sessionName: ws.sessionName,
      worktreePath: ws.worktreePath,
      runtimeId: ws.runtimeId,
      onNativeSessionRef: nativeSessionCapture(deps, ws.workspaceId),
    });
    return true;
  } catch (err) {
    deps.logger.warn('reconcile: run-tail rebind failed', {
      workspaceId: ws.workspaceId,
      err,
    });
    return false;
  }
}

/** Persist a driver-observed native session ref without overwriting concurrent metadata. */
function nativeSessionCapture(
  deps: WorkspaceEngineDeps,
  workspaceId: string,
): (sessionRef: string) => Promise<void> {
  return async (sessionRef) => {
    const current = await deps.repository.getWorkspace(workspaceId);
    if (!current) return;
    const resume = current.metadata?.['resume'];
    const prior = resume && typeof resume === 'object' ? resume as Record<string, unknown> : {};
    if (prior['sessionRef'] === sessionRef) return;
    await deps.repository.upsertWorkspace({
      ...current,
      updatedAt: deps.clock.now(),
      metadata: { ...(current.metadata ?? {}), resume: { ...prior, sessionRef } },
    });
  };
}

/**
 * Re-acquire a live workspace's write-lock using its persisted lock scope. After
 * a restart the in-memory lock store is empty, so the surviving workspace no
 * longer holds its scope; this re-binds it (self-safe — never conflicts with
 * itself). Returns true when the lock is (re)held for this workspace, false when
 * no scope was recorded or the engine is degraded. Never throws.
 */
async function relockLiveWorkspace(
  deps: WorkspaceEngineDeps,
  ws: Workspace
): Promise<boolean> {
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
      deps.logger.warn(
        'reconcile: live workspace lost its lock to a peer (scope contended)',
        {
          workspaceId: ws.workspaceId,
          conflicts: result.conflicts,
        }
      );
    }
    return false;
  } catch (err) {
    deps.logger.warn('reconcile: lock re-acquire failed', {
      workspaceId: ws.workspaceId,
      err,
    });
    return false;
  }
}

/**
 * Read a durable native session ref off a workspace's reconcile-resume metadata
 * (`metadata.resume.sessionRef`). This is the id/path the agent's OWN CLI uses to
 * replay its history. Absent / malformed ⇒ `undefined` (no native resume — the
 * orphan finalizes to failed, truthful). Never fabricated.
 */
function readResumeSessionRef(ws: Workspace): string | undefined {
  const raw = ws.metadata?.['resume'];
  if (!raw || typeof raw !== 'object') return undefined;
  const ref = (raw as Record<string, unknown>)['sessionRef'];
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined;
}

const MAX_RESUME_ATTEMPTS = 3;
const INITIAL_RESUME_BACKOFF_MS = 30_000;

function readResumeAttemptState(ws: Workspace): { attempts: number; nextAttemptAt?: string } {
  const raw = ws.metadata?.['resume'];
  if (!raw || typeof raw !== 'object') return { attempts: 0 };
  const resume = raw as Record<string, unknown>;
  const attempts = typeof resume['attempts'] === 'number' && Number.isInteger(resume['attempts']) && resume['attempts'] >= 0
    ? resume['attempts']
    : 0;
  return {
    attempts,
    ...(typeof resume['nextAttemptAt'] === 'string' ? { nextAttemptAt: resume['nextAttemptAt'] } : {}),
  };
}

/**
 * Shell-quote one argv element for a substrate whose relaunch takes a command
 * STRING (tmux_worktree). The registry already carries the session ref as validated
 * argv DATA (no control chars; paths absolute); this only defends the shell boundary
 * so a space/quote in a path can never split or inject. Bare word-safe tokens pass
 * through; anything else is single-quoted.
 */
function shellQuoteArg(arg: string): string {
  if (/^[A-Za-z0-9_/:.,=@+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Attempt a LOSSLESS native resume of a crashed orphan. Returns true only when the
 * agent's own session was genuinely relaunched in place; false ⇒ the caller
 * finalizes to failed (truthful). CONSERVATIVE — every guard below prefers finalize
 * over masking a real failure:
 *  - no resume planner wired ⇒ false
 *  - no durable session ref on the record ⇒ false
 *  - this session already resumed this pass (dedupe) ⇒ false
 *  - the runtime has no native resume / the ref fails validation ⇒ false
 *  - the substrate cannot relaunch in place / no worktree to relaunch into ⇒ false
 *  - the relaunch throws ⇒ false (and the dedupe claim is released)
 * On success the agent OWNS its history (we never replay Recoder's captured buffer);
 * streaming + the write-lock are rebound so the resumed run is fully live again.
 */
async function maybeResumeOrphan(
  deps: WorkspaceEngineDeps,
  ws: Workspace,
  resumedSessions: Set<string>
): Promise<'resumed' | 'deferred' | 'unavailable'> {
  const planner = deps.resume;
  if (!planner) return 'unavailable';
  const sessionRef = readResumeSessionRef(ws);
  if (!sessionRef) return 'unavailable';
  if (!ws.worktreePath) return 'unavailable'; // nothing to relaunch into

  const runtimeId = ws.runtimeId;
  const key = planner.dedupeKey(runtimeId, sessionRef);
  if (resumedSessions.has(key)) return 'unavailable'; // resumed at most once per session

  const plan = planner.plan(runtimeId, sessionRef);
  if (!plan || plan.argv.length === 0) return 'unavailable'; // no native resume ⇒ finalize

  let substrate;
  try {
    substrate = deps.registry.get(ws.substrate);
  } catch (err) {
    deps.logger.warn('reconcile: resume substrate resolve failed', {
      workspaceId: ws.workspaceId,
      err,
    });
    return 'unavailable';
  }
  if (!substrate.continueRun) return 'unavailable'; // no in-place relaunch ⇒ finalize

  const attempt = readResumeAttemptState(ws);
  if (attempt.attempts >= MAX_RESUME_ATTEMPTS) return 'unavailable';
  const nowMs = deps.clock.nowMs();
  if (attempt.nextAttemptAt && Date.parse(attempt.nextAttemptAt) > nowMs) return 'deferred';

  const nextAttempts = attempt.attempts + 1;
  const nextAttemptAt = new Date(
    nowMs + INITIAL_RESUME_BACKOFF_MS * 2 ** attempt.attempts,
  ).toISOString();
  const resume = ws.metadata?.['resume'];
  const prior = resume && typeof resume === 'object' ? resume as Record<string, unknown> : {};
  try {
    await deps.repository.upsertWorkspace({
      ...ws,
      updatedAt: deps.clock.now(),
      metadata: {
        ...(ws.metadata ?? {}),
        resume: { ...prior, attempts: nextAttempts, nextAttemptAt, lastAttemptAt: deps.clock.now() },
      },
    });
  } catch (err) {
    deps.logger.warn('reconcile: resume attempt persist failed', { workspaceId: ws.workspaceId, err });
    return 'unavailable';
  }

  // Claim the session BEFORE the async relaunch so a concurrent duplicate cannot
  // double-launch; release the claim if the relaunch faults so finalize can run.
  resumedSessions.add(key);
  try {
    const command = plan.argv.map(shellQuoteArg).join(' ');
    await substrate.continueRun(
      {
        ref: ws.workspaceId,
        sessionName: ws.sessionName,
        worktreePath: ws.worktreePath,
      },
      {
        workspaceId: ws.workspaceId,
        worktreePath: ws.worktreePath,
        command,
      }
    );
  } catch (err) {
    resumedSessions.delete(key);
    deps.logger.warn('reconcile: native resume relaunch failed', {
      workspaceId: ws.workspaceId,
      err,
    });
    return 'deferred';
  }

  // The resumed run is live again: rebind streaming + re-hold the write-lock. The
  // AGENT replays its own history — we do NOT replay Recoder's captured buffer.
  await rebindLiveWorkspace(deps, ws);
  await relockLiveWorkspace(deps, ws);

  // Emit a truthful RunEvent recording the resume (never a fabricated completion).
  if (ws.runId) {
    const event: RunEvent = {
      eventId: `event_${ws.runId}_resume_${deps.clock.nowMs()}`,
      type: 'log',
      taskId: ws.taskId,
      runId: ws.runId,
      message:
        'Agent session relaunched via native resume after restart (agent owns its history)',
      createdAt: deps.clock.now(),
      data: {
        sessionName: ws.sessionName,
        runtimeId,
        resumedBy: 'reconcile',
      },
    };
    try {
      await deps.repository.appendEvent(event);
    } catch (err) {
      deps.logger.warn('reconcile: resume event append failed', {
        workspaceId: ws.workspaceId,
        err,
      });
    }
  }

  return 'resumed';
}

/**
 * Finalize a crashed orphan: its session is gone but the record is non-terminal.
 * Read the true substrate exit code and emit a terminal RunEvent: `completed` on a
 * clean finish (an observed numeric exit 0), `failed` on a non-zero exit (crash)
 * OR an absent exit code (`null`/`undefined`: the substrate could not determine
 * the outcome — e.g. a vanished tmux pane or an ACP session interrupted by the
 * restart; genuinely unknown, so NEVER booked as a fabricated success). Advance the run +
 * workspace to a terminal state and release the write-lock. Best-effort and
 * idempotent: a partial failure logs and reports false rather than throwing.
 */
async function finalizeOrphanedWorkspace(
  deps: WorkspaceEngineDeps,
  ws: Workspace
): Promise<boolean> {
  const { repository, registry, lock, clock, logger } = deps;
  const at = clock.now();

  // Read the true exit code from the substrate (distinguishes clean finish from
  // a crash). A gone handle / unknown code cannot prove success.
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
    logger.warn('reconcile: orphan exit-code probe failed', {
      workspaceId: ws.workspaceId,
      err,
    });
    exitCode = undefined;
  }
  const crashed = typeof exitCode === 'number' && exitCode !== 0;
  // Only numeric zero is positive evidence of success. Both `undefined` (unknown
  // probe) and `null` (gone/terminated handle with no recoverable status) are
  // interrupted outcomes and finalize failed rather than inventing exit 0.
  const interrupted = exitCode == null;
  const clean = exitCode === 0;
  const reportedExit = interrupted ? null : exitCode;

  // Emit a terminal RunEvent into the audit log (truthful: what the substrate
  // reports, not a fabricated success).
  if (ws.runId) {
    const event: RunEvent = {
      eventId: `event_${ws.runId}_reconcile_${clock.nowMs()}`,
      type: clean ? 'completed' : 'failed',
      taskId: ws.taskId,
      runId: ws.runId,
      message: crashed
        ? `Agent session gone after restart; exited with code ${exitCode}`
        : interrupted
          ? 'Agent session interrupted by restart; outcome unknown (finalized by reconcile)'
          : 'Agent session ended (finalized by reconcile after restart)',
      createdAt: at,
      data: {
        sessionName: ws.sessionName,
        exitCode: reportedExit,
        finalizedBy: 'reconcile',
      },
    };
    try {
      await repository.appendEvent(event);
    } catch (err) {
      logger.warn('reconcile: terminal event append failed', {
        workspaceId: ws.workspaceId,
        err,
      });
    }

    // Advance the control-plane run to a terminal state when it is still open.
    try {
      const runs = await repository.listRuns();
      const run = runs.find(r => r.runId === ws.runId);
      if (run && !isTerminalTaskRunState(run.state)) {
        await repository.upsertRun(
          transitionTaskRun(run, clean ? 'completed' : 'failed', {
            metadata: { finalizedBy: 'reconcile', exitCode: reportedExit },
          })
        );
      }
    } catch (err) {
      logger.warn('reconcile: run finalize failed', {
        workspaceId: ws.workspaceId,
        err,
      });
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
            interrupted,
            at,
          },
        },
      })
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
      await lock.release({
        workspaceId: ws.workspaceId,
        spaceId: ws.spaceId,
        taskId: ws.taskId,
      });
    } catch (err) {
      logger.warn('reconcile: orphan lock release failed', {
        workspaceId: ws.workspaceId,
        err,
      });
    }
  }

  return advanced;
}
