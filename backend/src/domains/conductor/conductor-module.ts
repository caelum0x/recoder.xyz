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
  execFileSafe,
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
import type { GateVerdict, TerminalStreamPort, GithubStatusPort, GithubStatusView, GithubRepoView, SteerTransportPort, AuditReaderPort, AuditRecord } from './ports/index.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type { UsageMeterPort } from './ports/usage-meter.port.js';
import type { RunSignalPushPort } from './ports/run-signal-push.port.js';
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
import type {
  PreviewVerifyPort,
  PreviewVerificationRecord,
  PreviewVerificationView,
} from './ports/preview-verify.port.js';
import type { CoordinationAdmissionPort } from './ports/coordination-admission.port.js';
import type { ConductorPlanPort, ConductorPlanDecision } from './ports/plan.port.js';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import { deriveSeedTerms } from './adapters/code-intel.adapter.js';
import {
  selectSubstrateForRuntime,
  isOpenfangRuntime,
} from './adapters/runtime-substrate-selector.js';
import { createCompletionHookSink } from './adapters/completion-hook.adapter.js';
import { readRepoPassages } from './adapters/repo-passages.adapter.js';
import { resolveRepoDefaultBranch } from './git-default-branch.js';
import { toLoggerPort } from './adapters/logger.adapter.js';
import { createRecoderSessionLister } from './adapters/recoder-session-lister.adapter.js';
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
  workspaceDiffFiles as workspaceDiffFilesOp,
  workspaceFilePatch as workspaceFilePatchOp,
  workspaceTree as workspaceTreeOp,
  type ReviewOpsDeps,
  type WorkspaceDiffView,
  type WorkspaceDiffFilesView,
  type WorkspaceFilePatchView,
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
import {
  verifyWorkspacePreview,
  type PreviewVerifyDeps,
  type PreviewVerifyOptions,
  type PreviewVerifyResult,
} from './services/preview-verify.service.js';
import {
  createBrowserPreviewVerifier,
  DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
} from './adapters/browser-preview-verify.adapter.js';
import { detectDevCommand, type DevCommandView } from './adapters/dev-command.adapter.js';
import type { CheckpointRecord, CheckpointStorePort } from './ports/checkpoint-store.port.js';
import { createInMemoryCheckpointStore } from './adapters/checkpoint-store.adapter.js';
import {
  branchFromCheckpoint as branchFromCheckpointOp,
  createCheckpoint as createCheckpointOp,
  listCheckpoints as listCheckpointsOp,
  restoreCheckpoint as restoreCheckpointOp,
  type BranchFromCheckpointInput,
  type BranchOpsDeps,
  type BranchResultView,
  type CheckpointOpsDeps,
  type CreateCheckpointInput,
  type RestoreResultView,
} from './services/checkpoint.service.js';
import {
  filterWorkspaces,
  sortByRecencyDesc,
  type WorkspaceQueryFilters,
} from './services/workspace-query.service.js';
import { buildCompareRoutes } from './routes/compare.routes.js';
import { buildCheckpointRoutes } from './routes/checkpoint.routes.js';
import { buildWorkspaceQueryRoutes } from './routes/workspaces-query.routes.js';
import { buildRepoConfigRoutes } from './routes/repo-config.routes.js';
import { RepoSetupService, repoKeyFor } from './services/repo-setup.service.js';
import { PrStatusService } from './services/pr-status.service.js';
import {
  RepoCloneService,
  type CloneRepoInput,
  type CloneRepoOutcome,
} from './services/repo-clone.service.js';
import { PrChecksService, type WorkspaceChecksView } from './services/pr-checks.service.js';
import { MergeabilityService, type MergeabilityView } from './services/mergeability.service.js';
import { foldReadiness, type ReadinessView } from './services/readiness.service.js';
import { createInMemoryRepoSetupStore } from './adapters/repo-setup-store.adapter.js';
import {
  compareTaskGroup as compareTaskGroupOp,
  workspaceSiblings as workspaceSiblingsOp,
  parseDiffStat,
  type CompareDeps,
  type CompareView,
} from './services/compare.service.js';
import type {
  WorkspaceGridPort,
  GroupGridArrangement,
} from './ports/workspace-grid.port.js';

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
 * failure, never a hand-set flag. `cancelled` is EXCLUDED too: it is reached only
 * through `stopWorkspace`, which kills the live substrate session and releases the
 * repo write-lock BEFORE flipping the record — advancing straight to `cancelled`
 * would strand a zombie agent + a held lock while the state falsely reads
 * cancelled. Legality of the specific from→to step is then enforced by the
 * canonical agent-os workspace state machine.
 */
export const ADVANCE_TARGET_STATES: readonly WorkspaceState[] = [
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
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
  /**
   * OPTIONAL preview verifier (browsing facet): fires a bounded browser
   * navigate→assert→screenshot over a stored preview URL. Consulted fire-and-forget
   * by `setPreviewUrl` and on the awaited `verifyPreview` path; absent ⇒ both are
   * truthful no-ops (never a faked pass, never a block).
   */
  private readonly previewVerify?: PreviewVerifyPort;
  /** OPTIONAL pal launch-planning seam (advisory runtime/skill/tool/sandbox + risk). */
  private readonly plan?: ConductorPlanPort;
  /**
   * OPTIONAL double-assignment admission gate over the Multica coordination
   * fabric; consulted in `createWorkspace`. Absent / engine-down / a fault ⇒
   * admit (never blocks a launch) — only a LIVE double-assignment defers.
   */
  private readonly coordinationAdmission: CoordinationAdmissionPort | null;
  /** OPTIONAL ColBERT PLAID index seam (per-repo late-interaction index build). */
  private readonly colbertIndex?: ConductorModuleDeps['colbertIndex'];
  /** OPTIONAL GitHub identity seam (`GET /github/status`); absent ⇒ truthful not-connected. */
  private readonly github?: GithubStatusPort;
  /** OPTIONAL live send-keys transport; absent ⇒ steering refuses truthfully. */
  private readonly steerTransport?: SteerTransportPort;
  /** OPTIONAL per-worktree `.mcp.json` injector (Recoder toolbelt); absent ⇒ truthful skip. */
  private readonly mcpInject?: McpInjectPort;
  /** OPTIONAL delivery-feedback sink (inference routing feedback); absent ⇒ truthful skip. */
  private readonly onDeliveryFeedback?: ConductorModuleDeps['onDeliveryFeedback'];
  /** OPTIONAL pre-dispatch quota gate (set by bootstrap; absent ⇒ degrade OPEN). */
  private entitlementGate?: EntitlementGate;
  /** OPTIONAL usage-meter emitter (set by bootstrap; absent ⇒ no per-run metering). */
  private usageMeter?: UsageMeterPort;
  /**
   * OPTIONAL ops-recorder reverse-push port (set by bootstrap `setRunSignalPush`;
   * absent ⇒ no run-signal push). Read by the completion-hook thunk on each
   * terminal event; observability satisfies it structurally at the composition root.
   */
  private runSignalPush?: RunSignalPushPort;
  /** Checkpoint metadata store (degrade-truthful in-process by default). */
  private readonly checkpointStore: CheckpointStorePort;
  /** Per-repo setup-script config + the worktree-create run hook (governed writes). */
  private readonly repoSetup: RepoSetupService;
  /** Workspace pull-request status via the `gh` CLI (degrade-truthful, read-only). */
  private readonly prStatus: PrStatusService;
  /** Per-check PR rollup via the same `gh` seam (`GET …/checks`; degrade-truthful). */
  private readonly prChecks: PrChecksService;
  /** GitHub repo clone seam (`POST /repos/clone`): gh-first, git fallback, never faked. */
  private readonly repoClone: RepoCloneService;
  /** Read-only pre-merge conflict + base-divergence probe (git-native, degrade-truthful). */
  private readonly mergeability: MergeabilityService;
  /**
   * OPTIONAL dmux LAYOUT-brain seam (F3 compare/parallel grid). Absent / dmux not
   * built ⇒ the compare read stays hint-less and `arrangeCompareGrid` returns a
   * truthful `null` (never a fabricated grid). Read in the compare wrappers +
   * the governed `arrangeCompareGrid`.
   */
  private readonly workspaceGrid?: WorkspaceGridPort;
  /**
   * OPTIONAL read-only tmux introspection port (durable-shell unify §A2). Injected
   * from the composition root (`engines.tmuxIntrospect()`) so the `/sessions`
   * attach bridge observes the SAME server the conductor drives WITHOUT the
   * conductor value-importing the engines domain. Absent ⇒ the bridge lists `[]`.
   */
  private readonly tmuxIntrospect?: ConductorModuleDeps['tmuxIntrospect'];
  /**
   * OPTIONAL read seam over the durable governance audit chain, scoped by
   * workspace. Backs `GET …/audit`. Absent ⇒ the edge degrades to a truthful
   * empty trail (`[]`), never a fabricated record.
   */
  private readonly auditReader?: AuditReaderPort;
  private started = false;

  constructor(deps: ConductorModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceConductorConfig(deps.config, deps.overrides ?? {});
    this.gate = deps.gate;
    this.middleware = deps.middleware;
    this.brain = deps.brain;
    this.codeIntel = deps.codeIntel;
    this.previewVerify = deps.previewVerify;
    this.plan = deps.plan;
    this.coordinationAdmission = deps.coordinationAdmission ?? null;
    this.colbertIndex = deps.colbertIndex;
    this.github = deps.githubStatus;
    this.steerTransport = deps.steerTransport;
    this.mcpInject = deps.mcpInject;
    this.onDeliveryFeedback = deps.onDeliveryFeedback;
    this.workspaceGrid = deps.workspaceGrid;
    this.tmuxIntrospect = deps.tmuxIntrospect;
    this.auditReader = deps.auditReader;
    this.checkpointStore = deps.checkpointStore ?? createInMemoryCheckpointStore();

    // Per-repo setup script: config seam (governed setScript/getScript) + the
    // fire-and-forget run hook shelled into every fresh worktree. Degrade-safe
    // in-process store by default (durable store injectable at the root).
    this.repoSetup = new RepoSetupService({
      store: deps.repoSetupStore ?? createInMemoryRepoSetupStore(),
      gate: this.gate,
      logger: this.log,
      ...(deps.repoSetupExec ? { exec: deps.repoSetupExec } : {}),
    });
    // Workspace PR status over the shared `gh` CLI seam (never throws; truthful
    // `available:false` when gh/worktree/branch is absent).
    this.prStatus = new PrStatusService({ logger: this.log });
    // Per-check PR rollup over the SAME gh seam (never throws; truthful
    // `available:false` when gh/auth/PR/GitHub-remote is absent).
    this.prChecks = new PrChecksService({ logger: this.log });
    // GitHub clone seam: `gh repo clone` first (inherits gh auth for private
    // repos), plain `git clone` fallback; never throws, never a faked clone.
    this.repoClone = new RepoCloneService({ logger: this.log });
    // Read-only merge preflight over the SAME git seam (never throws; truthful
    // `available:false` when git/worktree/branch is absent — never a fake clean).
    this.mergeability = new MergeabilityService({ logger: this.log });

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
      // Late-bound reverse-push (§8.2 b): the sink reads it per terminal event, so
      // bootstrap can inject the ops-recorder push port AFTER this module is
      // constructed (setRunSignalPush). Unwired ⇒ a truthful no-op (no push).
      getRunSignalPush: () => this.runSignalPush,
      getWorkspace: (id) => this.repository.getWorkspace(id),
      logger: this.log,
    });
    // Path (b) token accounting: late-bind the completion-hook sink into the
    // native openfang (`in_process`) substrate so its terminal event (workspaceId
    // + real input/outputTokens) meters REAL `token` usage (the sink does not exist
    // when the substrate is built in bootstrap). Degrade-safe: the substrate absent
    // / not shaped ⇒ a truthful no-op (tokens stay unmetered).
    try {
      const inProc = this.registry.getFull('in_process' as SubstrateKind) as Partial<{
        setRunSink(s: typeof sink): void;
      }>;
      inProc.setRunSink?.(sink);
    } catch {
      /* in_process not registered in this composition — nothing to wire */
    }
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
      scan: createSubstrateScan(deps.substrateScan ?? {}),
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
   * Inject the optional ops-recorder reverse-push port (terminal run → stuck-work
   * board). SINGLE-WRITER: this is the ONLY mutation of `this.runSignalPush`,
   * called once at bootstrap after observability exists — same discipline as
   * `setUsageMeter`/`setEntitlementGate`. Read by the completion-hook thunk.
   */
  setRunSignalPush(port: RunSignalPushPort): void {
    this.runSignalPush = port;
  }

  /**
   * Path (b) prompt enrichment: fold two capability blocks into the prompt the
   * native openfang turn runs as its `command`:
   *   1. MEMORY recall (mem0 ∪ beads ∪ candidates → rerank) — unchanged.
   *   2. CODE-MAP (recodergit code-knowledge-graph): a bounded, code-aware launch
   *      context (`codeIntel.queryContext`) appended AFTER the memory block.
   * Degrade-safe: no brain / empty prompt / recall fault ⇒ the raw prompt (or
   * `undefined` when there is no prompt, so the substrate refuses truthfully); an
   * absent/disabled/not-indexed code-graph ⇒ the prompt is left memory-only.
   *
   * Ordering caveat (degrade-truthful, NOT a bug): `startCodeIntel` fires the repo
   * index fire-and-forget AFTER this enrichment, so the FIRST launch of a
   * never-indexed repo races the index and truthfully gets `queryContext === null`
   * (memory-only prompt). The code-map warms on subsequent launches and after the
   * completion-hook reindex — never forced ahead of the index here.
   */
  private async enrichOpenfangCommand(
    input: CreateConductorWorkspaceInput,
    principal: Principal,
  ): Promise<string | undefined> {
    const raw = (input.prompt ?? '').trim();
    if (!raw) return undefined;

    // 1) MEMORY recall (unchanged): no brain ⇒ the raw prompt is the base; a
    //    recall fault logs + leaves the base prompt, then the code-map still runs.
    let prompt = input.prompt ?? '';
    if (this.brain) {
      try {
        const enriched = await this.brain.enrichPrompt({
          prompt: input.prompt ?? '',
          userId: principal.userId,
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.repoPath ? { repoPath: input.repoPath } : {}),
          ...(input.library ? { library: input.library } : {}),
          // Thread the SAME per-repo ColBERT collection `startCodeIntel` builds so
          // the brain's first-stage retrieval reads the index instead of leaving it
          // a dead write. Gated on `repoPath` — the only case `startCodeIntel`
          // builds a `repo_<id>` collection — so we never point search at an index
          // that was never built (absent ⇒ retrieval falls back to its default).
          ...(input.repoPath
            ? { repoCollection: `repo_${repoIdFromRepoRef(input.projectId || input.repoPath)}` }
            : {}),
        });
        prompt = enriched.prompt;
      } catch (err) {
        this.log.warn(
          { err, runtimeId: input.runtimeId },
          'conductor openfang prompt enrich faulted — running raw prompt',
        );
      }
    }

    // 2) CODE-MAP (recodergit code-graph), degrade-truthful. Probe the OPTIONAL
    //    port method before calling (older impls omit it). Gated on `repoPath`
    //    (the only case a `repo_<id>` index exists) and derived with the SAME
    //    `repoIdFromRepoRef(projectId || repoPath)` `startCodeIntel` indexes under,
    //    so we only query an index that was, or will be, built for this repo.
    //    `queryContext` returns a rendered block OR a truthful `null` (disabled /
    //    not-indexed / no seed match) ⇒ the prompt is left memory-only. Bounded +
    //    non-blocking: a fault is logged and skipped, never crashing a launch.
    if (input.repoPath && this.codeIntel?.queryContext) {
      try {
        const repoId = repoIdFromRepoRef(input.projectId || input.repoPath);
        const seeds = deriveSeedTerms(input.prompt ?? '');
        const block = await this.codeIntel.queryContext(repoId, seeds);
        if (block) prompt = `${prompt}\n\n${block}`;
      } catch (err) {
        this.log.warn(
          { err, runtimeId: input.runtimeId },
          'conductor openfang code-context enrich faulted — skipped',
        );
      }
    }

    return prompt;
  }

  /**
   * Fire-and-forget code-intel on workspace create: recodergit repo index + beads
   * issue-graph claim + ColBERT PLAID index build. Never awaited (a slow/absent
   * engine must not block launch); every call is `void` + self-logging +
   * degrade-safe inside the adapter (or guarded by a truthful `configured()` probe).
   */
  private startCodeIntel(input: CreateConductorWorkspaceInput, workspace: Workspace): void {
    const repoId = repoIdFromRepoRef(input.projectId || input.repoPath);
    // ColBERT per-repo late-interaction index: chunk the repo's text files and
    // build/refresh the PLAID collection so retrieval can surface passages the
    // single-vector Qdrant top-K misses. Degrade-truthful: no daemon configured, an
    // empty passage set, or a build fault is a logged skip — never blocks a launch.
    if (this.colbertIndex?.configured() && input.repoPath) {
      const collection = `repo_${repoId}`;
      void readRepoPassages(input.repoPath)
        .then((passages) =>
          passages.length > 0
            ? this.colbertIndex!.ensureIndex(collection, passages, { overwrite: true })
            : undefined,
        )
        .catch((err) => this.log.warn({ err, repoId }, 'conductor colbert index hook faulted'));
    }
    if (!this.codeIntel) return;
    const codeIntel = this.codeIntel;
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

  /**
   * Run the repo's configured setup script inside the freshly-created worktree
   * (fire-and-forget). Truthful degrade: no worktree on the record, or no script
   * configured for the repo, is a logged skip — the service NEVER throws and a
   * failing script is a captured (non-blocking) failure, so an allowed launch is
   * never aborted by setup. The repo key is derived from the projectId (preferred)
   * falling back to the repoPath, matching the config write key.
   */
  private runRepoSetup(input: CreateConductorWorkspaceInput, workspace: Workspace): void {
    if (!workspace.worktreePath) {
      this.log.debug(
        { workspaceId: workspace.workspaceId, substrate: workspace.substrate },
        'conductor repo-setup skipped (no worktree path)',
      );
      return;
    }
    const repoKey = repoKeyFor(input.projectId, input.repoPath);
    void this.repoSetup
      .runSetup({ repoKey, worktreePath: workspace.worktreePath, workspaceId: workspace.workspaceId })
      .then((result) => {
        if (result.ran && result.ok === false) {
          this.log.warn(
            { workspaceId: workspace.workspaceId, repoKey, exitCode: result.exitCode },
            'conductor repo-setup script failed (non-blocking)',
          );
        }
      })
      .catch((err) =>
        this.log.warn({ err, workspaceId: workspace.workspaceId, repoKey }, 'conductor repo-setup hook faulted'),
      );
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.engine.listWorkspaces();
  }

  /**
   * Board search/filter — the state-of-record list narrowed by the query filters
   * (free-text `q` over codename/repo/branch/task/goal/agent, plus exact `state`,
   * substring `repo`/`agent`, and the tri-state `archived`). Read-only: it fetches
   * the canonical list and applies the pure {@link filterWorkspaces}, never gating,
   * auditing, or mutating. An empty match is a truthful empty list.
   */
  async queryWorkspaces(filters: WorkspaceQueryFilters): Promise<Workspace[]> {
    const workspaces = await this.engine.listWorkspaces();
    return filterWorkspaces(workspaces, filters);
  }

  /**
   * Archived history — every archived workspace, most-recent-first. A convenience
   * over {@link queryWorkspaces} with `archived: true`; read-only and degrade-safe
   * (no archived records ⇒ a truthful empty list).
   */
  async listArchivedWorkspaces(): Promise<Workspace[]> {
    const workspaces = await this.engine.listWorkspaces();
    return sortByRecencyDesc(filterWorkspaces(workspaces, { archived: true }));
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.engine.getWorkspace(workspaceId);
  }

  /**
   * Resolve the concrete baseRef to persist for a launch. An explicit, concrete
   * caller `baseRef` (e.g. the checkpoint-branch tag) always wins. Otherwise, when
   * the caller left it unset or passed the detached `HEAD` sentinel, probe the repo
   * git-native for its REAL integration base. Never throws; when git cannot answer
   * it returns the caller's value unchanged (the engine then keeps `HEAD`, and the
   * read/merge edges resolve git-native as defense-in-depth).
   */
  private async resolveLaunchBaseRef(
    input: CreateConductorWorkspaceInput,
  ): Promise<string | undefined> {
    if (input.baseRef && input.baseRef !== 'HEAD') return input.baseRef;
    if (!input.repoPath) return input.baseRef;
    const resolved = await resolveRepoDefaultBranch(execFileSafe, input.repoPath);
    return resolved ?? input.baseRef;
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

    // Pal launch advisory (OPTIONAL): after the write-gate allow, before substrate
    // selection, consult the engines-owned `planLaunch` facet. Pal ADVISES — the
    // caller's explicit choices always win, and pal only fills gaps the operator
    // left blank. A throwing/faulted port NEVER fails a launch (degrade to no
    // advisory); absent ⇒ the whole path is byte-identical to today. `planLaunch`
    // is a pure in-proc verb, so this adds no I/O latency to the launch path.
    let plan: ConductorPlanDecision | undefined;
    if (this.plan) {
      try {
        plan = this.plan.plan({
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.prompt ? { goal: input.prompt } : {}),
        });
      } catch (err) {
        this.log.warn(
          { err, taskId: input.taskId },
          'conductor pal planLaunch faulted — launching without advisory',
        );
      }
    }

    // Coordination admission (OPTIONAL, degrade-open): on the axis
    // resource-governor → coordination-admission → work-lock → launch, defer a
    // launch whose ISSUE is ALREADY actively held by 2+ agents (a contention the
    // Multica `conflictStatus` sees under 2+ members). Keyed on `input.taskId`
    // (the bd issue the autopilot passes). FAIL-OPEN: absent gate / engine down /
    // any fault ⇒ admit — a coordination engine being down must NEVER block a
    // launch; only a LIVE, engine-confirmed double-assignment defers. The reroute
    // WRITE is governance-gated by the caller (`coordination.reroute`); a
    // deny/throw ⇒ no reroute, launch still deferred (fail-safe).
    if (this.coordinationAdmission && input.taskId) {
      const issueId = input.taskId;
      try {
        const decision = await this.coordinationAdmission.admitIssue(
          { issueId },
          {
            authorizeReroute: async () =>
              (
                await guardConductorWrite(this.gate, 'coordination.reroute', principal, {
                  target: { path: input.repoPath },
                  taskId: issueId,
                  metadata: { issueId },
                })
              ).allowed,
          },
        );
        if (!decision.admit) {
          // Truthful DEFER — not a governance deny: the write-gate already
          // allowed this launch; coordination re-balances a contended issue.
          await recordConductorAudit(
            this.gate,
            conductorAuditEntry(action, principal, verdict, {
              coordinationDeferred: true,
              contenders: decision.conflict?.contenders.length ?? 0,
              rerouted: decision.reroute?.routed ?? false,
            }),
          );
          return {
            ok: false,
            verdict,
            reason: decision.reason ?? 'issue contended — launch deferred',
          };
        }
      } catch (err) {
        // An optional enrichment gate faulting must NEVER block a launch the
        // policy gate already allowed (fail-open, mirrors the entitlement gate).
        this.log.warn(
          { err, taskId: issueId },
          'conductor coordination admission errored — degrading open',
        );
      }
    }

    try {
      // Execution-path selection (the ONE seam that splits path a/b). openfang →
      // the native in-process substrate; every CLI runtime → tmux+worktree (or the
      // caller's explicitly requested, registered substrate). Both paths converge on
      // engine.createWorkspace + the SAME capability seams below. The caller's
      // runtimeId ALWAYS wins; pal's advisory runtime only fills a blank one.
      const registered = this.registry.registry.list();
      const runtimeId = input.runtimeId ?? plan?.runtimeId;
      const openfang = isOpenfangRuntime(runtimeId);
      const substrate: SubstrateKind = openfang
        ? selectSubstrateForRuntime(runtimeId, { registered })
        : (input.substrate ?? 'tmux_worktree');

      // Path (b): the in-process substrate runs `command` as the agent turn, so the
      // integrator enriches the prompt HERE (memory recall) and passes it as command
      // — this bypasses the CLI-only resolveRuntimeCommand. Path (a): leave command
      // undefined so WorkspaceEngine enriches (engineDeps.brain) + resolves the CLI.
      let command = input.command;
      if (openfang && !command) {
        command = await this.enrichOpenfangCommand(input, principal);
      }

      // Resolve the repo's REAL integration base ONCE at launch so the workspace
      // is persisted with a concrete baseRef (e.g. `master`/`develop`/a feature
      // branch) instead of the detached `HEAD` sentinel. The worktree is then cut
      // off that ref, and every downstream read/merge edge (mergeability, review
      // diff, publish) reuses it directly rather than falling back to a hardcoded
      // `main`. Degrade-truthful: an unset caller baseRef that git cannot resolve
      // stays `HEAD` (the edges still resolve git-native as defense-in-depth); an
      // explicit caller baseRef always wins.
      const baseRef = await this.resolveLaunchBaseRef(input);

      const workspace = await this.engine.createWorkspace({
        ...input,
        ...(baseRef !== undefined ? { baseRef } : {}),
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

      // Ready the checkout for the agent: run the repo's configured setup script
      // inside the new worktree (fire-and-forget + non-blocking + degrade-safe —
      // no script / a failing script never aborts the allowed launch).
      this.runRepoSetup(input, workspace);

      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId: workspace.workspaceId,
          substrate,
          // Pal advisory (present ONLY when the port is wired and pal was
          // consulted) — recorded for audit; pal advises, the governance kernel
          // still decides. Absent port ⇒ these keys are omitted (byte-identical).
          ...(plan
            ? {
                planRisk: plan.risk,
                planApprovalRequired: plan.approvalRequired,
                planSource: plan.source,
              }
            : {}),
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

  // --- checkpoints & restore (git snapshot capability) -------------------------

  /** The narrow deps slice the checkpoint ops run over (git seams + store). */
  private checkpointDeps(): CheckpointOpsDeps {
    return {
      getWorkspace: (id) => this.engine.getWorkspace(id),
      store: this.checkpointStore,
      logger: this.log,
      newId: () => uuidId.newId(),
      now: () => systemClock.now(),
    };
  }

  /**
   * Capture a CHECKPOINT of the workspace's git state — GATED
   * (`workspace.checkpoint`). Non-destructive: tags the committed HEAD plus any
   * captured uncommitted work. A missing worktree refuses truthfully.
   */
  async checkpointWorkspace(
    workspaceId: string,
    input: { label?: string; description?: string },
    principal: Principal,
  ): Promise<ConductorWriteResult<CheckpointRecord>> {
    const action = 'workspace.checkpoint';
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const opInput: CreateCheckpointInput = {
        ...(input.label ? { label: input.label } : {}),
        ...(input.description ? { description: input.description } : {}),
        createdBy: principal.userId,
      };
      const record = await createCheckpointOp(this.checkpointDeps(), workspaceId, opInput);
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          checkpointId: record.checkpointId,
          ref: record.ref,
        }),
      );
      return { ok: true, verdict, value: record };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'checkpoint failed' };
    }
  }

  /** List a workspace's checkpoints (newest-first). Read-only. */
  async listWorkspaceCheckpoints(workspaceId: string): Promise<readonly CheckpointRecord[]> {
    return listCheckpointsOp({ store: this.checkpointStore }, workspaceId);
  }

  /**
   * RESTORE a workspace's worktree to a checkpoint — GATED (`workspace.restore`).
   * Takes an automatic safety snapshot first, then reproduces the checkpoint's
   * file state. A missing worktree / unknown checkpoint refuses truthfully.
   */
  async restoreCheckpoint(
    workspaceId: string,
    checkpointId: string,
    principal: Principal,
  ): Promise<ConductorWriteResult<RestoreResultView>> {
    const action = 'workspace.restore';
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId, checkpointId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const result = await restoreCheckpointOp(this.checkpointDeps(), workspaceId, checkpointId);
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          checkpointId,
          restoredTo: result.restoredTo,
        }),
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'restore failed' };
    }
  }

  /**
   * BRANCH a NEW workspace from a checkpoint — GATED (`workspace.branch`): launch
   * a fresh workspace whose base ref is the checkpoint tag. The launched workspace
   * runs the same capability seams as a normal create (`.mcp.json` injection).
   */
  async branchFromCheckpoint(
    workspaceId: string,
    checkpointId: string,
    input: { branch?: string; runtimeId?: string; taskId?: string; prompt?: string },
    principal: Principal,
  ): Promise<ConductorWriteResult<BranchResultView>> {
    const action = 'workspace.branch';
    const source = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      ...(source?.taskId ? { taskId: source.taskId } : {}),
      metadata: { workspaceId, checkpointId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const branchInput: BranchFromCheckpointInput = {
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        createdBy: principal.userId,
      };
      const deps: BranchOpsDeps = {
        ...this.checkpointDeps(),
        createWorkspace: (createInput) => this.engine.createWorkspace(createInput),
      };
      const result = await branchFromCheckpointOp(deps, workspaceId, checkpointId, branchInput);
      // Same post-launch seam as createWorkspace: point the branched agent at the
      // governed backend MCP host (fire-and-forget + degrade-safe).
      this.injectWorktreeMcp(result.workspace);
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          checkpointId,
          newWorkspaceId: result.workspace.workspaceId,
        }),
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'branch failed' };
    }
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

  /**
   * Clone a GitHub repo onto the box (`POST /repos/clone`). Ungated like the
   * other local-box reads/probes on this surface: it writes only a fresh
   * directory under the caller-chosen (or default) repos dir — every workspace
   * launched FROM it still passes the governed `workspace.create` gate. Never
   * throws: every failure is a typed, truthful outcome.
   */
  async cloneRepo(input: CloneRepoInput): Promise<CloneRepoOutcome> {
    return this.repoClone.clone(input);
  }

  /**
   * The workspace's per-check PR rollup (`GET …/checks`) via `gh pr view` run
   * in the worktree. Null when the workspace does not exist (→ 404 at the
   * edge); otherwise ALWAYS a truthful view (`available:false` + reason when
   * gh/auth/PR/GitHub-remote is absent — never fabricated).
   */
  async workspaceChecks(workspaceId: string): Promise<WorkspaceChecksView | null> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) return null;
    return this.prChecks.checks(workspace);
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

  // --- multi-agent compare (F3 parallel-run groups): read-only ------------------

  /** The narrow read seams the compare service groups + projects over. */
  private compareDeps(): CompareDeps {
    return {
      listWorkspaces: () => this.engine.listWorkspaces(),
      getWorkspace: (id) => this.engine.getWorkspace(id),
      buildView: (workspace) => this.buildWorkspaceView(workspace),
      diffStat: (workspace) => this.computeDiffStat(workspace),
      changedFiles: (workspace) => this.computeChangedFiles(workspace),
    };
  }

  /**
   * A READ-ONLY tracked changed-file path list for one workspace — the compare
   * row's `changedFiles` + the input to the CONTESTED overlap. REUSES the shipped
   * pure `workspaceDiffFiles` op (base fenced before `--`, NO agent pathspec,
   * exec-bounded) — no new git surface. Mirrors `computeDiffStat`'s degrade
   * posture: a record with no worktree, a non-repo/git-absent tree, or a racy
   * vanish yields a truthful reason and NO list (never a fabricated set).
   */
  private async computeChangedFiles(
    workspace: Workspace,
  ): Promise<{ files?: readonly string[]; reason?: string }> {
    if (!workspace.worktreePath) {
      return { reason: 'no worktree (never launched or already torn down)' };
    }
    try {
      const view = await workspaceDiffFilesOp(this.reviewDeps(), workspace.workspaceId);
      if (!view.available) {
        return { reason: 'changed-file list unavailable (non-repo / git absent)' };
      }
      return { files: view.files.map((f) => f.path) };
    } catch (err) {
      return { reason: err instanceof Error ? err.message : 'changed-file list failed' };
    }
  }

  /**
   * A READ-ONLY diff footprint (files / +lines / -lines) for one workspace — the
   * compare row's `diffStat`. Unlike `workspaceDiff`, this NEVER transitions the
   * workspace (no running → awaiting_review side effect). Degrade-safe: a record
   * with no worktree, or a substrate diff fault, yields a truthful reason and NO
   * stat (never a fabricated `0/0/0`).
   */
  private async computeDiffStat(
    workspace: Workspace,
  ): Promise<{ stat?: ReturnType<typeof parseDiffStat>; reason?: string }> {
    if (!workspace.worktreePath) {
      return { reason: 'no worktree (never launched or already torn down)' };
    }
    try {
      const substrate = this.registry.getFull(workspace.substrate);
      const diff = await substrate.diff(
        {
          ref: workspace.workspaceId,
          sessionName: workspace.sessionName,
          worktreePath: workspace.worktreePath,
        },
        workspace.baseRef || 'HEAD',
      );
      return { stat: parseDiffStat(diff.stat, diff.changedFiles) };
    } catch (err) {
      return { reason: err instanceof Error ? err.message : 'diff failed' };
    }
  }

  async compareTaskGroup(taskGroup: string): Promise<CompareView> {
    const view = await compareTaskGroupOp(this.compareDeps(), taskGroup);
    return this.withGridHint(view);
  }

  async workspaceSiblings(workspaceId: string): Promise<CompareView | null> {
    const view = await workspaceSiblingsOp(this.compareDeps(), workspaceId);
    return view ? this.withGridHint(view) : view;
  }

  /**
   * Enrich a compare read with the READ-ONLY operator-attach hint (never a
   * mutation — the pure service stays substrate-free). Degrade-truthful: no grid
   * seam, a singleton/ungrouped view, or no repo/sessions ⇒ the identical
   * hint-less view; `attachHint` faulting ⇒ the view unchanged. The `attachCommand`
   * half is tenant-gated inside the adapter (desktop-only); `visibleSessions`
   * (intersected to the group) is always safe.
   */
  private async withGridHint(view: CompareView): Promise<CompareView> {
    if (!this.workspaceGrid || view.count < 2) return view; // singleton/ungrouped ⇒ no grid
    const sessions = view.siblings
      .map((s) => s.sessionName)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
    const repoPath = this.groupRepoPath(view);
    if (!repoPath || sessions.length === 0) return view; // truthful: no repo/sessions ⇒ no hint
    const hint = await this.workspaceGrid
      .attachHint({ repoPath, groupSessionNames: sessions })
      .catch(() => null);
    return hint ? { ...view, grid: hint } : view; // dmux absent/fault ⇒ unchanged view
  }

  /**
   * A real member worktree path the operator console launches in (dmux renders
   * the box-wide `recoder-*` sessions from any cwd). The FIRST sibling with a real
   * `worktreePath` — never a fabricated/shared repoPath; `undefined` when none has
   * one (⇒ no hint).
   */
  private groupRepoPath(view: CompareView): string | undefined {
    for (const sibling of view.siblings) {
      if (typeof sibling.worktreePath === 'string' && sibling.worktreePath.trim().length > 0) {
        return sibling.worktreePath;
      }
    }
    return undefined;
  }

  async arrangeCompareGrid(
    taskGroup: string,
    principal: Principal,
  ): Promise<ConductorWriteResult<GroupGridArrangement | null>> {
    const action = 'workspace.grid';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      metadata: { taskGroup },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    // dmux absent ⇒ truthful null (no grid) — the write is a governed no-op.
    if (!this.workspaceGrid) return { ok: true, verdict, value: null };

    const view = await compareTaskGroupOp(this.compareDeps(), taskGroup);
    const worktrees = view.siblings
      .filter((s): s is typeof s & { worktreePath: string } => typeof s.worktreePath === 'string')
      .map((s) => ({ workspaceId: s.workspaceId, worktreePath: s.worktreePath }));
    // No honest N-way grid to build — never a hollow one-dir grid.
    if (worktrees.length < 2) return { ok: true, verdict, value: null };

    const arrangement = await this.workspaceGrid
      .arrangeGrid({ taskGroup, worktrees })
      .catch(() => null);
    if (arrangement) {
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, {
          taskGroup,
          sessionName: arrangement.sessionName,
          paneCount: arrangement.paneCount,
        }),
      );
    }
    return { ok: true, verdict, value: arrangement }; // null on any tmux fault
  }

  async workspaceDiff(workspaceId: string): Promise<WorkspaceDiffView> {
    return workspaceDiffOp(this.reviewDeps(), workspaceId);
  }

  async workspaceTree(workspaceId: string): Promise<WorkspaceTreeView> {
    return workspaceTreeOp(this.reviewDeps(), workspaceId);
  }

  /**
   * Per-file changed list — a faithful slice of the {@link workspaceDiff} blob
   * (working tree vs the review base). PURE read (no state transition, unlike the
   * legacy `/diff`); degrade-truthful (`available:false, files:[]` for a
   * non-repo/no-worktree tree, never a fabricated file).
   */
  async workspaceDiffFiles(workspaceId: string): Promise<WorkspaceDiffFilesView> {
    return workspaceDiffFilesOp(this.reviewDeps(), workspaceId);
  }

  /**
   * A single file's unified patch (working tree vs the review base). The
   * agent-supplied `path` is passed ONLY as a pathspec after the `--` fence and is
   * rejected pre-spawn if it begins with `-`. PURE read; degrade-truthful
   * (`patch:null` when it cannot be computed, `patch:''` for no diff).
   */
  async workspaceFilePatch(workspaceId: string, path: string): Promise<WorkspaceFilePatchView> {
    return workspaceFilePatchOp(this.reviewDeps(), workspaceId, path);
  }

  async workspaceMergeability(workspaceId: string): Promise<MergeabilityView> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    return this.mergeability.probe(workspace);
  }

  /**
   * Fold the four merge-decision signals (lifecycle, mergeability, PR checks,
   * preview verification) into ONE truthful read-model (`GET …/readiness`). PURE
   * read: no gate, no audit, no mutation. Each of the four probes is settled
   * INDEPENDENTLY via `Promise.allSettled`, so a rejected/hung probe degrades to
   * an ABSENT input — the corresponding signal reports `'unknown'` and the edge
   * never 500s, never a fabricated pass. `state` is read from the already-fetched
   * workspace record (NOT the view probe), so lifecycle stays truthful even if the
   * view probe rejects. A missing workspace throws (→ 404 at the edge).
   */
  async workspaceReadiness(workspaceId: string): Promise<ReadinessView> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    const [mergeR, prR, previewR, viewR] = await Promise.allSettled([
      this.mergeability.probe(workspace),
      this.prStatus.status(workspace),
      this.getPreviewVerification(workspaceId),
      this.buildWorkspaceView(workspace),
    ]);
    return foldReadiness({
      state: workspace.state,
      ...(viewR.status === 'fulfilled' && viewR.value.attention
        ? { attention: viewR.value.attention }
        : {}),
      ...(mergeR.status === 'fulfilled' ? { mergeability: mergeR.value } : {}),
      ...(prR.status === 'fulfilled' ? { prStatus: prR.value } : {}),
      ...(previewR.status === 'fulfilled' ? { preview: previewR.value } : {}),
    });
  }

  async workspaceDevCommand(workspaceId: string): Promise<DevCommandView | null> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace?.worktreePath) return null;
    return detectDevCommand(workspace.worktreePath);
  }

  // --- workspace detail: governed writes ---------------------------------------

  /**
   * The narrow gate + verifier + read seams the preview-verify service runs over.
   * Uses the wired verifier when present; else a truthful null-skip verifier, so
   * the explicit `verifyPreview` path still runs its gate + seals a skipped record
   * (never a faked pass). The fire-and-forget auto-verify guards on presence, so
   * it never spends a gate/audit on a composition with no browsing facet.
   */
  private previewVerifyDeps(): PreviewVerifyDeps {
    return {
      gate: this.gate,
      verifier: this.previewVerify ?? createBrowserPreviewVerifier(null),
      getWorkspace: (id) => this.engine.getWorkspace(id),
      // Write-back seam: persist the COMPACT verification summary onto the
      // workspace record via the SAME same-state metadata-merge idiom
      // `setPreviewUrl` uses (`advanceWorkspace` MERGES the `{ previewVerification }`
      // patch, never replaces), so the `GET …/preview-verification` read edge can
      // project it — the audit Merkle chain is not queryable by `workspaceId`.
      // Degrade-truthful: a vanished workspace ⇒ a no-op (nothing to write onto).
      persistVerification: async (id, record) => {
        const workspace = await this.engine.getWorkspace(id);
        if (!workspace) return;
        await this.engine.advanceWorkspace(id, workspace.state, undefined, {
          previewVerification: record,
        });
      },
    };
  }

  /**
   * PURE projection of a workspace's persisted preview-verification summary
   * (`metadata.previewVerification`) into the read model the
   * `GET …/preview-verification` edge returns — or `null` when the workspace does
   * not exist OR was never verified (no record). Read-only: no gate, no audit, no
   * mutation. `screenshotRef` is ALWAYS `null` in this cut (the screenshot PNG is
   * not retained — only an opaque artifact id was sealed), so the cockpit shows
   * "screenshot not retained", never a broken image. A never-verified workspace is
   * a truthful `null` (⇒ a 404 at the edge), NEVER a fabricated pass.
   */
  async getPreviewVerification(workspaceId: string): Promise<PreviewVerificationView | null> {
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) return null;
    const raw = (workspace.metadata as Record<string, unknown> | undefined)?.previewVerification;
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as PreviewVerificationRecord;
    return {
      workspaceId: workspace.workspaceId,
      status: record.status,
      checkedAt: record.checkedAt,
      summary: record.summary,
      degraded: record.degraded,
      ...(record.reason !== undefined ? { reason: record.reason } : {}),
      checks: Array.isArray(record.checks) ? record.checks : [],
      // The screenshot PNG is not retained (only an opaque artifact id was sealed).
      screenshotRef: null,
    };
  }

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
      // Fire-and-forget preview verification (browsing facet). The persist above is
      // AWAITED and truthful; this side effect is `void … .catch(…)` and NEVER
      // rethrows into or blocks the caller — the completion-hook precedent. The URL
      // is freshest here (newest, most likely still pointing at a live port), so
      // firing now maximizes a real passed/failed. It crosses a SECOND, independent
      // gate (`workspace.preview_verify`): a deny / needs_approval there is a
      // truthful no-op — logged, never a block on the already-succeeded write. The
      // bounded `timeoutMs` guarantees a slow/hung preview can never stall the
      // caller (nor the completion hook downstream). Degrade-truthful end to end:
      // no driver ⇒ skipped(degraded); page break ⇒ failed; never a fabricated pass.
      if (this.previewVerify) {
        void verifyWorkspacePreview(this.previewVerifyDeps(), workspaceId, principal, {
          timeoutMs: DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
        })
          .then((r) => {
            if (!r.ok) {
              this.log.info(
                { workspaceId, verdict: r.verdict.effect, reason: r.reason },
                'conductor preview auto-verify not run',
              );
            }
          })
          .catch((err) =>
            this.log.warn({ err, workspaceId }, 'conductor preview auto-verify faulted'),
          );
      }
      return { ok: true, verdict, value: updated };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'preview-url update failed' };
    }
  }

  /**
   * VERIFY the workspace's stored preview URL — GATED (`workspace.preview_verify`),
   * the awaited twin of the fire-and-forget auto-verify. Delegates to the governed
   * {@link verifyWorkspacePreview} service, which runs the browser navigate →
   * assert → screenshot and SEALS the summary + screenshot artifact ids into the
   * durable audit chain. A bounded default deadline is applied unless the caller
   * overrides it. Degrade-truthful: no verifier / no driver / no stored preview
   * URL ⇒ a truthful `ok:false` or `skipped(degraded)` outcome with the real
   * reason — never a fabricated pass, never a throw, never a block on a run/merge.
   */
  async verifyPreview(
    workspaceId: string,
    principal: Principal,
    options?: PreviewVerifyOptions,
  ): Promise<PreviewVerifyResult> {
    return verifyWorkspacePreview(this.previewVerifyDeps(), workspaceId, principal, {
      timeoutMs: DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
      ...(options ?? {}),
    });
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
      // Seal the merge into the durable Merkle audit chain and CAPTURE the record
      // so the merge result carries its queryable audit id (increment-2 close).
      // A best-effort sealing failure ⇒ `null` ids — truthful, never fabricated.
      const sealed = await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId, merged: result.merged }),
      );
      const value: MergeResultView = {
        ...result,
        auditId: sealed?.id ?? null,
        auditSeq: sealed?.seq ?? null,
        auditEntryHash: sealed?.entryHash ?? null,
      };
      // Delivery-feedback fusion: a MERGED workspace is THE positive delivery
      // outcome. When the run's routed inference_id was persisted onto the record
      // (`metadata.inferenceId`), fire the inference routing feedback seam so the
      // LLM gateway learns `task_success` from real deliveries. Degrade-truthful:
      // no persisted inference_id (not tracked today) ⇒ a silent skip, never faked.
      if (result.merged && this.onDeliveryFeedback) {
        const inferenceId = workspace?.metadata?.inferenceId;
        if (typeof inferenceId === 'string' && inferenceId.length > 0) {
          this.onDeliveryFeedback(inferenceId, principal.userId, true);
        }
      }
      return { ok: true, verdict, value };
    } catch (err) {
      return { ok: false, verdict, reason: err instanceof Error ? err.message : 'merge failed' };
    }
  }

  /**
   * SINGLE-WRITER persist of a run's napi-tier `inference_id` onto the workspace
   * record — the WRITE side of the merge → `feedback()` RLHF loop consumed at
   * {@link mergeWorkspace} (`:1338`). Reuses the same-state metadata-patch idiom of
   * {@link setPreviewUrl} (`:1245`): `advanceWorkspace` transitions the workspace to
   * its CURRENT state and MERGES the `{ inferenceId }` patch onto existing metadata
   * (verified: `transitionWorkspace` spreads `...metadata`), so a concurrent
   * lifecycle advance is never clobbered and only `inferenceId` is written.
   *
   * WRITE-ONCE: an already-anchored workspace returns `true` without a write — the
   * first napi-served completion of a run claims the anchor, minimizing the race
   * window against concurrent advances and never overwriting a resolvable id.
   *
   * No governance gate: this is an internal correlation write on the sink's
   * fire-and-forget path (mirrors the internal principal path the autopilot uses),
   * not a customer-visible action. Degrade-truthful: a missing workspace ⇒ `false`.
   */
  async recordRunInferenceId(workspaceId: string, inferenceId: string): Promise<boolean> {
    if (!inferenceId) return false;
    const workspace = await this.engine.getWorkspace(workspaceId);
    if (!workspace) return false;
    // Write-once anchor: never clobber a persisted id.
    const existing = workspace.metadata?.inferenceId;
    if (typeof existing === 'string' && existing.length > 0) return true;
    // Same-state advance (no illegal transition) — the metadata patch merges.
    await this.engine.advanceWorkspace(workspaceId, workspace.state, undefined, { inferenceId });
    return true;
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

  /**
   * The durable governance-audit trail for one workspace — the sealed
   * control-plane events (merge/pr/advance/stop) whose payload carries this
   * `workspaceId`, ascending by chain `seq`. Read-only (no gate/mutation). The
   * READ half of the merge→audit seam: `POST …/merge` returns the sealed id and
   * this edge lets the cockpit pull the full queryable trail. Absent reader ⇒ a
   * truthful empty trail, never a fabricated record.
   */
  async workspaceAudit(workspaceId: string, limit?: number): Promise<readonly AuditRecord[]> {
    if (!this.auditReader) return [];
    // Solo/desktop (bootstrap-injected `cfg.soloMode`): no durable audit store, so
    // the read hits an unavailable DB and would 503. Nothing is sealed to read
    // locally — degrade to an empty trail. Cloud keeps the truthful failure so an
    // audit-DB outage surfaces.
    if (this.cfg.soloMode) {
      try {
        return await this.auditReader.byWorkspace(workspaceId, limit);
      } catch {
        return [];
      }
    }
    return this.auditReader.byWorkspace(workspaceId, limit);
  }

  terminal(): TerminalStreamPort {
    return this.terminalService;
  }

  routes(): Router {
    const router = Router();
    // Compare routes FIRST: `/workspaces/compare` must resolve before the main
    // router's `/workspaces/:id` (else "compare" is read as a workspace id).
    router.use(buildCompareRoutes({ module: this, middleware: this.middleware }));
    // Checkpoint routes: static `/checkpoints` segment after `:id`, no collision
    // with the main `/workspaces/:id/*` edges; register before the main router.
    router.use(buildCheckpointRoutes({ module: this, middleware: this.middleware }));
    // Board query routes: the literal `/workspaces/archived` + the query-aware
    // `GET /workspaces` MUST precede the main router so the filtered list shadows
    // the plain list and `/workspaces/archived` resolves before `/workspaces/:id`.
    router.use(buildWorkspaceQueryRoutes({ module: this, middleware: this.middleware }));
    // Repo-config + PR-status: `/repo-setup-script` (GET/PUT) + the workspace's
    // `/workspaces/:id/pr-status` read. The setup-script PUT is governed inside
    // the injected RepoSetupService (deny ⇒ truthful 403, never a faked 200).
    router.use(
      buildRepoConfigRoutes({
        module: this,
        middleware: this.middleware,
        repoSetup: this.repoSetup,
        prStatus: this.prStatus,
      }),
    );
    router.use(
      buildConductorRoutes({
        module: this,
        middleware: this.middleware,
        // Read-only `/sessions` attach bridge over the INJECTED engines-owned tmux
        // introspect port (never a cross-domain value import). Absent ⇒ the lister
        // degrades to an empty list (truthful "cannot observe the substrate").
        ...(this.tmuxIntrospect
          ? {
              listRecoderSessions: createRecoderSessionLister({
                introspect: this.tmuxIntrospect,
                logger: toLoggerPort(this.log),
              }),
            }
          : {}),
      }),
    );
    return router;
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
