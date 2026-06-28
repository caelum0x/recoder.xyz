/**
 * Conductor workspace-service — the orchestration brain.
 *
 * Owns the persisted Workspace lifecycle (control-plane state of record) and
 * drives the execution substrate (tmux + git worktrees) through it. Every state
 * change is written to the AgentOsRepository BEFORE/AFTER the substrate action,
 * so a backend restart never loses a workspace.
 *
 * The reconciler is the survivability mechanism: it queries tmux and git
 * DIRECTLY (not the orchestrator's in-memory map, which is empty after a
 * restart) and joins them against the persisted workspaces to report the true
 * state — live, orphaned sessions, orphaned worktrees, dangling records.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  isTerminalTaskRunState,
  isTerminalWorkspaceState,
  transitionTaskRun,
  transitionWorkspace,
  type RunEvent,
  type TaskRun,
  type Workspace,
  type WorkspaceState,
  type WorkspaceSubstrate,
} from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import { resolveRuntimeCommand } from './runtime-commands.js';
import { enrichPrompt } from './bundle.js';
import { startRunTail } from './run-tailer.js';
import { getSubstrate, listSubstrates } from './substrate.js';
import { registerTmuxSubstrate } from './substrate-tmux.js';
import { registerDaytonaSubstrate } from './substrate-daytona.js';
import { TMUX_BIN } from './tmux-path.js';
import {
  acquireWorkspaceLock,
  reacquireWorkspaceLock,
  releaseWorkspaceLock,
} from './conductor-locks.js';
import { admitWorkspace } from './resource-governor.js';

/** Marker prefixed onto an admission-rejection error so routes can map it to 429. */
export const ADMISSION_REJECTED_PREFIX = 'admission rejected: ';

// Register execution substrates: local git worktree + tmux (default) and the
// remote Daytona sandbox. Selection is per-workspace via Workspace.substrate.
registerTmuxSubstrate();
registerDaytonaSubstrate();

const exec = promisify(execFile);
const logger = createLogger('conductor:workspace');

const repository = () => agentOsContainer.repository;

export interface CreateWorkspaceInput {
  spaceId: string;
  projectId: string;
  taskId: string;
  /** Absolute path to the git repo to branch a worktree from. */
  repoPath: string;
  /** Runtime that will drive the work (agent-os surface id, e.g. 'claude_code'). */
  runtimeId: string;
  /** Execution substrate to launch on (defaults to 'tmux_worktree'). */
  substrate?: WorkspaceSubstrate;
  /** Explicit command to run; if omitted, resolved from runtimeId + prompt. */
  command?: string;
  /** Task prompt — used to resolve the headless CLI invocation for the runtime. */
  prompt?: string;
  /** Optional model override passed to the runtime CLI. */
  model?: string;
  /** Library to enrich the prompt with docs via context7 (e.g. 'next.js'). */
  library?: string;
  createdBy: string;
  branch?: string;
  baseRef?: string;
  /** Extra env for the session (e.g. provider keys). */
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return repository().listWorkspaces();
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  return repository().getWorkspace(workspaceId);
}

/** RunEvents streamed for a workspace's run (the live terminal + lifecycle log). */
export async function listWorkspaceEvents(workspaceId: string) {
  const runId = `run_${workspaceId}`;
  const events = await repository().listEvents();
  return events.filter((e) => e.runId === runId);
}

/** Transition a persisted workspace to `to` (enforced state machine) and save it. */
export async function advanceWorkspace(
  workspaceId: string,
  to: WorkspaceState,
  patch?: Partial<Workspace>,
  metadata?: Record<string, unknown>,
): Promise<Workspace> {
  const current = await repository().getWorkspace(workspaceId);
  if (!current) throw new Error(`workspace not found: ${workspaceId}`);
  const transitioned = transitionWorkspace({ ...current, ...patch }, to, { metadata });
  return repository().upsertWorkspace(transitioned);
}

/**
 * Create a workspace: persist the record first (state of record), then provision
 * the isolated worktree + launch the agent session, persisting each transition.
 *
 * v1 couples provisioning and launch (tmux-orchestrator.startSession does both),
 * so we step created → setting_up → ready → running around that single call.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspaceId = `ws_${randomUUID()}`;
  const branch = input.branch || `recoder/${workspaceId}`;

  // Enrich the prompt with owned knowledge (task constraints, git-nexus repo
  // context, context7 docs) and record provenance, then resolve the real headless
  // CLI invocation. An explicit command bypasses enrichment. Fails fast (no stub)
  // if neither command nor a usable prompt is given.
  let knowledgeSources: string[] = [];
  let command = input.command;
  if (!command) {
    const enriched = await enrichPrompt({
      prompt: input.prompt ?? '',
      taskId: input.taskId,
      repoPath: input.repoPath,
      library: input.library,
      userId: input.createdBy,
    });
    knowledgeSources = enriched.sources;
    command = resolveRuntimeCommand(input.runtimeId, { prompt: enriched.prompt, model: input.model }).commandLine;
  }

  // Honor the requested substrate when it is registered; otherwise default to the
  // local tmux+worktree substrate. Never launch on an unknown substrate id.
  const requestedSubstrate = input.substrate;
  const substrate: WorkspaceSubstrate =
    requestedSubstrate && listSubstrates().includes(requestedSubstrate)
      ? requestedSubstrate
      : 'tmux_worktree';

  let workspace: Workspace = {
    workspaceId,
    spaceId: input.spaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runtimeId: input.runtimeId,
    substrate,
    branch,
    baseRef: input.baseRef || 'HEAD',
    state: 'created',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    metadata: {
      ...(input.metadata ?? {}),
      ...(knowledgeSources.length ? { knowledgeSources } : {}),
    },
  };
  // State of record FIRST — survives a crash mid-provision.
  workspace = await repository().upsertWorkspace(workspace);

  // Resource governor: enforce per-project/user parallelism caps + disk/session
  // limits on the PRIMARY path (not just the multi-agent workflow runner). If
  // admission is refused, short-circuit to `failed` with the truthful reason and
  // do NOT launch — never silently over-admit and exhaust the box.
  const admission = await admitWorkspace(input.projectId, input.createdBy);
  if (!admission.admitted) {
    const message = `${ADMISSION_REJECTED_PREFIX}${admission.reason ?? 'resource limit reached'}`;
    workspace = await repository().upsertWorkspace(
      transitionWorkspace(workspace, 'failed', {
        metadata: { error: message, admission: { reason: admission.reason, current: admission.current } },
      }),
    );
    logger.warn(
      { workspaceId, projectId: input.projectId, createdBy: input.createdBy, reason: admission.reason },
      'workspace launch refused — resource admission rejected',
    );
    return workspace;
  }

  // Collision-prevention moat: claim an exclusive write-lock over this
  // workspace's scope BEFORE launching the agent. If another active workspace
  // already holds an overlapping path in the same repo, do NOT launch — fail the
  // workspace with a truthful conflict naming the holder. Degrade-safe: when the
  // coordination engine is unavailable, locking is skipped (workspace launches).
  const targetPaths = await resolveTargetPaths(input.taskId);

  // Persist the lock scope (origin repo + declared write surface) into the record
  // so reconcile() can re-acquire the EXACT same lock after a backend restart
  // (the in-memory lock store is empty on restart). Without this, a surviving
  // live workspace would no longer hold its scope and a peer could over-claim it.
  workspace = await repository().upsertWorkspace({
    ...workspace,
    updatedAt: new Date().toISOString(),
    metadata: {
      ...(workspace.metadata ?? {}),
      lockScope: { repo: input.repoPath, ...(targetPaths ? { targetPaths } : {}) },
    },
  });

  const lock = await acquireWorkspaceLock({
    workspaceId,
    spaceId: input.spaceId,
    taskId: input.taskId,
    repo: input.repoPath,
    targetPaths,
  });
  if (lock.status === 'conflict') {
    const detail = lock.conflicts
      .map((c) => `${c.pathGlob} held by workspace ${c.ownerAgentId} (task ${c.taskId})`)
      .join('; ');
    const message = `write-lock conflict: ${detail}`;
    workspace = await repository().upsertWorkspace(
      transitionWorkspace(workspace, 'failed', {
        metadata: { error: message, lockConflicts: lock.conflicts },
      }),
    );
    logger.warn({ workspaceId, repo: input.repoPath, conflicts: lock.conflicts }, 'workspace launch refused — lock conflict');
    return workspace;
  }

  let lockHeld = lock.status === 'acquired';

  try {
    workspace = await repository().upsertWorkspace(transitionWorkspace(workspace, 'setting_up'));

    const handle = await getSubstrate(workspace.substrate).launch({
      workspaceId,
      command,
      repoPath: input.repoPath,
      branch,
      baseRef: input.baseRef || 'HEAD',
      env: input.env,
    });

    workspace = await repository().upsertWorkspace(
      transitionWorkspace(
        { ...workspace, worktreePath: handle.worktreePath, sessionName: handle.sessionName },
        'ready',
      ),
    );
    // Create the control-plane run and start streaming terminal output into the
    // RunEvent log (the audit trail + UI/A2A source).
    const runId = `run_${workspaceId}`;
    const run: TaskRun = {
      runId,
      taskId: input.taskId,
      spaceId: input.spaceId,
      state: 'running',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { workspaceId, runtimeId: input.runtimeId },
    };
    await repository().upsertRun(run);

    workspace = await repository().upsertWorkspace(transitionWorkspace({ ...workspace, runId }, 'running'));

    startRunTail({
      workspaceId,
      taskId: input.taskId,
      runId,
      substrate: workspace.substrate,
      sessionName: handle.sessionName ?? handle.ref,
      worktreePath: handle.worktreePath,
    });

    logger.info({ workspaceId, runId, branch, session: handle.sessionName ?? handle.ref }, 'workspace created + running');
    return workspace;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Provisioning/launch failed — release the write-lock so the scope is freed
    // for another workspace (a held lock with no live agent would block forever).
    if (lockHeld) {
      try {
        await releaseWorkspaceLock({
          workspaceId,
          spaceId: input.spaceId,
          taskId: input.taskId,
          repo: input.repoPath,
        });
      } catch (releaseErr) {
        logger.warn({ workspaceId, releaseErr }, 'lock release after launch failure failed');
      }
      lockHeld = false;
    }
    workspace = await repository().upsertWorkspace(
      transitionWorkspace(workspace, 'failed', { metadata: { error: message } }),
    );
    logger.error({ workspaceId, err }, 'workspace provisioning failed');
    return workspace;
  }
}

/**
 * Resolve a task's declared write surface (`TaskSpec.targetPaths`) for lock
 * scoping. Returns `undefined` when the task is unknown — the lock layer then
 * falls back to a repo-wide claim. Never throws: a lookup failure degrades to an
 * undeclared scope rather than blocking workspace creation.
 */
async function resolveTargetPaths(taskId: string): Promise<string[] | undefined> {
  try {
    const tasks = await repository().listTasks();
    const task = tasks.find((t) => t.taskId === taskId);
    return task?.targetPaths;
  } catch (err) {
    logger.warn({ taskId, err }, 'resolveTargetPaths failed; using repo-wide lock scope');
    return undefined;
  }
}

export interface ReconcileReport {
  /** Workspaces whose tmux session is still alive. */
  live: string[];
  /** Live workspaces whose run-tailer was (re)bound this pass (streaming resumed). */
  rebound: string[];
  /** Live workspaces whose write-lock was re-acquired this pass (scope re-held). */
  relocked: string[];
  /** Non-terminal workspaces whose tmux session is gone (agent ended/crashed). */
  orphanedWorkspaces: string[];
  /** Orphaned workspaces finalized this pass (advanced to a terminal record state). */
  finalized: string[];
  /** Live tmux sessions with no matching workspace record. */
  orphanedSessions: string[];
  /** Conductor worktrees on disk with no matching workspace record. */
  orphanedWorktrees: string[];
  checkedAt: string;
}

/** Persisted lock scope (origin repo + declared write surface) for re-acquire on reconcile. */
interface PersistedLockScope {
  repo: string;
  targetPaths?: string[];
}

/** Read the persisted lock scope a workspace was launched with, if recorded. */
function readLockScope(workspace: Workspace): PersistedLockScope | undefined {
  const raw = workspace.metadata?.lockScope;
  if (!raw || typeof raw !== 'object') return undefined;
  const scope = raw as Record<string, unknown>;
  if (typeof scope.repo !== 'string') return undefined;
  const targetPaths = Array.isArray(scope.targetPaths)
    ? scope.targetPaths.filter((p): p is string => typeof p === 'string')
    : undefined;
  return { repo: scope.repo, targetPaths };
}

/**
 * Join persisted workspaces against the REAL substrate state (tmux + git,
 * queried directly so it is correct even after a backend restart). Reports the
 * truth; it does not silently mutate execution — orphaned non-terminal
 * workspaces are flagged in metadata for an operator/policy to resolve.
 */
export async function reconcile(): Promise<ReconcileReport> {
  const [workspaces, liveSessions, conductorWorktrees] = await Promise.all([
    repository().listWorkspaces(),
    listLiveTmuxSessions(),
    listConductorWorktrees(),
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
      if (await rebindLiveWorkspace(ws)) rebound.push(ws.workspaceId);
      if (await relockLiveWorkspace(ws)) relocked.push(ws.workspaceId);
    } else if (ws.state === 'running' || ws.state === 'awaiting_approval') {
      // CRASHED ORPHAN: a non-terminal workspace whose session is gone. Finalize
      // it — read the true exit code, emit a terminal RunEvent, advance the
      // record + run to a terminal state, and free its lock — instead of leaving
      // it dangling forever.
      orphanedWorkspaces.push(ws.workspaceId);
      if (await finalizeOrphanedWorkspace(ws)) finalized.push(ws.workspaceId);
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
    checkedAt: new Date().toISOString(),
  };
  logger.info(report, 'conductor reconcile complete');
  return report;
}

/**
 * Rebind the run-tailer for a live workspace so terminal streaming resumes after
 * a backend restart (the in-memory tail map is empty on restart). Idempotent:
 * `startRunTail` no-ops if a tail is already active for this workspace, so a
 * reconcile that runs while the original tail is still alive is harmless. Returns
 * true when a (re)bind was attempted, false when the record lacks a run/session
 * to tail. Never throws — a tail rebind failure must not fail reconcile.
 */
async function rebindLiveWorkspace(ws: Workspace): Promise<boolean> {
  if (!ws.runId || !ws.sessionName) return false;
  try {
    startRunTail({
      workspaceId: ws.workspaceId,
      taskId: ws.taskId,
      runId: ws.runId,
      substrate: ws.substrate,
      sessionName: ws.sessionName,
      worktreePath: ws.worktreePath,
    });
    return true;
  } catch (err) {
    logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: run-tail rebind failed');
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
async function relockLiveWorkspace(ws: Workspace): Promise<boolean> {
  const scope = readLockScope(ws);
  if (!scope) return false;
  try {
    const result = await reacquireWorkspaceLock({
      workspaceId: ws.workspaceId,
      spaceId: ws.spaceId,
      taskId: ws.taskId,
      repo: scope.repo,
      targetPaths: scope.targetPaths,
    });
    if (result.status === 'acquired') return true;
    if (result.status === 'conflict') {
      logger.warn(
        { workspaceId: ws.workspaceId, conflicts: result.conflicts },
        'reconcile: live workspace lost its lock to a peer (scope contended)',
      );
    }
    return false;
  } catch (err) {
    logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: lock re-acquire failed');
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
async function finalizeOrphanedWorkspace(ws: Workspace): Promise<boolean> {
  const at = new Date().toISOString();

  // Read the true exit code from the substrate (distinguishes clean finish from
  // a crash). A gone handle / unknown code is treated as a clean completion.
  let exitCode: number | null | undefined;
  try {
    const substrate = getSubstrate(ws.substrate);
    if (substrate.exitCode) {
      exitCode = await substrate.exitCode({
        ref: ws.workspaceId,
        sessionName: ws.sessionName,
        worktreePath: ws.worktreePath,
      });
    }
  } catch (err) {
    logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: orphan exit-code probe failed');
    exitCode = undefined;
  }
  const crashed = typeof exitCode === 'number' && exitCode !== 0;

  // Emit a terminal RunEvent into the audit log (truthful: what the substrate
  // reports, not a fabricated success).
  if (ws.runId) {
    const event: RunEvent = {
      eventId: `event_${ws.runId}_reconcile_${Date.now()}`,
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
      await repository().appendEvent(event);
    } catch (err) {
      logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: terminal event append failed');
    }

    // Advance the control-plane run to a terminal state when it is still open.
    try {
      const runs = await repository().listRuns();
      const run = runs.find((r) => r.runId === ws.runId);
      if (run && !isTerminalTaskRunState(run.state)) {
        await repository().upsertRun(
          transitionTaskRun(run, crashed ? 'failed' : 'completed', {
            metadata: { finalizedBy: 'reconcile', exitCode: exitCode ?? 0 },
          }),
        );
      }
    } catch (err) {
      logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: run finalize failed');
    }
  }

  // Advance the workspace record to a terminal lifecycle state. running |
  // awaiting_approval → failed is legal; a clean completion is recorded as
  // failed-with-clean-exit metadata since the lifecycle has no non-merge
  // "completed" state (merged is reserved for the review/merge path).
  let advanced = false;
  try {
    await repository().upsertWorkspace(
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
    logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: workspace finalize transition failed');
  }

  // Free the write-lock so the orphan's scope is released for the next workspace.
  try {
    await releaseWorkspaceLock({ workspaceId: ws.workspaceId, spaceId: ws.spaceId, taskId: ws.taskId });
  } catch (err) {
    logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile: orphan lock release failed');
  }

  return advanced;
}

/** Live tmux session names, queried directly (survives backend restart). */
async function listLiveTmuxSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    return stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('recoder-'));
  } catch {
    return [];
  }
}

/** Conductor worktree workspace-ids, derived from `git worktree list` paths. */
async function listConductorWorktrees(): Promise<string[]> {
  const root = process.env.CONDUCTOR_WORKTREE_ROOT || '/tmp/recoder-worktrees';
  try {
    const { stdout } = await exec('git', ['worktree', 'list', '--porcelain'], { cwd: process.cwd() });
    return stdout
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length).trim())
      .filter((path) => path.startsWith(root))
      .map((path) => path.slice(root.length).replace(/^\//, ''));
  } catch {
    return [];
  }
}
