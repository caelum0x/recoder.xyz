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
import {
  claimTaskForWorkspace,
  releaseTaskClaim,
  emitReviewHandoff,
} from './coordination-integration.js';
import { admitWorkspace } from './resource-governor.js';
import { computePalDefaults } from './pal-plan.js';
import { decideSubstrateEntitlement } from './entitlement-gate.js';

/** Marker prefixed onto an admission-rejection error so routes can map it to 429. */
export const ADMISSION_REJECTED_PREFIX = PACKAGE_ADMISSION_REJECTED_PREFIX;

// Register execution substrates: local git worktree + tmux (default) and the
// remote Daytona sandbox. Selection is per-workspace via Workspace.substrate.
registerTmuxSubstrate();
registerDaytonaSubstrate();
registerInProcessSubstrate();

const exec = promisify(execFile);
const logger = createLogger('conductor:workspace');

/**
 * Backend create input is the engine's substrate-agnostic input, with `runtimeId`
 * RELAXED to optional: when the caller omits it, the create path lets @recoder/pal
 * DEFAULT the runtime team (and substrate) from the task's canonical TaskSpec. The
 * engine itself still receives a concrete `runtimeId` (pal-defaulted or fallback).
 */
export type CreateWorkspaceInput = Omit<
  EngineCreateWorkspaceInput,
  'runtimeId'
> & {
  runtimeId?: string;
  /**
   * The VERIFIED launching user (from `authenticateRequest` → `req.userId`), used
   * ONLY as the entitlement subject for the remote-substrate gate. It is distinct
   * from the free-text `createdBy` (which is an attribution label, not an authority)
   * and is NOT forwarded to the engine. Absent for solo / internal create paths.
   */
  userId?: string;
};

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
  upsertWorkspace: workspace =>
    Promise.resolve(repository.upsertWorkspace(workspace)),
  getWorkspace: workspaceId =>
    Promise.resolve(repository.getWorkspace(workspaceId)),
  listWorkspaces: () => Promise.resolve(repository.listWorkspaces()),
  upsertRun: run => Promise.resolve(repository.upsertRun(run)),
  listRuns: () => Promise.resolve(repository.listRuns()),
  appendEvent: event => Promise.resolve(repository.appendEvent(event)),
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
      sources: enriched.sources.map(ref => ({ source: 'bundle', ref })),
    };
  },
};

/**
 * Write-lock port over conductor-locks, ADDITIVELY fronted by the coordination
 * DISPATCH CLAIM (claim-before-launch).
 *
 * The engine calls `acquire` BEFORE provisioning/launch. We run the idempotent
 * dispatch claim of the task FIRST: if another ACTIVE workspace already holds the
 * task's claim, we surface a `conflict` in the EXACT shape of a work-lock
 * conflict so the engine refuses the duplicate launch on the proven path (no new
 * branch in the engine). Only when the claim is `claimed`/`skipped` do we proceed
 * to the existing work-lock acquire — so the proven acquire→launch→release
 * ordering and behavior is unchanged for the non-conflicting (common) case.
 *
 * `release` releases BOTH the work-lock and the dispatch claim (teardown/launch
 * failure), which frees the task for a later re-claim. DEGRADE-SAFE: a skipped
 * claim never blocks; the work-lock layer remains the sole gate exactly as today.
 */
const lockPort: WorkLockPort = {
  async acquire(input) {
    const claim = await claimTaskForWorkspace({
      workspaceId: input.workspaceId,
      spaceId: input.spaceId,
      taskId: input.taskId,
      targetPaths: input.targetPaths,
    });
    if (claim.status === 'conflict') {
      // Refuse the duplicate launch truthfully, mirroring the work-lock conflict
      // shape so the engine's existing conflict path handles it unchanged.
      return {
        status: 'conflict',
        conflicts: [
          {
            lockId: claim.conflict.claimId,
            ownerAgentId: claim.conflict.heldByAgentId,
            taskId: input.taskId,
            pathGlob: '**',
          },
        ],
      };
    }
    // claimed | skipped → proceed to the proven work-lock acquire (unchanged).
    return acquireWorkspaceLock(input);
  },
  reacquire: input => reacquireWorkspaceLock(input),
  async release(input) {
    // Release the dispatch claim first so the task is re-claimable, then the
    // work-lock (best-effort, never throws on the claim side).
    await releaseTaskClaim({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
    });
    return releaseWorkspaceLock(input);
  },
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
  start: input => {
    startRunTail(input);
  },
};

/** The proven substrate registry (tmux/daytona/in_process), as the engine view. */
const registryPort: SubstrateRegistryPort = {
  get: id => getSubstrate(id),
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

export async function getWorkspace(
  workspaceId: string
): Promise<Workspace | null> {
  return engine.getWorkspace(workspaceId);
}

/** RunEvents streamed for a workspace's run (the live terminal + lifecycle log). */
export async function listWorkspaceEvents(
  workspaceId: string
): Promise<RunEvent[]> {
  return engine.listWorkspaceEvents(workspaceId);
}

/** Transition a persisted workspace to `to` (enforced state machine) and save it. */
export async function advanceWorkspace(
  workspaceId: string,
  to: WorkspaceState,
  patch?: Partial<Workspace>,
  metadata?: Record<string, unknown>
): Promise<Workspace> {
  const workspace = await engine.advanceWorkspace(
    workspaceId,
    to,
    patch,
    metadata
  );

  // HANDOFF ON REVIEW: when a workspace enters review (awaiting_review — set on a
  // review transition or when a PR is opened), emit a coordination `review`
  // handoff transferring ownership of the task/run to the reviewer role. Recorded
  // on the real A2A handoff bus, idempotent via the durable dedup ledger (the
  // same review transition emits exactly one handoff).
  //
  // FIRE-AND-FORGET (not awaited): the persisted transition is the proven path —
  // the handoff must NEVER add latency to it (e.g. a poller relying on the state
  // flipping promptly must see no change in timing). The handoff is best-effort,
  // degrade-safe, and idempotent, so emitting it out-of-band is safe; a failure
  // here never affects the already-returned transition.
  if (to === 'awaiting_review') {
    // Defer to the next tick so even the FIRST call's synchronous engine build
    // never runs inline with the transition — zero added latency on this path.
    const handoffInput = {
      workspaceId,
      spaceId: workspace.spaceId,
      taskId: workspace.taskId,
      ...(workspace.runId ? { runId: workspace.runId } : {}),
    };
    setImmediate(() => {
      void emitReviewHandoff(handoffInput).catch(err => {
        logger.warn(
          { workspaceId, err },
          'review handoff emit failed (transition unaffected)'
        );
      });
    });
  }

  return workspace;
}

/**
 * Create a workspace: persist the record first (state of record), then provision
 * the isolated worktree + launch the agent session, persisting each transition.
 *
 * PAL DEFAULTING (real create path): when the caller did NOT pin a `runtimeId`
 * and/or `substrate`, the conductor resolves the task's canonical `TaskSpec` and
 * runs @recoder/pal's planner ONCE to DEFAULT the runtime team + substrate +
 * tool-grants/skills, and ANNOTATES the workspace record with the resulting plan
 * (incl. risk per DECISION D1 — annotation only, never a governance input). A
 * caller-provided `runtimeId`/`substrate` ALWAYS wins (no behavior change when
 * given). DEGRADE-SAFE: if the task can't be resolved or pal throws/unavailable,
 * we fall back to the prior default routing (caller runtimeId, else `claude_code`)
 * and the launch is never blocked.
 */
export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<Workspace> {
  const withBase = await resolveConcreteBaseRef(input);
  const palled = await applyPalDefaults(withBase);
  // ENTITLEMENT GATE (single chokepoint): the substrate is now FINALIZED
  // (caller-pinned or pal-defaulted). Enforce the `remote_substrate` capability
  // against the launching user's real plan BEFORE the engine launches. Remote
  // (`daytona`) requested without the entitlement degrades to local tmux (the
  // secure default); the truthful reason is annotated for the cockpit. The gate
  // never throws and never blocks the launch (see entitlement-gate.ts contract).
  const effective = await applyEntitlementGate(input.userId, palled);
  return engine.createWorkspace(effective);
}

/**
 * Run the finalized substrate through the conductor entitlement gate and strip the
 * non-engine `userId` field. Degrade-safe: on any failure the gate returns local
 * tmux for a remote request, never blocking the launch. When the gate downgrades a
 * remote request, the truthful reason is recorded under `metadata.entitlement` so
 * the cockpit can show WHY it fell back (frontend rule: evidence, never faked
 * success). Behavior-preserving for non-remote substrates (passed through unchanged).
 */
async function applyEntitlementGate(
  userId: string | undefined,
  effective: EngineCreateWorkspaceInput
): Promise<EngineCreateWorkspaceInput> {
  // Strip `userId` — it is an entitlement-subject hint, not an engine field.
  const { userId: _stripped, ...engineInput } =
    effective as EngineCreateWorkspaceInput & {
      userId?: string;
    };
  void _stripped;

  const result = await decideSubstrateEntitlement({
    userId,
    requestedSubstrate: engineInput.substrate,
  });

  // No change to substrate and nothing to annotate → preserve input exactly.
  if (!result.downgraded && result.substrate === engineInput.substrate) {
    return engineInput;
  }

  return {
    ...engineInput,
    substrate: result.substrate,
    metadata: {
      ...(engineInput.metadata ?? {}),
      // Truthful entitlement evidence for the cockpit (only when the gate acted).
      entitlement: {
        requestedSubstrate: engineInput.substrate ?? null,
        effectiveSubstrate: result.substrate,
        plan: result.plan,
        downgraded: result.downgraded,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.decision?.reason
          ? { denyReason: result.decision.reason }
          : {}),
      },
    },
  };
}

const execFileAsync = promisify(execFile);

/**
 * Pin the workspace's base to a CONCRETE commit SHA at creation time.
 *
 * Callers usually leave `baseRef` as the symbolic `HEAD` (or omit it). The agent
 * branch forks from that commit, but the agent then commits onto its branch — and
 * once it does, `HEAD` in the worktree points at the AGENT's commit, so a later
 * `git diff HEAD` (the review diff) compares the work against itself and reports
 * ZERO changed files. Resolving the symbolic ref to the actual commit SHA NOW
 * freezes the base, so the review diff always compares the agent's work against
 * the commit it forked from — exactly what "Review branch changes" should show.
 *
 * Degrade-safe: if the repo path is missing or `git rev-parse` fails, the input
 * is returned unchanged (the prior `HEAD` behavior), never blocking the create.
 */
async function resolveConcreteBaseRef(
  input: CreateWorkspaceInput
): Promise<CreateWorkspaceInput> {
  const repoPath = (input as { repoPath?: string }).repoPath;
  if (!repoPath) return input;
  const requested = (input as { baseRef?: string }).baseRef?.trim();
  // A 40-char hex SHA is already concrete — leave it alone.
  if (requested && /^[0-9a-f]{40}$/i.test(requested)) return input;
  const ref = requested || 'HEAD';
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', ref],
      {
        maxBuffer: 1024 * 1024,
      }
    );
    const sha = stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) return input;
    return { ...input, baseRef: sha };
  } catch (err) {
    logger.warn(
      { repoPath, ref, err },
      'base ref SHA resolution failed; using symbolic ref'
    );
    return input;
  }
}

/**
 * Resolve PAL defaults for a create request on the real path. Returns the input
 * unchanged when the caller pinned BOTH runtimeId and substrate (nothing to
 * default). Otherwise it resolves the canonical TaskSpec and runs pal to fill ONLY
 * the unset fields; caller-provided values always win. Best-effort + degrade-safe.
 */
async function applyPalDefaults(
  input: CreateWorkspaceInput
): Promise<EngineCreateWorkspaceInput> {
  const hasRuntime = Boolean(input.runtimeId);
  const hasSubstrate = Boolean(input.substrate);
  // The safe fallback runtime when pal can't run (matches the planner's fallback).
  const fallbackRuntimeId = input.runtimeId || 'claude_code';
  // Caller pinned everything pal would default → nothing to do (zero pal cost).
  if (hasRuntime && hasSubstrate)
    return { ...input, runtimeId: fallbackRuntimeId };

  let task;
  try {
    const tasks = await Promise.resolve(repository.listTasks());
    task = tasks.find(t => t.taskId === input.taskId);
  } catch (err) {
    logger.warn(
      { taskId: input.taskId, err },
      'pal default skipped: task lookup failed'
    );
    return { ...input, runtimeId: fallbackRuntimeId };
  }
  if (!task) {
    // No canonical TaskSpec to plan over — keep prior routing (caller runtimeId,
    // else the safe fallback). Never block the launch.
    if (!hasRuntime) {
      logger.warn(
        { taskId: input.taskId },
        'pal default skipped: no TaskSpec found and no explicit runtimeId; using safe fallback runtime'
      );
    }
    return { ...input, runtimeId: fallbackRuntimeId };
  }

  const defaults = computePalDefaults(task);
  if (!defaults) {
    logger.warn(
      { taskId: input.taskId },
      'pal default skipped: planner unavailable; using prior routing'
    );
    return { ...input, runtimeId: fallbackRuntimeId };
  }

  logger.info(
    {
      taskId: input.taskId,
      runtimeId: hasRuntime ? input.runtimeId : defaults.runtimeId,
      substrate: hasSubstrate ? input.substrate : defaults.substrate,
      risk: defaults.annotation.risk,
    },
    'pal defaulted workspace routing (caller-pinned values preserved)'
  );

  return {
    ...input,
    // Caller-provided values WIN; pal only fills what was unset.
    runtimeId: hasRuntime ? fallbackRuntimeId : defaults.runtimeId,
    substrate: hasSubstrate ? input.substrate : defaults.substrate,
    metadata: {
      ...(input.metadata ?? {}),
      // Annotation for the cockpit (recommended team + risk). D1: risk is shown,
      // not routed on. Persisted on the workspace record via the engine.
      palPlan: defaults.annotation,
    },
  };
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
    const { stdout } = await exec(TMUX_BIN, [
      'list-sessions',
      '-F',
      '#{session_name}',
    ]);
    return stdout
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith('recoder-'));
  } catch {
    return [];
  }
}

/** Conductor worktree workspace-ids, derived from `git worktree list` paths. */
async function listConductorWorktrees(): Promise<string[]> {
  const root = process.env.CONDUCTOR_WORKTREE_ROOT || '/tmp/recoder-worktrees';
  try {
    const { stdout } = await exec('git', ['worktree', 'list', '--porcelain'], {
      cwd: process.cwd(),
    });
    return stdout
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => line.slice('worktree '.length).trim())
      .filter(path => path.startsWith(root))
      .map(path => path.slice(root.length).replace(/^\//, ''));
  } catch {
    return [];
  }
}
