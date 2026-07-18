/**
 * `ConductorComposer` — the composer that fuses the terminal product into one
 * module (ARCHITECTURE §3). It:
 *  - slices the injected `AppConfig` into the typed {@link ConductorConfig},
 *  - builds the substrate registry (over injected concrete substrates) + truthful
 *    availability, the workspace repository (over the persistence executor), the
 *    degrade-safe run-tailer / substrate-scan, and the durable+live run-event sink,
 *  - constructs the `@recoder/substrate` `WorkspaceEngine` behind those ports,
 *  - routes EVERY write (create / steer / reconcile) through the injected
 *    governance gate (`decide` before, `recordAudit` after),
 *  - owns the `/terminal` + `/sync` terminal surface ({@link TerminalStreamPort}),
 *  - exposes the `/api/conductor` router, read-only MCP tools, and truthful health.
 *
 * No `process.env` reads (config injected); no top-level singletons; every
 * stateful path degrade-safe (no substrate ⇒ truthful launch failure; no DB ⇒
 * bounded in-process store; gate deny ⇒ the write is blocked, never faked).
 */
import { Router } from 'express';
import {
  WorkspaceEngine,
  reconcile as substrateReconcile,
  systemClock,
  uuidId,
  type CreateWorkspaceInput,
  type ReconcileReport,
  type WorkspaceEngineDeps,
} from '@recoder/substrate';
import type { RunEvent, Workspace, WorkspaceState, WorkspaceSubstrate } from '@recoder/agent-os';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { Principal } from '../identity/types.js';
import { sliceConductorConfig, type ConductorConfig } from './config.js';
import type { GateVerdict, TerminalStreamPort, GithubStatusPort, GithubStatusView, GithubRepoView, SteerTransportPort } from './ports/index.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type { UsageMeterPort } from './ports/usage-meter.port.js';
import type { RunEventSinkPort } from './ports/run-event-sink.port.js';
import type { WorkspaceRepositoryPort } from './ports/workspace-repository.port.js';
import type {
  ReconcileFindingView,
  SteerInput,
  SubstrateAvailabilityView,
  SubstrateKind,
  WorkspaceView,
} from './types.js';
import { classifyAttention, type AttentionResult } from './attention/attention-classifier.js';
import type { ConductorModule, ConductorModuleDeps } from './index.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import {
  selectSubstrateForRuntime,
  isOpenfangRuntime,
} from './adapters/runtime-substrate-selector.js';
import { createCompletionHookSink } from './adapters/completion-hook.adapter.js';
import { toLoggerPort } from './adapters/logger.adapter.js';
import { createConductorRegistry, type ConductorRegistry } from './adapters/substrate-registry.adapter.js';
import { listConductorRuntimes, type ConductorRuntimeView } from './adapters/runtime-listing.adapter.js';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import { createRunEventSink } from './adapters/run-event-sink.adapter.js';
import { createRunTailer, type ConductorRunTailer } from './adapters/run-tailer.adapter.js';
import { createSubstrateScan } from './adapters/substrate-scan.adapter.js';
import { TerminalStreamService } from './terminal/terminal-stream.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';
import { buildConductorMcpTools } from './mcp/conductor-engine.js';
import { buildConductorWriteTools } from './mcp/conductor-write-tools.js';
import type { McpInjectPort } from './ports/mcp-inject.port.js';
import { buildConductorHealth } from './health.js';
import {
  conductorAuditEntry,
  guardConductorWrite,
  recordConductorAudit,
} from './audit/conductor-audit.js';
import {
  archiveWorkspace as archiveWorkspaceOp,
  workspaceDiff as workspaceDiffOp,
  workspaceTree as workspaceTreeOp,
  type ReviewOpsDeps,
  type WorkspaceDiffView,
  type WorkspaceTreeView,
} from './review/workspace-review.ops.js';
import {
  createWorkspacePr as createWorkspacePrOp,
  mergeWorkspace as mergeWorkspaceOp,
  type CreatePrInput,
  type CreatePrResultView,
  type MergeInput,
  type MergeResultView,
  type PublishOpsDeps,
} from './review/workspace-publish.ops.js';
import {
  continueWorkspace as continueWorkspaceOp,
  type ContinueOpsDeps,
  type ContinueWorkspaceInput,
  type ContinueWorkspaceResult,
} from './review/workspace-continue.ops.js';
import { normalizeLocalPreviewUrl } from './review/preview-url-guard.js';
import { detectDevCommand, type DevCommandView } from './adapters/dev-command.adapter.js';

/** The create request the routes/callers build (createdBy is stamped from the principal). */
export type CreateConductorWorkspaceInput = Omit<CreateWorkspaceInput, 'createdBy'>;

/** How many trailing terminal lines the attention probe captures. */
const ATTENTION_TAIL_LINES = 60;

/**
 * The outcome of a governed conductor write. `ok` reflects whether the action was
 * PERFORMED (gate allowed AND execution succeeded); `verdict` is always present;
 * `reason` carries the truthful blocker when `ok:false`.
 */
export interface ConductorWriteResult<T> {
  readonly ok: boolean;
  readonly verdict: GateVerdict;
  readonly value?: T;
  readonly reason?: string;
}

/** States a `stop` may act on — exactly those with a legal `→ cancelled` transition. */
const STOPPABLE_STATES: readonly WorkspaceState[] = [
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
];

/**
 * Legal `advance` targets — the PURE lifecycle steps of the review → merge flow
 * (RECODER-PRODUCT-DESIGN). Side-effectful/evidence-bearing states are excluded
 * on purpose: `merging`/`merged` require `/merge` (a real git delivery),
 * `archived` requires `/archive` (teardown), and `failed` must come from a real
 * failure, never a hand-set flag. Legality of the specific from→to step is then
 * enforced by the canonical agent-os workspace state machine.
 */
export const ADVANCE_TARGET_STATES: readonly WorkspaceState[] = [
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
  'cancelled',
];

export class ConductorComposer implements ConductorModule {
  readonly name = 'conductor' as const;

  private readonly log: Logger;
  private readonly cfg: ConductorConfig;
  private readonly gate: ConductorModuleDeps['gate'];
  private readonly middleware: ConductorModuleDeps['middleware'];
  private readonly registry: ConductorRegistry;
  private readonly repository: WorkspaceRepositoryPort;
  private readonly tailer: ConductorRunTailer;
  private readonly terminalService: TerminalStreamService;
  private readonly engine: WorkspaceEngine;
  private readonly engineDeps: WorkspaceEngineDeps;
  /** OPTIONAL memory-backed brain (recall on launch + harvest on completion). */
  private readonly brain?: ConductorBrainMemory;
  /** OPTIONAL code-intel seam (recodergit index + beads issue-graph track/close). */
  private readonly codeIntel?: CodeIntelPort;
  /** OPTIONAL GitHub identity seam (`GET /github/status`); absent ⇒ truthful not-connected. */
  private readonly github?: GithubStatusPort;
  /** OPTIONAL live send-keys transport; absent ⇒ steering refuses truthfully. */
  private readonly steerTransport?: SteerTransportPort;
  /** OPTIONAL per-worktree `.mcp.json` injector (Recoder toolbelt); absent ⇒ truthful skip. */
  private readonly mcpInject?: McpInjectPort;
  /** OPTIONAL pre-dispatch quota gate (set by bootstrap; absent ⇒ degrade OPEN). */
  private entitlementGate?: EntitlementGate;
  /** OPTIONAL usage-meter emitter (set by bootstrap; absent ⇒ no per-run metering). */
  private usageMeter?: UsageMeterPort;
  private started = false;

  constructor(deps: ConductorModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceConductorConfig(deps.config, deps.overrides ?? {});
    this.gate = deps.gate;
    this.middleware = deps.middleware;
    this.brain = deps.brain;
    this.codeIntel = deps.codeIntel;
    this.github = deps.githubStatus;
    this.steerTransport = deps.steerTransport;
    this.mcpInject = deps.mcpInject;

    const loggerPort = toLoggerPort(this.log);

    // Substrate registry + truthful availability (empty ⇒ launches fail truthfully).
    this.registry = createConductorRegistry({
      config: this.cfg,
      ...(deps.substrates ? { substrates: deps.substrates } : {}),
    });

    // Workspace repository over the persistence executor (degrade-safe in-process).
    this.repository =
      deps.repository ?? createWorkspaceRepository({ executor: deps.executor });

    // Terminal surface owns the sync hub; steering is gated through this composer.
    this.terminalService = new TerminalStreamService({
      logger: this.log,
      steer: async (input, ctx) => {
        const result = await this.steerWorkspace(input, ctx.principal);
        if (!result.ok) throw new Error(result.reason ?? 'steer denied');
      },
    });

    // Durable + live run-event sink; the tailer emits through it. When an external
    // state-of-record sink is injected (the agent-os RunEvent bus, adapted at the
    // composition root), fan out to it FIRST so the control plane sees every event,
    // then to the conductor-local durable+live sink. A failing external ingest is
    // isolated (logged, swallowed) so the live terminal stream never stalls.
    const localSink = createRunEventSink({
      repository: this.repository,
      publish: (event) => this.terminalService.publishSync(event),
      publishRun: (workspaceId, event) => this.terminalService.publishRunEvent(workspaceId, event),
      logger: this.log,
    });
    const fannedSink = composeRunEventSink(localSink, deps.runEventSink, this.log);
    // Terminal-event hook (h + i): on a `completed`/`failed` RunEvent the run flow
    // HARVESTS an evidence-backed memory candidate (brain) and CLOSES/NOTES the bd
    // issue (code-intel). Both are fire-and-forget + degrade-safe — a memory/beads
    // fault NEVER rethrows into the terminal-event path or stalls the live stream.
    const sink = createCompletionHookSink({
      inner: fannedSink,
      ...(this.brain ? { brain: this.brain } : {}),
      ...(this.codeIntel ? { codeIntel: this.codeIntel } : {}),
      // Late-bound meter: the sink reads it per terminal event, so bootstrap can
      // inject the billing meter AFTER this module is constructed (setUsageMeter).
      getMeter: () => this.usageMeter,
      getWorkspace: (id) => this.repository.getWorkspace(id),
      logger: this.log,
    });
    // Live streaming driver: the tailer drives `@recoder/substrate`
    // `startRunTail` against the REGISTERED substrate's capture/alive/exitCode,
    // and — when `tmuxControlMode` is on, the run is on `tmux_worktree`, and the
    // injected tmux binary provably speaks control mode — `selectControlModeTail`
    // wraps that substrate so real-time `%output` streams into `log` RunEvents
    // (the poller stays the liveness/exit-code authority). Any gate failing ⇒
    // the plain poll tailer, the truthful degrade. Substrate resolution is
    // truthful: an unregistered id returns `undefined` (attach marker only, no
    // fabricated stream).
    this.tailer = createRunTailer({
      sink,
      logger: this.log,
      live: {
        resolveSubstrate: (id) => {
          try {
            return this.registry.getFull(id as SubstrateKind);
          } catch {
            return undefined;
          }
        },
        config: this.cfg,
        clock: systemClock,
        id: uuidId,
        logger: loggerPort,
      },
    });

    // The engine deps assembled behind the ports.
    this.engineDeps = {
      registry: this.registry.registry,
      repository: this.repository,
      runTailer: this.tailer,
      scan: createSubstrateScan(),
      logger: loggerPort,
      clock: systemClock,
      id: uuidId,
      ...(deps.brain ? { brain: deps.brain } : {}),
      ...(deps.lock ? { lock: deps.lock } : {}),
      ...(deps.admission ? { admission: deps.admission } : {}),
    };
    this.engine = new WorkspaceEngine(this.engineDeps);
  }

  /** Inject the optional billing entitlement gate (pre-dispatch quota check). */
  setEntitlementGate(gate: EntitlementGate): void {
    this.entitlementGate = gate;
  }

  /** Inject the optional billing usage meter (per-run `agent_run` metering). */
  setUsageMeter(meter: UsageMeterPort): void {
    this.usageMeter = meter;
  }

  /**
   * Path (b) prompt enrichment: recall memory (mem0 ∪ beads ∪ candidates → rerank)
   * and fold it into the prompt the native openfang turn runs as its `command`.
   * Degrade-safe: no brain / empty prompt / recall fault ⇒ the raw prompt (or
   * `undefined` when there is no prompt, so the substrate refuses truthfully).
   */
  private async enrichOpenfangCommand(
    input: CreateConductorWorkspaceInput,
    principal: Principal,
  ): Promise<string | undefined> {
    const raw = (input.prompt ?? '').trim();
    if (!raw) return undefined;
    if (!this.brain) return input.prompt;
    try {
      const enriched = await this.brain.enrichPrompt({
        prompt: input.prompt ?? '',
        userId: principal.userId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.repoPath ? { repoPath: input.repoPath } : {}),
        ...(input.library ? { library: input.library } : {}),
      });
      return enriched.prompt;
    } catch (err) {
      this.log.warn(
        { err, runtimeId: input.runtimeId },
        'conductor openfang prompt enrich faulted — running raw prompt',
      );
      return input.prompt;
    }
  }

  /**
   * Fire-and-forget code-intel on workspace create: recodergit repo index + beads
   * issue-graph claim. Never awaited (a slow/absent engine must not block launch);
   * both calls are `void` + self-logging + degrade-safe inside the adapter.
   */
  private startCodeIntel(input: CreateConductorWorkspaceInput, workspace: Workspace): void {
    if (!this.codeIntel) return;
    const codeIntel = this.codeIntel;
    const repoId = repoIdFromRepoRef(input.projectId || input.repoPath);
    void codeIntel
      .indexRepo(input.repoPath, repoId)
      .catch((err) => this.log.warn({ err, repoId }, 'conductor recodergit index hook faulted'));
    if (input.taskId) {
      void codeIntel
        .trackWork(input.taskId, workspace.workspaceId)
        .catch((err) =>
          this.log.warn({ err, taskId: input.taskId }, 'conductor beads track hook faulted'),
        );
    }
  }

  /**
   * Inject the Recoder toolbelt `.mcp.json` into the launched workspace's worktree
   * (fire-and-forget). Truthful degrade: no injector wired, or no worktree path on
   * the record (e.g. a remote/in-process substrate without a local dir), is a
   * logged skip — never a fabricated write, never a launch failure.
   */
  private injectWorktreeMcp(workspace: Workspace): void {
    if (!this.mcpInject) return;
    if (!workspace.worktreePath) {
      this.log.debug(
        { workspaceId: workspace.workspaceId, substrate: workspace.substrate },
        'conductor .mcp.json injection skipped (no worktree path)',
      );
      return;
    }
    void this.mcpInject
      .inject(workspace.worktreePath)
      .catch((err) =>
        this.log.warn({ err, workspaceId: workspace.workspaceId }, 'conductor .mcp.json injection faulted'),
      );
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.engine.listWorkspaces();
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.engine.getWorkspace(workspaceId);
  }

  async createWorkspace(
    input: CreateConductorWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.create';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { path: input.repoPath },
      ...(input.taskId ? { taskId: input.taskId } : {}),
      metadata: { projectId: input.projectId, runtimeId: input.runtimeId, substrate: input.substrate },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };

    // Pre-dispatch billing quota gate (OPTIONAL). When wired, a run counts against
    // the subject's `agent_run` quota BEFORE the substrate launches; over-quota is
    // refused truthfully. Absent ⇒ degrade OPEN (no quota gate). A gate EXCEPTION
    // (not a deny) degrades open too — a metering hiccup must not block launches
    // the policy gate already allowed. The gate itself is fail-safe on `allowed`.
    if (this.entitlementGate) {
      try {
        const decision = await this.entitlementGate.check(principal, { quota: 'agent_run' });
        if (!decision.allowed) {
          const reason =
            decision.message ?? `run quota denied (${decision.reason ?? 'quota_exceeded'})`;
          return { ok: false, verdict, reason };
        }
      } catch (err) {
        this.log.warn(
          { err, projectId: input.projectId },
          'conductor entitlement quota check errored — degrading open',
        );
      }
    }

    try {
      // Execution-path selection (the ONE seam that splits path a/b). openfang →
      // the native in-process substrate; every CLI runtime → tmux+worktree (or the
      // caller's explicitly requested, registered substrate). Both paths converge on
      // engine.createWorkspace + the SAME capability seams below.
      const registered = this.registry.registry.list();
      const openfang = isOpenfangRuntime(input.runtimeId);
      const substrate: SubstrateKind = openfang
        ? selectSubstrateForRuntime(input.runtimeId, { registered })
        : (input.substrate ?? 'tmux_worktree');

      // Path (b): the in-process substrate runs `command` as the agent turn, so the
      // integrator enriches the prompt HERE (memory recall) and passes it as command
      // — this bypasses the CLI-only resolveRuntimeCommand. Path (a): leave command
      // undefined so WorkspaceEngine enriches (engineDeps.brain) + resolves the CLI.
      let command = input.command;
      if (openfang && !command) {
        command = await this.enrichOpenfangCommand(input, principal);
      }

      const workspace = await this.engine.createWorkspace({
        ...input,
        substrate,
        ...(command !== undefined ? { command } : {}),
        // Tag the run with its task id so the in-process substrate + tailer can
        // anchor RunEvents (path b reads RECODER_TASK_ID from env).
        ...(input.taskId
          ? { env: { ...(input.env ?? {}), RECODER_TASK_ID: input.taskId } }
          : {}),
        createdBy: principal.userId,
      });

      // Code-intel on create (a + b), fire-and-forget + degrade-safe: recodergit
      // INDEXES the repo (live code-knowledge-graph) and beads TRACKS the workspace
      // as an issue-graph node. A slow/absent engine never blocks the launch.
      this.startCodeIntel(input, workspace);

      // Point the launched agent at the GOVERNED backend MCP host: write a
      // secret-free `.mcp.json` into its worktree (merge-safe + idempotent +
      // git-excluded). Fire-and-forget + degrade-safe — no injector wired, or no
      // worktree yet, is a truthful skip that NEVER fails an allowed launch.
      this.injectWorktreeMcp(workspace);

      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId: workspace.workspaceId,
          substrate,
        }),
      );
      return { ok: true, verdict, value: workspace };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'workspace launch failed';
      this.log.error({ err, projectId: input.projectId }, 'conductor createWorkspace failed');
      return { ok: false, verdict, reason };
    }
  }

  async steerWorkspace(
    input: SteerInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<void>> {
    const action = 'workspace.steer';
    const workspace = await this.engine.getWorkspace(input.workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { path: input.workspaceId },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId: input.workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace) return { ok: false, verdict, reason: 'workspace not found' };
    if (workspace.state !== 'running') {
      return { ok: false, verdict, reason: `workspace is ${workspace.state}, not running` };
    }
    // The live send-keys transport is wired at the composition root (tmux-backed);
    // absent it, steering is refused truthfully (never faked).
    if (!this.steerTransport) {
      return {
        ok: false,
        verdict,
        reason: 'steering requires a live send-keys transport (none wired in this composition)',
      };
    }
    // No live session address ⇒ nothing to steer into (never launched / torn down).
    if (!workspace.sessionName) {
      return {
        ok: false,
        verdict,
        reason: 'workspace has no live session handle (nothing to steer)',
      };
    }
    const keys = input.keys;
    if (!keys.trim()) {
      return { ok: false, verdict, reason: 'steer keys must be non-empty' };
    }
    try {
      await this.steerTransport.sendKeys({
        sessionName: workspace.sessionName,
        keys,
        submit: input.submit ?? true,
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId: input.workspaceId,
          bytes: keys.length,
        }),
      );
      return { ok: true, verdict };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'steer delivery failed';
      this.log.warn({ err, workspaceId: input.workspaceId }, 'conductor steerWorkspace delivery failed');
      return { ok: false, verdict, reason };
    }
  }

  /**
   * Gracefully STOP a workspace's run: kill the live substrate session (the
   * worktree is PRESERVED for review), release the write-lock scope, transition
   * the record to `cancelled`, and seal the action into the audit chain.
   * Truthful throughout: a substrate kill that fails leaves the record's state
   * UNCHANGED (the agent may still be live) and surfaces the reason.
   */
  async stopWorkspace(
    workspaceId: string,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.stop';
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace) return { ok: false, verdict, reason: `workspace not found: ${workspaceId}` };
    if (!STOPPABLE_STATES.includes(workspace.state)) {
      return { ok: false, verdict, reason: `workspace is ${workspace.state}, not stoppable` };
    }

    // Kill the live session FIRST (keep the worktree — the work stays reviewable).
    // A kill fault refuses truthfully: the state of record must not claim
    // `cancelled` while the agent may still be running.
    if (workspace.sessionName || workspace.worktreePath) {
      try {
        await this.registry.getFull(workspace.substrate).teardown(
          { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
          { removeIsolation: false },
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'substrate kill failed';
        this.log.warn({ err, workspaceId }, 'conductor stopWorkspace substrate kill failed');
        return { ok: false, verdict, reason: `stop failed (session may still be live): ${reason}` };
      }
    }

    // Release the write-lock so the repo scope frees for the next workspace.
    // Degrade-safe: a lock fault never blocks the stop (the agent is dead).
    if (this.engineDeps.lock) {
      try {
        await this.engineDeps.lock.release({
          workspaceId,
          spaceId: workspace.spaceId,
          taskId: workspace.taskId,
        });
      } catch (err) {
        this.log.warn({ err, workspaceId }, 'lock release on stop failed');
      }
    }

    try {
      const stopped = await this.engine.advanceWorkspace(workspaceId, 'cancelled', undefined, {
        stoppedBy: principal.userId,
        stoppedAt: new Date().toISOString(),
      });
      this.terminalService.publishSync({
        workspaceId,
        kind: 'state',
        state: stopped.state,
        at: stopped.updatedAt,
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId, from: workspace.state }),
      );
      return { ok: true, verdict, value: stopped };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'stop failed' };
    }
  }

  /**
   * ADVANCE a workspace one lifecycle step (review → merge flow): a governed,
   * PURE state transition. Only {@link ADVANCE_TARGET_STATES} are accepted
   * (delivery states need their evidence-bearing edges); the from→to legality is
   * enforced by the canonical agent-os state machine — an illegal step is a
   * truthful refusal, never a forced write.
   */
  async advanceWorkspaceState(
    workspaceId: string,
    to: WorkspaceState,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.advance';
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId, to },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace) return { ok: false, verdict, reason: `workspace not found: ${workspaceId}` };
    if (!ADVANCE_TARGET_STATES.includes(to)) {
      return {
        ok: false,
        verdict,
        reason: `'${to}' is not an advance target (merge/archive/stop own their transitions)`,
      };
    }
    try {
      const advanced = await this.engine.advanceWorkspace(workspaceId, to, undefined, {
        advancedBy: principal.userId,
      });
      this.terminalService.publishSync({
        workspaceId,
        kind: 'state',
        state: advanced.state,
        at: advanced.updatedAt,
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          from: workspace.state,
          to,
        }),
      );
      return { ok: true, verdict, value: advanced };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'advance failed' };
    }
  }

  async reconcile(principal: Principal): Promise<ConductorWriteResult<ReconcileReport>> {
    const action = 'workspace.reconcile';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      metadata: { op: 'reconcile' },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    const report = await substrateReconcile(this.engineDeps);
    await recordConductorAudit(
      this.gate,
      conductorAuditEntry(action, principal, verdict, {
        live: report.live.length,
        orphanedWorkspaces: report.orphanedWorkspaces.length,
      }),
    );
    return { ok: true, verdict, value: report };
  }

  substrates(): readonly SubstrateAvailabilityView[] {
    return this.registry.availability();
  }

  /**
   * Every selectable runtime with truthful availability: PATH-probed CLIs plus
   * the native in-process openfang runtime (live engine probe via its
   * registered substrate — unwired/engine-absent ⇒ `available:false` + reason).
   */
  async runtimes(): Promise<readonly ConductorRuntimeView[]> {
    return listConductorRuntimes({ registry: this.registry });
  }

  async githubStatus(): Promise<GithubStatusView> {
    if (!this.github) return { connected: false, source: null };
    return this.github.status();
  }

  async githubRepos(): Promise<readonly GithubRepoView[]> {
    if (!this.github) return [];
    return this.github.repos();
  }

  // --- workspace detail (the run screen): reads --------------------------------

  /** The narrow deps slice the ported review/publish/continue ops run over. */
  private reviewDeps(): ReviewOpsDeps {
    return {
      getWorkspace: (id) => this.engine.getWorkspace(id),
      advanceWorkspace: (id, to, patch, metadata) =>
        this.engine.advanceWorkspace(id, to, patch, metadata),
      getSubstrate: (id: WorkspaceSubstrate) => this.registry.getFull(id),
      logger: this.log,
      ...(this.engineDeps.lock ? { lock: this.engineDeps.lock } : {}),
    };
  }

  async listWorkspaceEvents(workspaceId: string): Promise<RunEvent[]> {
    return this.engine.listWorkspaceEvents(workspaceId);
  }

  async workspaceOutput(workspaceId: string, lines?: number): Promise<{ output: string }> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    const substrate = this.registry.getFull(workspace.substrate);
    const captured = await substrate.capture(
      { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
      lines,
    );
    // A gone handle captures null — an empty output is the truthful read.
    return { output: captured ?? '' };
  }

  async workspaceStatus(workspaceId: string): Promise<{
    alive: boolean;
    exitCode: number | null;
    recentOutput: string | null;
    state: Workspace['state'];
    reason?: string;
  }> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    if (!workspace.sessionName && !workspace.worktreePath) {
      return {
        alive: false,
        exitCode: null,
        recentOutput: null,
        state: workspace.state,
        reason: 'no live substrate handle (never launched or already torn down)',
      };
    }
    const substrate = this.registry.getFull(workspace.substrate);
    const handle = {
      ref: workspaceId,
      sessionName: workspace.sessionName,
      worktreePath: workspace.worktreePath,
    };
    const [alive, exitCode, recentOutput] = await Promise.all([
      substrate.alive(handle),
      substrate.exitCode ? substrate.exitCode(handle) : Promise.resolve(undefined),
      substrate.capture(handle, 50),
    ]);
    return {
      alive,
      // `undefined` (still running / unknown) is not JSON-representable — the
      // wire contract carries null for "no exit code yet"; NEVER a fabricated 0.
      exitCode: exitCode ?? null,
      recentOutput,
      state: workspace.state,
    };
  }

  // --- workspace views (attention-enriched read model) --------------------------

  /**
   * The attention-enriched read model of one workspace, or null. The attention
   * classification is derived truthfully from the durable state, the run's
   * RunEvents, and (for live states) the captured terminal tail; every signal
   * source is degrade-safe — a capture/repository fault is a MISSING signal
   * (`'unknown'`), never a fabricated one.
   */
  async workspaceView(workspaceId: string): Promise<WorkspaceView | null> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) return null;
    return this.buildWorkspaceView(workspace);
  }

  /** Attention-enriched views of every workspace (the cockpit list's badges). */
  async listWorkspaceViews(): Promise<WorkspaceView[]> {
    const workspaces = await this.engine.listWorkspaces();
    return Promise.all(workspaces.map((workspace) => this.buildWorkspaceView(workspace)));
  }

  private async buildWorkspaceView(workspace: Workspace): Promise<WorkspaceView> {
    // Probe the substrate ONLY where the live tail can decide (running-ish states
    // with a handle) — listing must not shell out per archived record.
    let tail: string | null | undefined;
    let live: boolean | undefined;
    const probeLive =
      (workspace.state === 'running' || workspace.state === 'changes_requested') &&
      Boolean(workspace.sessionName || workspace.worktreePath);
    if (probeLive) {
      try {
        const substrate = this.registry.getFull(workspace.substrate);
        const handle = {
          ref: workspace.workspaceId,
          sessionName: workspace.sessionName,
          worktreePath: workspace.worktreePath,
        };
        [live, tail] = await Promise.all([
          substrate.alive(handle),
          substrate.capture(handle, ATTENTION_TAIL_LINES),
        ]);
      } catch (err) {
        // Missing signal, not a fabricated one — the classifier reports unknown.
        this.log.warn({ err, workspaceId: workspace.workspaceId }, 'attention probe faulted');
      }
    }

    let events: readonly RunEvent[] | undefined;
    try {
      events = await this.engine.listWorkspaceEvents(workspace.workspaceId);
    } catch (err) {
      this.log.warn({ err, workspaceId: workspace.workspaceId }, 'attention event read faulted');
    }

    const attention: AttentionResult = classifyAttention({
      state: workspace.state,
      ...(events ? { events } : {}),
      ...(tail !== undefined ? { tail } : {}),
    });

    return {
      workspaceId: workspace.workspaceId,
      spaceId: workspace.spaceId,
      projectId: workspace.projectId,
      taskId: workspace.taskId,
      ...(workspace.runId ? { runId: workspace.runId } : {}),
      runtimeId: workspace.runtimeId,
      substrate: workspace.substrate,
      branch: workspace.branch,
      baseRef: workspace.baseRef,
      ...(workspace.worktreePath ? { worktreePath: workspace.worktreePath } : {}),
      ...(workspace.sessionName ? { sessionName: workspace.sessionName } : {}),
      state: workspace.state,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      attention: attention.attention,
      attentionReason: attention.reason,
      ...(live !== undefined ? { live } : {}),
    };
  }

  async workspaceDiff(workspaceId: string): Promise<WorkspaceDiffView> {
    return workspaceDiffOp(this.reviewDeps(), workspaceId);
  }

  async workspaceTree(workspaceId: string): Promise<WorkspaceTreeView> {
    return workspaceTreeOp(this.reviewDeps(), workspaceId);
  }

  async workspaceDevCommand(workspaceId: string): Promise<DevCommandView | null> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace?.worktreePath) return null;
    return detectDevCommand(workspace.worktreePath);
  }

  // --- workspace detail: governed writes ---------------------------------------

  async setPreviewUrl(
    workspaceId: string,
    url: unknown,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.preview_url';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      metadata: { workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    const normalized = normalizeLocalPreviewUrl(url);
    if (!normalized) {
      return { ok: false, verdict, reason: 'a http(s) localhost/loopback url is required' };
    }
    try {
      const workspace = await this.engine.getWorkspace(workspaceId);
      if (!workspace) return { ok: false, verdict, reason: `workspace not found: ${workspaceId}` };
      // Same-state advance (no illegal transition) — safe to call repeatedly as
      // the run restarts on a new port.
      const updated = await this.engine.advanceWorkspace(workspaceId, workspace.state, undefined, {
        previewUrl: normalized,
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId }),
      );
      return { ok: true, verdict, value: updated };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'preview-url update failed' };
    }
  }

  async archiveWorkspace(
    workspaceId: string,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.archive';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      metadata: { workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const archived = await archiveWorkspaceOp(this.reviewDeps(), workspaceId);
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId }),
      );
      return { ok: true, verdict, value: archived };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'archive failed' };
    }
  }

  async createWorkspacePr(
    workspaceId: string,
    input: CreatePrInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<CreatePrResultView>> {
    const action = 'workspace.pr';
    // Production rule: opening a PR pushes the branch (customer-visible delivery)
    // — the governance gate is THE approval seam; a deny never reaches git/gh.
    // The workspace's taskId anchors approval correlation: an `approved` record
    // for (taskId, action) clears a needs_approval verdict on retry.
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId, base: input.base },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const deps: PublishOpsDeps = this.reviewDeps();
      const result = await createWorkspacePrOp(deps, workspaceId, input);
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId, url: result.url }),
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'pr failed' };
    }
  }

  async mergeWorkspace(
    workspaceId: string,
    input: MergeInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<MergeResultView>> {
    const action = 'workspace.merge';
    // A merge is THE customer-visible delivery — gate before any git/gh runs.
    // The workspace's taskId anchors approval correlation: an `approved` record
    // for (taskId, action) clears a needs_approval verdict on retry.
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId, strategy: input.strategy },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const deps: PublishOpsDeps = this.reviewDeps();
      const result = await mergeWorkspaceOp(deps, workspaceId, input);
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId, merged: result.merged }),
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'merge failed' };
    }
  }

  async sendWorkspaceMessage(
    workspaceId: string,
    input: ContinueWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<ContinueWorkspaceResult>> {
    const action = 'workspace.message';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      metadata: { workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const deps: ContinueOpsDeps = {
        getWorkspace: (id) => this.engine.getWorkspace(id),
        advanceWorkspace: (id, to, patch, metadata) =>
          this.engine.advanceWorkspace(id, to, patch, metadata),
        getSubstrate: (id: WorkspaceSubstrate) => this.registry.getFull(id),
        repository: this.repository,
        tailer: this.tailer,
        logger: this.log,
        ...(this.brain ? { brain: this.brain } : {}),
      };
      const result = await continueWorkspaceOp(deps, workspaceId, {
        ...input,
        createdBy: input.createdBy ?? principal.userId,
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId, runId: result.runId }),
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'message failed' };
    }
  }

  async listReconcileFindings(workspaceId?: string): Promise<readonly ReconcileFindingView[]> {
    return this.repository.listReconcileFindings(workspaceId);
  }

  terminal(): TerminalStreamPort {
    return this.terminalService;
  }

  routes(): Router {
    return buildConductorRoutes({ module: this, middleware: this.middleware });
  }

  mcp(): readonly McpToolRegistration[] {
    // Read-only introspection tools + the governed write tools (steer/stop/advance).
    // Every write tool delegates to this composer's already-gated method, so the
    // host-boundary gate and the module's own write seam BOTH apply.
    return [...buildConductorMcpTools(this), ...buildConductorWriteTools(this)];
  }

  async health(): Promise<ComponentHealth> {
    return buildConductorHealth({
      config: this.cfg,
      substrates: this.registry.availability(),
      repositoryAvailable: true,
      liveConnections: this.terminalService.liveConnections(),
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.log.info(
      {
        substrates: this.registry.availability().filter((s) => s.available).map((s) => s.id),
        tmuxControlMode: this.cfg.tmuxControlMode,
      },
      'conductor module started',
    );
  }

  async stop(): Promise<void> {
    // Idempotent, degrade-safe: live sessions are substrate-owned and survive.
  }
}

/**
 * Derive a deterministic, path-safe repo id for the recodergit index from a repo
 * full-name or absolute path (lowercase; every non `[a-z0-9_-]` run → `__`). Kept
 * local so the conductor never imports an engines-domain internal.
 */
function repoIdFromRepoRef(ref: string): string {
  return ref.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '__');
}

/**
 * Fan a `RunEvent` out to the injected external state-of-record sink (agent-os)
 * AND the conductor-local durable+live sink. The external ingest runs first but is
 * isolated: a rejection is logged and swallowed so the local durable append + live
 * `/sync` publish always run (a state-plane hiccup never stalls the terminal). When
 * no external sink is injected, the local sink is returned unchanged.
 */
function composeRunEventSink(
  local: RunEventSinkPort,
  external: RunEventSinkPort | undefined,
  logger: Logger,
): RunEventSinkPort {
  if (!external) return local;
  return {
    async append(event): Promise<void> {
      try {
        await external.append(event);
      } catch (err) {
        logger.error({ err, eventId: event.eventId }, 'conductor run-event state-of-record ingest failed');
      }
      await local.append(event);
    },
  };
}
