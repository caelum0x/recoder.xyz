/**
 * Conductor workspace-service — BACKEND ADAPTER over @recoder/substrate's
 * engine + reconciler (substrate.md §4.5/§4.6 / §12 step 4).
 *
 * The persisted Workspace lifecycle (create → setting_up → ready → running, with
 * the record-of-record persisted BEFORE launch) and the restart-survivability
 * reconciler now live (substrate-pure, IO-free) in the package. This file is the
 * thin wiring: it constructs the package `WorkspaceEngine` with the backend's
 * concrete ports —
 *   - repository  → `agentOsContainer.repository` (canonical state of record)
 *   - brain       → `bundle.enrichPrompt` (prompt enrichment + provenance)
 *   - lock        → `conductor-locks` (acquire/reacquire/release the write-lock)
 *   - admission   → `resource-governor.admitWorkspace`
 *   - runTailer   → `run-tailer.startRunTail` (stream terminal output → RunEvents)
 *   - registry    → `substrate.getSubstrate/listSubstrates` (the proven impls)
 *   - scan        → direct tmux/git queries (live sessions + worktrees on disk)
 * — and re-exports `createWorkspace`/`advanceWorkspace`/`getWorkspace`/
 * `listWorkspaces`/`listWorkspaceEvents`/`reconcile`/`ADMISSION_REJECTED_PREFIX`
 * with IDENTICAL signatures so conductor.routes / a2a-entry / review /
 * run-tailer / completion-watcher callers are UNCHANGED. The proven live-run path
 * (real `claude -p` through tmux+worktree) behaves identically — only relocated
 * behind ports.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  type RunEvent,
  type Workspace,
  type WorkspaceState,
  type WorkspaceSubstrate,
} from '@recoder/agent-os';
import {
  WorkspaceEngine,
  reconcile as reconcileEngine,
  systemClock,
  uuidId,
  ADMISSION_REJECTED_PREFIX as PACKAGE_ADMISSION_REJECTED_PREFIX,
  type WorkspaceEngineDeps,
  type CreateWorkspaceInput as EngineCreateWorkspaceInput,
  type ReconcileReport as EngineReconcileReport,
  type WorkspaceRepositoryPort,
  type BrainPort,
  type WorkLockPort,
  type AdmissionPort,
  type RunTailerPort,
  type SubstrateScanPort,
  type SubstrateRegistryPort,
  type LoggerPort,
} from '@recoder/substrate';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import { enrichPrompt } from './bundle.js';
import { startRunTail } from './run-tailer.js';
import { getSubstrate, listSubstrates } from './substrate.js';
import { registerTmuxSubstrate } from './substrate-tmux.js';
import { registerDaytonaSubstrate } from './substrate-daytona.js';
import { registerInProcessSubstrate } from './substrate-in-process.js';
import { TMUX_BIN } from './tmux-path.js';
import {
  acquireWorkspaceLock,
  reacquireWorkspaceLock,
  releaseWorkspaceLock,
} from './conductor-locks.js';
import { admitWorkspace } from './resource-governor.js';

/** Marker prefixed onto an admission-rejection error so routes can map it to 429. */
export const ADMISSION_REJECTED_PREFIX = PACKAGE_ADMISSION_REJECTED_PREFIX;

// Register execution substrates: local git worktree + tmux (default) and the
// remote Daytona sandbox. Selection is per-workspace via Workspace.substrate.
registerTmuxSubstrate();
registerDaytonaSubstrate();
registerInProcessSubstrate();

const exec = promisify(execFile);
const logger = createLogger('conductor:workspace');

/** Backend create input is the engine's substrate-agnostic input, kept identical. */
export type CreateWorkspaceInput = EngineCreateWorkspaceInput;

/** Reconcile report shape, re-exported identically for callers (string-id buckets). */
export type ReconcileReport = EngineReconcileReport;

/** Bridge the package LoggerPort (message, context) to the pino-style logger. */
const loggerPort: LoggerPort = {
  info: (message, context) => logger.info(context ?? {}, message),
  warn: (message, context) => logger.warn(context ?? {}, message),
  error: (message, context) => logger.error(context ?? {}, message),
};

/**
 * Canonical state of record over the agent-os repository. The repository methods
 * return `T | Promise<T>` (sync for the in-memory driver, async for Postgres);
 * each port method awaits to normalize that to `Promise<T>`. A pure passthrough —
 * no behavior added, just the seam the engine codes to.
 */
const repository = agentOsContainer.repository;
const repositoryPort: WorkspaceRepositoryPort = {
  upsertWorkspace: (workspace) => Promise.resolve(repository.upsertWorkspace(workspace)),
  getWorkspace: (workspaceId) => Promise.resolve(repository.getWorkspace(workspaceId)),
  listWorkspaces: () => Promise.resolve(repository.listWorkspaces()),
  upsertRun: (run) => Promise.resolve(repository.upsertRun(run)),
  listRuns: () => Promise.resolve(repository.listRuns()),
  appendEvent: (event) => Promise.resolve(repository.appendEvent(event)),
  listEvents: () => Promise.resolve(repository.listEvents()),
  listTasks: () => Promise.resolve(repository.listTasks()),
};

/**
 * Prompt-enrichment port over bundle.enrichPrompt. The bundle returns provenance
 * as a `string[]`; map each entry into a BrainProvenanceRef whose `.ref` is the
 * original string so the engine writes the SAME `knowledgeSources` string array
 * into the workspace metadata as before.
 */
const brainPort: BrainPort = {
  async enrichPrompt(input) {
    const enriched = await enrichPrompt({
      prompt: input.prompt,
      taskId: input.taskId,
      repoPath: input.repoPath,
      library: input.library,
      userId: input.userId,
    });
    return {
      prompt: enriched.prompt,
      sources: enriched.sources.map((ref) => ({ source: 'bundle', ref })),
    };
  },
};

/** Write-lock port over conductor-locks (acquire before launch; reacquire/release). */
const lockPort: WorkLockPort = {
  acquire: (input) => acquireWorkspaceLock(input),
  reacquire: (input) => reacquireWorkspaceLock(input),
  release: (input) => releaseWorkspaceLock(input),
};

/** Resource-governor admission port. */
const admissionPort: AdmissionPort = {
  async admit(projectId, createdBy) {
    const decision = await admitWorkspace(projectId, createdBy);
    return {
      admitted: decision.admitted,
      reason: decision.reason,
      current: decision.current,
    };
  },
};

/** Run-tailer attach port over the backend run-tailer adapter. */
const runTailerPort: RunTailerPort = {
  start: (input) => {
    startRunTail(input);
  },
};

/** The proven substrate registry (tmux/daytona/in_process), as the engine view. */
const registryPort: SubstrateRegistryPort = {
  get: (id) => getSubstrate(id),
  list: () => listSubstrates(),
};

/**
 * Direct-substrate scan port for reconcile: query live tmux sessions + conductor
 * worktrees DIRECTLY (correct even after a backend restart, when the in-memory
 * session map is empty). Best-effort: a probe failure returns an empty list.
 */
const scanPort: SubstrateScanPort = {
  listLiveSessions: listLiveTmuxSessions,
  listConductorWorktrees,
};

/** The composed engine dependency bundle (one shared instance per process). */
const engineDeps: WorkspaceEngineDeps = {
  registry: registryPort,
  repository: repositoryPort,
  brain: brainPort,
  lock: lockPort,
  admission: admissionPort,
  runTailer: runTailerPort,
  scan: scanPort,
  logger: loggerPort,
  clock: systemClock,
  id: uuidId,
};

const engine = new WorkspaceEngine(engineDeps);

export async function listWorkspaces(): Promise<Workspace[]> {
  return engine.listWorkspaces();
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  return engine.getWorkspace(workspaceId);
}

/** RunEvents streamed for a workspace's run (the live terminal + lifecycle log). */
export async function listWorkspaceEvents(workspaceId: string): Promise<RunEvent[]> {
  return engine.listWorkspaceEvents(workspaceId);
}

/** Transition a persisted workspace to `to` (enforced state machine) and save it. */
export async function advanceWorkspace(
  workspaceId: string,
  to: WorkspaceState,
  patch?: Partial<Workspace>,
  metadata?: Record<string, unknown>,
): Promise<Workspace> {
  return engine.advanceWorkspace(workspaceId, to, patch, metadata);
}

/**
 * Create a workspace: persist the record first (state of record), then provision
 * the isolated worktree + launch the agent session, persisting each transition.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  return engine.createWorkspace(input);
}

/**
 * Join persisted workspaces against the REAL substrate state (tmux + git,
 * queried directly so it is correct even after a backend restart). Reports the
 * truth; it does not silently mutate execution — orphaned non-terminal
 * workspaces are finalized with truthful metadata for an operator/policy.
 */
export async function reconcile(): Promise<ReconcileReport> {
  return reconcileEngine(engineDeps);
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
