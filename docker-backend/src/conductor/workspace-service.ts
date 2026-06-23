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
  isTerminalWorkspaceState,
  transitionWorkspace,
  type TaskRun,
  type Workspace,
  type WorkspaceState,
} from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import { resolveRuntimeCommand } from './runtime-commands.js';
import { enrichPrompt } from './bundle.js';
import { startRunTail } from './run-tailer.js';
import { getSubstrate } from './substrate.js';
import { registerTmuxSubstrate } from './substrate-tmux.js';

// Register the default execution substrate (local git worktree + tmux).
registerTmuxSubstrate();

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

  let workspace: Workspace = {
    workspaceId,
    spaceId: input.spaceId,
    projectId: input.projectId,
    taskId: input.taskId,
    runtimeId: input.runtimeId,
    substrate: 'tmux_worktree',
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
    workspace = await repository().upsertWorkspace(
      transitionWorkspace(workspace, 'failed', { metadata: { error: message } }),
    );
    logger.error({ workspaceId, err }, 'workspace provisioning failed');
    return workspace;
  }
}

export interface ReconcileReport {
  /** Workspaces whose tmux session is still alive. */
  live: string[];
  /** Non-terminal workspaces whose tmux session is gone (agent ended/crashed). */
  orphanedWorkspaces: string[];
  /** Live tmux sessions with no matching workspace record. */
  orphanedSessions: string[];
  /** Conductor worktrees on disk with no matching workspace record. */
  orphanedWorktrees: string[];
  checkedAt: string;
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
  const orphanedWorkspaces: string[] = [];

  for (const ws of workspaces) {
    if (ws.sessionName) knownSessionNames.add(ws.sessionName);
    if (isTerminalWorkspaceState(ws.state)) continue;
    if (ws.sessionName && sessionSet.has(ws.sessionName)) {
      live.push(ws.workspaceId);
    } else if (ws.state === 'running' || ws.state === 'awaiting_approval') {
      orphanedWorkspaces.push(ws.workspaceId);
      try {
        await repository().upsertWorkspace({
          ...ws,
          updatedAt: new Date().toISOString(),
          metadata: { ...(ws.metadata ?? {}), reconcile: { sessionMissing: true, at: new Date().toISOString() } },
        });
      } catch (err) {
        logger.warn({ workspaceId: ws.workspaceId, err }, 'reconcile flag failed');
      }
    }
  }

  const knownWorkspaceIds = new Set(workspaces.map((w) => w.workspaceId));
  const orphanedSessions = liveSessions.filter((name) => !knownSessionNames.has(name));
  const orphanedWorktrees = [...worktreeWorkspaceIds].filter((id) => !knownWorkspaceIds.has(id));

  const report: ReconcileReport = {
    live,
    orphanedWorkspaces,
    orphanedSessions,
    orphanedWorktrees,
    checkedAt: new Date().toISOString(),
  };
  logger.info(report, 'conductor reconcile complete');
  return report;
}

/** Live tmux session names, queried directly (survives backend restart). */
async function listLiveTmuxSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec('tmux', ['list-sessions', '-F', '#{session_name}']);
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
