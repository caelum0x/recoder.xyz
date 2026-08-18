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
  systemClock,
  uuidId,
  type ReconcileReport,
  type WorkspaceEngineDeps,
} from '@recoder/substrate';
import { resumePlan, dedupeKey } from '@recoder/runtime';
import type { RunEvent, Workspace, WorkspaceState } from '@recoder/agent-os';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { Principal } from '../identity/types.js';
import { sliceConductorConfig, type ConductorConfig } from './config.js';
import type {
  TerminalStreamPort,
  GithubStatusPort,
  GithubStatusView,
  GithubRepoView,
  SteerTransportPort,
  AuditReaderPort,
  AuditRecord,
} from './ports/index.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type { UsageMeterPort } from './ports/usage-meter.port.js';
import type { RunSignalPushPort } from './ports/run-signal-push.port.js';
// TYPE-ONLY: the frozen Phase-11 metrics seam (erased at build; the VALUE is
// late-bound by bootstrap via `setMetrics` — no runtime conductor→observability edge).
import type { MetricsPort } from '../observability/ports/metrics.port.js';
import type { PrReviewPort } from './ports/pr-review.port.js';
import type { WorkspaceRepositoryPort } from './ports/workspace-repository.port.js';
import type {
  ReconcileFindingView,
  SteerInput,
  SubstrateAvailabilityView,
  WorkspaceView,
} from './types.js';
import type { ConductorModule, ConductorModuleDeps } from './index.js';
import type { CodeIntelPort, IssueRead } from './ports/code-intel.port.js';
import type {
  PreviewVerifyPort,
  PreviewVerificationView,
} from './ports/preview-verify.port.js';
import type { CoordinationAdmissionPort } from './ports/coordination-admission.port.js';
import type { ConductorPlanPort } from './ports/plan.port.js';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import { toLoggerPort } from './adapters/logger.adapter.js';
import { createRecoderSessionLister } from './adapters/recoder-session-lister.adapter.js';
import {
  createConductorRegistry,
  type ConductorRegistry,
} from './adapters/substrate-registry.adapter.js';
import type { ConductorRuntimeView } from './adapters/runtime-listing.adapter.js';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import { tryCreateSqliteWorkspaceRepository } from './adapters/sqlite-workspace-repository.adapter.js';
import { resolveStateOfRecordSqlitePath } from '../../shared/state-of-record.js';
import type { ConductorRunTailer } from './adapters/run-tailer.adapter.js';
import { createSubstrateScan } from './adapters/substrate-scan.adapter.js';
import { TerminalStreamService } from './terminal/terminal-stream.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';
import { canAccessWorkspace } from './routes/workspace-access.js';
import { buildConductorMcpTools } from './mcp/conductor-engine.js';
import {
  buildConductorWriteTools,
  buildConductorPreviewEvidenceTools,
} from './mcp/conductor-write-tools.js';
import { buildConductorWaitTools } from './mcp/conductor-wait-tool.js';
import { buildConductorCockpitTools } from './mcp/conductor-cockpit-tool.js';
import {
  WaitService,
  type WaitOutcome,
  type WaitRequest,
} from './wait/wait.service.js';
import {
  createPollingWaitSource,
  createRealWaitTimer,
} from './wait/wait-source.js';
import type { McpInjectPort } from './ports/mcp-inject.port.js';
import { buildConductorHealth } from './health.js';
import type {
  WorkspaceDiffView,
  WorkspaceDiffFilesView,
  WorkspaceFilePatchView,
  WorkspaceTreeView,
} from './review/workspace-review.ops.js';
import type { WorkspaceDiscardView } from './review/workspace-discard.ops.js';
import type { WorkspaceDiscardHunksView } from './review/workspace-discard-hunks.ops.js';
import type {
  CreatePrInput,
  CreatePrResultView,
  MergeInput,
  MergeResultView,
} from './review/workspace-publish.ops.js';
import type {
  ContinueWorkspaceInput,
  ContinueWorkspaceResult,
} from './review/workspace-continue.ops.js';
import type { ReviewComment } from './review/review-comments.js';
import type {
  PreviewVerifyOptions,
  PreviewVerifyResult,
} from './services/preview-verify.service.js';
import type { DevCommandView } from './adapters/dev-command.adapter.js';
import type {
  CheckpointRecord,
  CheckpointStorePort,
} from './ports/checkpoint-store.port.js';
import { createGitCheckpointStore } from './adapters/git-checkpoint-store.adapter.js';
import type {
  BranchResultView,
  RestoreResultView,
} from './services/checkpoint.service.js';
import type { WorkspaceQueryFilters } from './services/workspace-query.service.js';
import { buildCompareRoutes } from './routes/compare.routes.js';
import { buildCheckpointRoutes } from './routes/checkpoint.routes.js';
import { buildWorkspaceQueryRoutes } from './routes/workspaces-query.routes.js';
import { buildRepoConfigRoutes } from './routes/repo-config.routes.js';
import { RepoSetupService } from './services/repo-setup.service.js';
import { PrStatusService } from './services/pr-status.service.js';
import {
  RepoCloneService,
  type CloneRepoInput,
  type CloneRepoOutcome,
} from './services/repo-clone.service.js';
import {
  PrChecksService,
  type WorkspaceChecksView,
} from './services/pr-checks.service.js';
import {
  MergeabilityService,
  type MergeabilityView,
} from './services/mergeability.service.js';
import { WorktreeStatusService } from './services/worktree-status.service.js';
import { createWorktreeCheckRunner, type CheckSpec } from './adapters/check-runner.adapter.js';
import type { CheckRunnerPort } from './services/check-run.service.js';
import { createLlmReviewGenerator } from './adapters/review-generator.adapter.js';
import { validateFindings, type ReviewFindingsPort, type ValidatedFindings } from './services/review-findings.service.js';
import { conductorTarget, guardConductorWrite } from './audit/conductor-audit.js';
import {
  EnvironmentImportService,
  type EnvironmentImportView,
} from './services/environment-import.js';
import {
  SessionTranscriptService,
  type TranscriptSearchView,
  type WorkspaceTranscriptView,
} from './services/session-transcript.service.js';
import type { ReadinessView } from './services/readiness.service.js';
import type { ConvergenceEvidenceRecord } from './evidence/convergence-evidence.js';
import type { ConvergenceTrust } from './evidence/convergence-trust.js';
import type { EvidenceExport } from './evidence/evidence-export.js';
import { loadEvidenceSigningKey } from './evidence/evidence-signing.js';
import type { PreviewEvidencePack } from './evidence/preview-evidence.js';
import type { KeyObject } from 'node:crypto';
import type { ConvergencePlan } from './converge/converge-plan.service.js';
import type {
  ComposeConvergenceInput,
  ComposeConvergenceResult,
  ConvergeInferenceFn,
} from './converge/converge.ops.js';
import { createInMemoryRepoSetupStore } from './adapters/repo-setup-store.adapter.js';
import type {
  CompareView,
  AdHocCompareOutcome,
} from './services/compare.service.js';
import type { PairwiseDiffView } from './services/pairwise-diff.service.js';
import type { FileVersionsView } from './converge/converge.ops.js';
import type {
  WorkspaceGridPort,
  GroupGridArrangement,
} from './ports/workspace-grid.port.js';
import {
  type ConductorContext,
  type ConductorWriteResult,
  type CreateConductorWorkspaceInput,
  type ReviewCommentDelivery,
  type WorkspaceRunConfigView,
} from './module/shared.js';
import { ConductorIntrospection } from './module/introspection.js';
import { ConductorCheckpoints } from './module/checkpoints.js';
import { ConductorPreview } from './module/preview.js';
import {
  ConductorCompareConverge,
  type AdHocReject,
  type AdHocPlanOutcome,
} from './module/compare-converge.js';
import type { CockpitSnapshot } from './cockpit/converge-cockpit.service.js';
import { ConductorReads } from './module/reads.js';
import { ConductorGovernedWrites } from './module/governed-writes.js';
import { buildRunEventPipeline } from './module/run-event-pipeline.js';
import {
  ConvergeFanoutService,
  type FanoutComposeOutcome,
  type FanoutInput,
  type FanoutResult,
  type FanoutWorkspaceCreateOutcome,
  type FanoutWorkspaceCreateRequest,
} from './fanout/converge-fanout.service.js';
import { buildConductorFanoutTools } from './mcp/conductor-fanout-tool.js';
import { buildConductorFanoutFromIssueTools } from './mcp/conductor-fanout-from-issue-tool.js';
import {
  buildConductorSkillTools,
  type VerifiedSkillView,
} from './mcp/conductor-skill-tools.js';
import type { SkillRegistry } from './skill/skill-registry.js';
import type {
  InvokeSkillActionResult,
  SkillActionService,
} from './skill/skill-action.service.js';
import {
  NeedsYouQueueService,
  type NeedsYouScope,
  type NeedsYouSnapshot,
} from './attention/needs-you-queue.service.js';
import { buildConductorNeedsYouTools } from './mcp/conductor-needs-you-tool.js';
import {
  StatusBoardService,
  type StatusBoardScope,
  type StatusBoardSnapshot,
} from './attention/status-board.service.js';
import { buildConductorStatusBoardTools } from './mcp/conductor-status-board-tool.js';
import { buildConductorReviewTools } from './mcp/conductor-review-tool.js';
import {
  RemoteAttachService,
  type RemoteAttachExternalDeps,
} from './remote-attach/remote-attach.service.js';
import type {
  RemoteAttachCapability,
  RemoteAttachScope,
  RemoteAttachSession,
  RemoteSteerResult,
} from './remote-attach/remote-attach.types.js';
import { buildConductorRemoteAttachTools } from './mcp/conductor-remote-attach-tool.js';
import {
  ReFanService,
  type PriorConvergence,
  type ReFanInput,
  type ReFanResult,
} from './fanout/re-fan.service.js';
import { buildConductorReFanTools } from './mcp/conductor-refan-tool.js';
import type { ConvergenceProvenance } from './converge/converge.ops.js';
import {
  SwarmUnblockService,
  type ResolveBlockedInput,
  type SwarmUnblockDeps,
  type SwarmUnblockResult,
} from './swarm/swarm-unblock.service.js';
import { buildConductorSwarmUnblockTools } from './swarm/swarm-unblock-tool.js';
import { PlaybookService } from './playbook/playbook.service.js';
import type {
  PlaybookRunInput,
  PlaybookRunResult,
} from './playbook/playbook.types.js';
import { buildConductorPlaybookTools } from './mcp/conductor-playbook-tool.js';
import { createError, ErrorCode } from '../../shared/errors.js';

// The public result/read-model types + the advance-target whitelist moved to
// `module/shared.ts` with the collaborator split; re-exported here so every
// existing `from './conductor-module.js'` import keeps resolving unchanged.
export { ADVANCE_TARGET_STATES } from './module/shared.js';
export type {
  ConductorWriteResult,
  CreateConductorWorkspaceInput,
  ReviewCommentDelivery,
  WorkspaceRunConfigView,
} from './module/shared.js';

/** How many trailing terminal lines the attention probe captures. */
const ATTENTION_TAIL_LINES = 60;

/** Flatten a TensorZero inference `content` (string | text-block array) to text. */
function inferenceContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
        return (block as { text: string }).text;
      }
      return '';
    })
    .join('');
}

export class ConductorComposer implements ConductorModule {
  readonly name = 'conductor' as const;

  private readonly log: Logger;
  private readonly cfg: ConductorConfig;
  /** Memoized Ed25519 evidence-signing key (`undefined` = not resolved; `null` = unsigned). */
  private evidenceSigningKey: KeyObject | null | undefined;
  private readonly gate: ConductorModuleDeps['gate'];
  private readonly middleware: ConductorModuleDeps['middleware'];
  /** Optional Idempotency-Key replay guard for `POST /workspaces` (BE-10.3). */
  private readonly idempotency: ConductorModuleDeps['idempotency'];
  private readonly registry: ConductorRegistry;
  private readonly repository: WorkspaceRepositoryPort;
  private readonly tailer: ConductorRunTailer;
  private readonly terminalService: TerminalStreamService;
  private readonly engine: WorkspaceEngine;
  private readonly engineDeps: WorkspaceEngineDeps;
  /** OPTIONAL memory-backed brain (recall on launch + harvest on completion). */
  private readonly brain?: ConductorBrainMemory;
  /**
   * OPTIONAL swarm auto-unblock seams (LOOM-ROADMAP.md #3): the injected read /
   * memory-search / sibling-decision / policy / approval / prompt / remember wiring
   * the `recoder_swarm_unblock` tool drives. Absent ⇒ the tool refuses truthfully
   * (`SERVICE_UNAVAILABLE`) rather than fabricating an escalation/answer.
   */
  private readonly swarmUnblock?: SwarmUnblockDeps;
  /**
   * OPTIONAL live Needs-You queue (LOOM-ROADMAP.md build-now #4): a PUSH-driven ranked
   * queue of panes needing the human, fed by ONE Loom `events.subscribe` stream. Absent
   * ⇒ `needsYouSnapshot` + the `recoder_needs_you` tool refuse truthfully
   * (`SERVICE_UNAVAILABLE`), never a faked empty queue.
   */
  private readonly needsYouQueue?: NeedsYouQueueService;
  /**
   * OPTIONAL live native STATUS BOARD (LOOM-ROADMAP.md build-now #5): a PULL read that folds ONE
   * Loom `session.snapshot` into per-attention columns of ALL the caller's live panes. Absent ⇒
   * `statusBoardSnapshot` + the `recoder_status_board` tool refuse truthfully
   * (`SERVICE_UNAVAILABLE`), never a faked empty board.
   */
  private readonly statusBoard?: StatusBoardService;
  /**
   * OPTIONAL GOVERNED REMOTE ATTACH (LOOM Bigger Bet C): mints short-lived, owner-scoped
   * sessions for an authenticated remote/mobile client to MONITOR (reuses the status board)
   * and opt-in STEER (evaluatePolicy → approval/deliver → audit) the caller's OWN live
   * agents. Constructed ONLY when bootstrap wires the steer/policy/approval/audit seams;
   * absent ⇒ `remoteAttach`/`remoteSnapshot`/`remoteSteer` (and the `recoder_remote_*`
   * tools) refuse truthfully (`SERVICE_UNAVAILABLE`), never a faked session/snapshot/steer.
   */
  private readonly remoteAttachService?: RemoteAttachService;
  /**
   * OPTIONAL governed SKILL MODEL (LOOM Bigger Bet A): a registry that exposes ONLY
   * signature+pinning-VERIFIED manifests, and the invoke service that runs
   * `evaluatePolicy` BEFORE any execution. Absent ⇒ `listVerifiedSkills` +
   * `invokeSkillAction` (and the `recoder_skill_*` tools) refuse truthfully
   * (`SERVICE_UNAVAILABLE`), never a faked list/execution.
   */
  private readonly skillRegistry?: SkillRegistry;
  private readonly skillActions?: SkillActionService;
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
  /** OPTIONAL substrate-routed live transport; absent ⇒ steering refuses truthfully. */
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
  /**
   * OPTIONAL metrics seam (set by bootstrap `setMetrics` after observability is
   * composed; absent ⇒ no run RED/USE series). Read by the completion-hook thunk
   * on each terminal event — the BE-7.3 conductor feed into the frozen MetricsPort.
   */
  private metrics?: MetricsPort;
  /**
   * OPTIONAL advisory PR auto-review port (set by bootstrap `setPrReview`;
   * absent ⇒ the readiness `review` facet stays a truthful `null`). Probed by
   * `workspaceReadiness` ONLY when a real open PR + a worktree exist — NEVER a
   * 6th readiness signal, never a verdict input.
   */
  private prReview?: PrReviewPort;
  /** Checkpoint metadata store (git-tag-backed durable store by default). */
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
  /** Read-only worktree open-work (uncommitted changes) probe (git-native, degrade-truthful). */
  private readonly worktreeStatus: WorktreeStatusService;
  private readonly checkRunner: CheckRunnerPort;
  private readonly reviewGenerator: ReviewFindingsPort;
  /** Read-only first-run environment-import probe (git identity, agent configs, gh, shell). */
  private readonly environmentImportService: EnvironmentImportService;
  /** Read-only bounded search over Claude session transcripts (~/.claude/projects). */
  private readonly sessionTranscriptService: SessionTranscriptService;
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
  /**
   * OPTIONAL degrade-safe one-shot inference for ASSISTED convergence synthesis —
   * the headline LLM conflict-resolution seam. A constructor dep (inference is
   * composed BEFORE the conductor in bootstrap, so a direct bind needs no late
   * setter); read by `compare-converge.convergeDeps` via `ctx.infer`. Absent ⇒
   * every assisted conflict degrades truthfully to synthesize-conflict.
   */
  private readonly infer?: ConvergeInferenceFn;
  private started = false;
  /** The narrow facade-bound dep slice the collaborators run over. */
  private readonly ctx: ConductorContext;
  private readonly introspection: ConductorIntrospection;
  private readonly checkpoints: ConductorCheckpoints;
  private readonly preview: ConductorPreview;
  private readonly compareConverge: ConductorCompareConverge;
  private readonly reads: ConductorReads;
  private readonly writes: ConductorGovernedWrites;

  constructor(deps: ConductorModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceConductorConfig(deps.config, deps.overrides ?? {});
    this.gate = deps.gate;
    this.middleware = deps.middleware;
    this.idempotency = deps.idempotency;
    this.brain = deps.brain;
    this.skillRegistry = deps.skillRegistry;
    this.skillActions = deps.skillActions;
    this.swarmUnblock = deps.swarmUnblock;
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
    this.infer = deps.infer;
    // Durable by default WITHOUT a database: metadata rides each workspace repo's
    // annotated `recoder-checkpoint/<id>` tags, rebuilt on list after a restart
    // (the desktop relaunches the embedded backend every app start). The
    // `getWorkspace` closure is lazy — `this.engine` is constructed later in this
    // ctor and only dereferenced at request time.
    this.checkpointStore =
      deps.checkpointStore ??
      createGitCheckpointStore({
        getWorkspace: id => this.engine.getWorkspace(id),
        logger: this.log,
      });

    // Per-repo setup script: config seam (governed setScript/getScript) + the
    // fire-and-forget run hook shelled into every fresh worktree. Degrade-safe
    // in-process store by default (durable store injectable at the root).
    this.repoSetup = new RepoSetupService({
      store: deps.repoSetupStore ?? createInMemoryRepoSetupStore(),
      gate: this.gate,
      logger: this.log,
      ...(deps.repoSetupExec ? { exec: deps.repoSetupExec } : {}),
      ...(deps.repoSetupReadConfigFile
        ? { readConfigFile: deps.repoSetupReadConfigFile }
        : {}),
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
    // Read-only worktree open-work probe over the SAME git seam (never throws;
    // truthful `available:false` when git/worktree is absent — never a fake clean).
    this.worktreeStatus = new WorktreeStatusService({ logger: this.log });
    // Recoder's OWN check runner (recoder-fxee): live-wired but OPT-IN — it runs the
    // configured check allowlist in the worktree and folds real pass/fail into the
    // `checks` readiness signal. Default is EMPTY (inert, GitHub-only) so no behavior
    // changes until a deployment supplies a checks list; configuring `checks` activates it.
    const configuredChecks: readonly CheckSpec[] = [];
    this.checkRunner = createWorktreeCheckRunner({
      getWorkspace: (id) => this.getWorkspace(id),
      checks: configuredChecks,
      logger: this.log,
    });
    // LLM review generator (recoder-7z42) — ACTIVATED over the SAME injected inference
    // one-shot that assisted convergence uses (`this.infer`, TZ function 'recoder_default').
    // Absent inference ⇒ a null-completing generator (inert). Findings it produces are
    // CANDIDATES; `generateReviewFindings` runs the deterministic validator over them.
    const reviewComplete: (prompt: string) => Promise<string | null> = this.infer
      ? async (prompt) => {
          const res = await this.infer!({
            function_name: 'recoder_default',
            input: { messages: [{ role: 'user', content: prompt }] },
          });
          if (!res.routed) return null;
          const text = inferenceContentToText(res.content);
          return text.trim() ? text : null;
        }
      : async () => null;
    this.reviewGenerator = createLlmReviewGenerator({ complete: reviewComplete, logger: this.log });
    // Read-only first-run environment probe (git identity, agent configs, gh, shell)
    // over the SAME exec seam; never throws, degrades each field independently.
    this.environmentImportService = new EnvironmentImportService({
      logger: this.log,
    });
    // Read-only bounded transcript search over ~/.claude/projects; degrade-truthful.
    this.sessionTranscriptService = new SessionTranscriptService({
      logger: this.log,
    });

    const loggerPort = toLoggerPort(this.log);

    // Substrate registry + truthful availability (empty ⇒ launches fail truthfully).
    this.registry = createConductorRegistry({
      config: this.cfg,
      ...(deps.substrates ? { substrates: deps.substrates } : {}),
    });

    // Workspace repository over the persistence executor (degrade-safe in-process).
    // The canonical run/event tables (TaskRun/RunEvent/TaskSpec) delegate to the
    // injected agent-os state-of-record store so run history survives a restart
    // (P1 #8); absent it / DB-less they fall back truthfully (isDurable ⇒ false).
    // Driver selection mirrors agent-os EXACTLY (same activation seam): when
    // the state-of-record is the embedded sqlite file (DB-less desktop), the
    // conductor tables persist into the SAME file so workspaces + tail cursors
    // + reconcile findings survive a restart too (isDurable ⇒ true). An
    // unopenable file falls back to the executor-backed default, truthfully.
    const sqlitePath = resolveStateOfRecordSqlitePath(deps.config);
    const sqliteRepository =
      !deps.repository && sqlitePath
        ? tryCreateSqliteWorkspaceRepository(
            {
              path: sqlitePath,
              ...(deps.canonicalRunStore
                ? { canonicalStore: deps.canonicalRunStore }
                : {}),
            },
            this.log
          )
        : null;
    this.repository =
      deps.repository ??
      sqliteRepository ??
      createWorkspaceRepository({
        executor: deps.executor,
        ...(deps.canonicalRunStore
          ? { canonicalStore: deps.canonicalRunStore }
          : {}),
      });

    // Terminal surface owns the sync hub; steering is gated through this composer.
    this.terminalService = new TerminalStreamService({
      logger: this.log,
      steer: async (input, ctx) => {
        const result = await this.steerWorkspace(input, ctx.principal);
        if (!result.ok) throw new Error(result.reason ?? 'steer denied');
      },
      ...(deps.interactiveTerminal
        ? {
            attach: async (workspaceId, cols, rows, ctx) => {
              const workspace = await this.engine.getWorkspace(workspaceId);
              if (
                !workspace ||
                !canAccessWorkspace(ctx.principal, workspace, {
                  soloMode: this.cfg.soloMode,
                })
              ) {
                throw new Error('workspace unavailable');
              }
              if (workspace.substrate !== 'loom' || !workspace.sessionName) {
                throw new Error('workspace has no Loom terminal');
              }
              return deps.interactiveTerminal!.attach({
                paneId: workspace.sessionName,
                cols,
                rows,
              });
            },
          }
        : {}),
    });

    // Run-event pipeline: local durable+live sink → external fan-out → completion
    // hook → sibling awareness → live tailer (module/run-event-pipeline.ts). The
    // late-bound seams below read the CURRENT bootstrap bindings per event.
    this.tailer = buildRunEventPipeline({
      log: this.log,
      cfg: this.cfg,
      registry: this.registry,
      repository: this.repository,
      terminalService: this.terminalService,
      externalSink: deps.runEventSink,
      ...(this.brain ? { brain: this.brain } : {}),
      ...(this.codeIntel ? { codeIntel: this.codeIntel } : {}),
      getMeter: () => this.usageMeter,
      getRunSignalPush: () => this.runSignalPush,
      getMetrics: () => this.metrics,
      siblings: id => this.workspaceSiblings(id),
      steer: (input, principal) => this.steerWorkspace(input, principal),
    });

    // The engine deps assembled behind the ports.
    this.engineDeps = {
      registry: this.registry.registry,
      repository: this.repository,
      runTailer: this.tailer,
      scan: createSubstrateScan(deps.substrateScan ?? {}),
      // Native agent-session resume (crash-orphan lossless recovery): a crashed
      // `running` orphan carrying a durable native session ref is relaunched via the
      // agent's own resume instead of being finalized to `failed`. Injection-safe
      // (session ref carried as argv DATA); a runtime with no native resume yields
      // null ⇒ that orphan stays truthfully finalized-to-failed.
      resume: { plan: resumePlan, dedupeKey },
      logger: loggerPort,
      clock: systemClock,
      id: uuidId,
      ...(deps.brain ? { brain: deps.brain } : {}),
      ...(deps.lock ? { lock: deps.lock } : {}),
      ...(deps.admission ? { admission: deps.admission } : {}),
    };
    this.engine = new WorkspaceEngine(this.engineDeps);

    // Collaborator wiring: every method group runs over the SAME narrow context
    // slice; cross-group calls route through facade-bound closures (lazy — the
    // collaborators may reference each other only at call time).
    this.ctx = this.buildContext();
    this.introspection = new ConductorIntrospection(this.ctx);
    this.checkpoints = new ConductorCheckpoints(this.ctx);
    this.preview = new ConductorPreview(this.ctx);
    this.compareConverge = new ConductorCompareConverge(this.ctx);
    this.reads = new ConductorReads(this.ctx);
    this.writes = new ConductorGovernedWrites(this.ctx);

    // Live Needs-You queue (build-now #4): constructed ONLY when bootstrap wires the
    // push-stream source (the bridge over the EXISTING Loom daemon socket). Started in
    // `start()`, torn down in `stop()`. Absent ⇒ the read/tool refuse truthfully.
    this.needsYouQueue = deps.needsYouStream
      ? new NeedsYouQueueService({
          source: deps.needsYouStream,
          ...(deps.needsYouScheduler
            ? { scheduler: deps.needsYouScheduler }
            : {}),
          logger: loggerPort,
        })
      : undefined;

    // Live native status board (build-now #5): constructed ONLY when bootstrap wires the
    // `session.snapshot` pull source (a second CLIENT over the EXISTING Loom daemon socket —
    // never a second daemon). Attribution is authoritative-record-first: the injected pane
    // source maps pane→workspace, and THIS composer's own durable `getWorkspace` supplies
    // kind/owner/taskGroup. Absent ⇒ the read/tool refuse truthfully (SERVICE_UNAVAILABLE).
    this.statusBoard = deps.statusBoardPanes
      ? new StatusBoardService({
          loadPanes: deps.statusBoardPanes,
          getWorkspace: id => this.getWorkspace(id),
          logger: loggerPort,
        })
      : undefined;

    // Governed remote attach (Bigger Bet C): constructed ONLY when bootstrap wires the
    // external seams (steer transport + policy + approval + audit). The two READS it needs
    // — ownership (`getWorkspace`) and the live monitor board (`statusBoardSnapshot`, which
    // itself refuses SERVICE_UNAVAILABLE when the board is unwired) — are bound from THIS
    // composer, so identity + ownership are re-verified on every call. Absent ⇒ the tools +
    // methods refuse truthfully (SERVICE_UNAVAILABLE), never a faked session/snapshot/steer.
    this.remoteAttachService = deps.remoteAttach
      ? new RemoteAttachService({
          getWorkspace: id => this.getWorkspace(id),
          readStatusBoard: (scope, principal) =>
            this.statusBoardSnapshot(scope, principal),
          logger: loggerPort,
          ...deps.remoteAttach,
        })
      : undefined;
  }

  private buildContext(): ConductorContext {
    // EVERY field is a live getter over the composer's own field — the moved
    // bodies read `this.<field>` at CALL time today, so a late rebinding (a
    // bootstrap setter, or a test overriding a private probe) must stay visible.
    const self = this;
    return {
      get log() {
        return self.log;
      },
      get cfg() {
        return self.cfg;
      },
      get gate() {
        return self.gate;
      },
      get registry() {
        return self.registry;
      },
      get repository() {
        return self.repository;
      },
      get tailer() {
        return self.tailer;
      },
      get terminalService() {
        return self.terminalService;
      },
      get engine() {
        return self.engine;
      },
      get engineDeps() {
        return self.engineDeps;
      },
      get checkpointStore() {
        return self.checkpointStore;
      },
      get repoSetup() {
        return self.repoSetup;
      },
      get prStatus() {
        return self.prStatus;
      },
      get prChecks() {
        return self.prChecks;
      },
      get repoClone() {
        return self.repoClone;
      },
      get mergeability() {
        return self.mergeability;
      },
      get worktreeStatus() {
        return self.worktreeStatus;
      },
      get checkRunner() {
        return self.checkRunner;
      },
      get environmentImportService() {
        return self.environmentImportService;
      },
      get sessionTranscriptService() {
        return self.sessionTranscriptService;
      },
      get brain() {
        return self.brain;
      },
      get codeIntel() {
        return self.codeIntel;
      },
      get previewVerify() {
        return self.previewVerify;
      },
      get plan() {
        return self.plan;
      },
      get coordinationAdmission() {
        return self.coordinationAdmission;
      },
      get colbertIndex() {
        return self.colbertIndex;
      },
      get github() {
        return self.github;
      },
      get steerTransport() {
        return self.steerTransport;
      },
      get onDeliveryFeedback() {
        return self.onDeliveryFeedback;
      },
      get mcpInject() {
        return self.mcpInject;
      },
      get workspaceGrid() {
        return self.workspaceGrid;
      },
      get tmuxIntrospect() {
        return self.tmuxIntrospect;
      },
      get auditReader() {
        return self.auditReader;
      },
      get entitlementGate() {
        return self.entitlementGate;
      },
      get prReview() {
        return self.prReview;
      },
      get infer() {
        return self.infer;
      },
      getWorkspace: id => self.getWorkspace(id),
      buildWorkspaceView: workspace => self.reads.buildWorkspaceView(workspace),
      workspaceSiblings: (id, principal) =>
        self.workspaceSiblings(id, principal),
      workspaceReadiness: id => self.workspaceReadiness(id),
      getPreviewVerification: id => self.getPreviewVerification(id),
      resolveEvidenceSigningKey: () => self.resolveEvidenceSigningKey(),
    };
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
   * Inject the frozen metrics seam (BE-7.3 conductor RED/USE feed). SINGLE-WRITER:
   * this is the ONLY mutation of `this.metrics`, called once at bootstrap after
   * observability exists — same discipline as `setRunSignalPush`. Read by the
   * completion-hook thunk on each terminal event; unwired ⇒ no series recorded.
   */
  setMetrics(metrics: MetricsPort): void {
    this.metrics = metrics;
  }

  /**
   * Inject the optional advisory PR auto-review port (the readiness `review`
   * facet). SINGLE-WRITER: this is the ONLY mutation of `this.prReview`, called
   * once at bootstrap after the engines module exists — same discipline as
   * `setRunSignalPush`. Unwired ⇒ the facet is absent, truthful.
   */
  setPrReview(port: PrReviewPort): void {
    this.prReview = port;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.reads.listWorkspaces();
  }

  async queryWorkspaces(filters: WorkspaceQueryFilters): Promise<Workspace[]> {
    return this.reads.queryWorkspaces(filters);
  }

  async listArchivedWorkspaces(): Promise<Workspace[]> {
    return this.reads.listArchivedWorkspaces();
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.reads.getWorkspace(workspaceId);
  }

  async createWorkspace(
    input: CreateConductorWorkspaceInput,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    return this.writes.createWorkspace(input, principal);
  }

  async steerWorkspace(
    input: SteerInput,
    principal: Principal
  ): Promise<ConductorWriteResult<void>> {
    return this.writes.steerWorkspace(input, principal);
  }

  async sendReviewComments(
    input: {
      readonly workspaceId: string;
      readonly comments: readonly ReviewComment[];
    },
    principal: Principal
  ): Promise<ConductorWriteResult<ReviewCommentDelivery>> {
    return this.writes.sendReviewComments(input, principal);
  }

  async stopWorkspace(
    workspaceId: string,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    return this.writes.stopWorkspace(workspaceId, principal);
  }

  async advanceWorkspaceState(
    workspaceId: string,
    to: WorkspaceState,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    return this.writes.advanceWorkspaceState(workspaceId, to, principal);
  }

  async reconcile(
    principal: Principal
  ): Promise<ConductorWriteResult<ReconcileReport>> {
    return this.writes.reconcile(principal);
  }

  // --- checkpoints & restore (git snapshot capability) -------------------------

  async checkpointWorkspace(
    workspaceId: string,
    input: { label?: string; description?: string },
    principal: Principal
  ): Promise<ConductorWriteResult<CheckpointRecord>> {
    return this.checkpoints.checkpointWorkspace(workspaceId, input, principal);
  }

  async listWorkspaceCheckpoints(
    workspaceId: string
  ): Promise<readonly CheckpointRecord[]> {
    return this.checkpoints.listWorkspaceCheckpoints(workspaceId);
  }

  async restoreCheckpoint(
    workspaceId: string,
    checkpointId: string,
    principal: Principal
  ): Promise<ConductorWriteResult<RestoreResultView>> {
    return this.checkpoints.restoreCheckpoint(
      workspaceId,
      checkpointId,
      principal
    );
  }

  async branchFromCheckpoint(
    workspaceId: string,
    checkpointId: string,
    input: {
      branch?: string;
      runtimeId?: string;
      taskId?: string;
      prompt?: string;
    },
    principal: Principal
  ): Promise<ConductorWriteResult<BranchResultView>> {
    return this.checkpoints.branchFromCheckpoint(
      workspaceId,
      checkpointId,
      input,
      principal
    );
  }

  async substrates(): Promise<readonly SubstrateAvailabilityView[]> {
    return this.introspection.substrates();
  }

  async runtimes(): Promise<readonly ConductorRuntimeView[]> {
    return this.introspection.runtimes();
  }

  async githubStatus(): Promise<GithubStatusView> {
    return this.introspection.githubStatus();
  }

  async githubRepos(): Promise<readonly GithubRepoView[]> {
    return this.introspection.githubRepos();
  }

  async cloneRepo(input: CloneRepoInput): Promise<CloneRepoOutcome> {
    return this.introspection.cloneRepo(input);
  }

  async workspaceChecks(
    workspaceId: string
  ): Promise<WorkspaceChecksView | null> {
    return this.introspection.workspaceChecks(workspaceId);
  }

  // --- workspace detail (the run screen): reads --------------------------------

  async listWorkspaceEvents(workspaceId: string): Promise<RunEvent[]> {
    return this.reads.listWorkspaceEvents(workspaceId);
  }

  async workspaceOutput(
    workspaceId: string,
    lines?: number
  ): Promise<{ output: string }> {
    return this.reads.workspaceOutput(workspaceId, lines);
  }

  async workspaceStatus(workspaceId: string): Promise<{
    alive: boolean;
    exitCode: number | null;
    recentOutput: string | null;
    state: Workspace['state'];
    reason?: string;
  }> {
    return this.reads.workspaceStatus(workspaceId);
  }

  // --- workspace views (attention-enriched read model) --------------------------

  async workspaceView(workspaceId: string): Promise<WorkspaceView | null> {
    return this.reads.workspaceView(workspaceId);
  }

  async listWorkspaceViews(): Promise<WorkspaceView[]> {
    return this.reads.listWorkspaceViews();
  }

  /**
   * Block until the workspace settles (the `recoder_workspace_wait` primitive).
   * Composes the pure {@link WaitService} over a POLLING source that re-probes the
   * authoritative attention snapshot (`reads.attentionSnapshot`) and a wall-clock
   * timer. Read-only + degrade-truthful: a gone workspace ends the stream
   * (`stream-ended`), a timeout carries the last classified state, and a pinned
   * run that is superseded resolves `run-superseded` — never a fabricated settle.
   */
  async waitForWorkspaceSettle(request: WaitRequest): Promise<WaitOutcome> {
    const service = new WaitService({
      source: createPollingWaitSource({
        probe: id => this.reads.attentionSnapshot(id),
      }),
      timer: createRealWaitTimer(),
    });
    return service.waitUntilSettled(request);
  }

  // --- multi-agent compare (F3 parallel-run groups): read-only ------------------

  async compareTaskGroup(
    taskGroup: string,
    principal?: Principal
  ): Promise<CompareView> {
    return this.compareConverge.compareTaskGroup(taskGroup, principal);
  }

  async workspaceSiblings(
    workspaceId: string,
    principal?: Principal
  ): Promise<CompareView | null> {
    return this.compareConverge.workspaceSiblings(workspaceId, principal);
  }

  async pairwiseDiff(
    taskGroup: string,
    aId: string,
    bId: string,
    paths: readonly string[] | undefined,
    principal?: Principal
  ): Promise<PairwiseDiffView | null> {
    return this.compareConverge.pairwiseDiff(
      taskGroup,
      aId,
      bId,
      paths,
      principal
    );
  }

  async fileVersions(
    taskGroup: string,
    relPath: string,
    principal?: Principal
  ): Promise<FileVersionsView | null> {
    return this.compareConverge.fileVersions(taskGroup, relPath, principal);
  }

  /**
   * The LIVE convergence cockpit snapshot (`recoder_converge_cockpit`,
   * LOOM-ROADMAP.md §1 build-now #1) — makes a fan-out OBSERVABLE by folding each
   * pane's live status with the shipped read-only convergence probe + N-up columns.
   * Ownership-narrowed (recoder-kybr): an unknown/unowned group ⇒ `null` (truthful miss).
   */
  async convergeCockpit(
    taskGroup: string,
    principal?: Principal
  ): Promise<CockpitSnapshot | null> {
    return this.compareConverge.convergeCockpit(taskGroup, principal);
  }

  async arrangeCompareGrid(
    taskGroup: string,
    principal: Principal
  ): Promise<ConductorWriteResult<GroupGridArrangement | null>> {
    return this.compareConverge.arrangeCompareGrid(taskGroup, principal);
  }

  /**
   * Swarm auto-unblock (`recoder_swarm_unblock`, LOOM-ROADMAP.md #3): resolve a
   * BLOCKED fan-out pane from Recoder-only sources (memory + a sibling that already
   * decided) and ESCALATE BY DEFAULT via the approval gate. Composes the injected
   * seams through the pure {@link SwarmUnblockService}; when the seams are not wired
   * the tool refuses truthfully rather than fabricating an escalation/answer.
   */
  async resolveSwarmUnblock(
    input: ResolveBlockedInput
  ): Promise<SwarmUnblockResult> {
    if (!this.swarmUnblock) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: swarm auto-unblock is not configured on this deployment'
      );
    }
    const service = new SwarmUnblockService({
      ...this.swarmUnblock,
      logger: this.swarmUnblock.logger ?? toLoggerPort(this.log),
    });
    return service.resolveBlocked(input);
  }

  /**
   * The LIVE Needs-You queue projection (`recoder_needs_you`, LOOM-ROADMAP.md build-now
   * #4). Reads the push-driven ranked queue for a scope; a non-privileged principal is
   * PINNED to its OWN panes (defense-in-depth alongside the tool's owner scope), so it
   * can never read another tenant's queue. Unwired ⇒ `SERVICE_UNAVAILABLE` (truthful),
   * never a fabricated empty queue.
   */
  async needsYouSnapshot(
    scope: NeedsYouScope,
    principal: Principal
  ): Promise<NeedsYouSnapshot> {
    if (!this.needsYouQueue) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: the live Needs-You queue is not configured on this deployment'
      );
    }
    const scopes = principal.scopes ?? [];
    const privileged = scopes.includes('admin') || scopes.includes('internal');
    const effective: NeedsYouScope = privileged
      ? scope
      : { ...scope, owner: principal.userId };
    return this.needsYouQueue.snapshot(effective);
  }

  /**
   * The LIVE native status board projection (`recoder_status_board`, LOOM-ROADMAP.md build-now
   * #5). Reads ONE Loom `session.snapshot` and buckets ALL the caller's live panes into
   * attention columns. A non-privileged principal is PINNED to its OWN panes (defense-in-depth
   * alongside the tool's owner scope), so it can never read another tenant's board. Unwired ⇒
   * `SERVICE_UNAVAILABLE` (truthful), never a fabricated empty board.
   */
  async statusBoardSnapshot(
    scope: StatusBoardScope,
    principal: Principal
  ): Promise<StatusBoardSnapshot> {
    if (!this.statusBoard) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: the live status board is not configured on this deployment'
      );
    }
    const scopes = principal.scopes ?? [];
    const privileged = scopes.includes('admin') || scopes.includes('internal');
    const effective: StatusBoardScope = privileged
      ? scope
      : { ...scope, owner: principal.userId };
    return this.statusBoard.snapshot(effective);
  }

  /**
   * GOVERNED REMOTE ATTACH — mint (`recoder_remote_attach`, LOOM Bigger Bet C). Verifies
   * the principal OWNS every workspace/taskGroup in scope (else 403) and mints a
   * short-lived, scoped session; `steer` is opt-in. Unwired ⇒ `SERVICE_UNAVAILABLE`
   * (truthful), never a faked session.
   */
  async remoteAttach(input: {
    readonly principal: Principal;
    readonly scope: RemoteAttachScope;
    readonly capabilities: readonly RemoteAttachCapability[];
  }): Promise<RemoteAttachSession> {
    if (!this.remoteAttachService) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: governed remote attach is not configured on this deployment'
      );
    }
    return this.remoteAttachService.attach({
      principal: input.principal,
      scope: input.scope,
      capabilities: input.capabilities,
    });
  }

  /**
   * GOVERNED REMOTE ATTACH — monitor (`recoder_remote_snapshot`). Re-derives identity +
   * re-verifies ownership, then returns an owner-scoped live snapshot filtered to the
   * session's minted scope. A wrong-principal / expired / out-of-scope session is refused
   * truthfully. Unwired ⇒ `SERVICE_UNAVAILABLE`, never a faked snapshot.
   */
  async remoteSnapshot(input: {
    readonly sessionId: string;
    readonly principal: Principal;
  }): Promise<StatusBoardSnapshot> {
    if (!this.remoteAttachService) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: governed remote attach is not configured on this deployment'
      );
    }
    return this.remoteAttachService.snapshot(input);
  }

  /**
   * GOVERNED REMOTE ATTACH — steer (`recoder_remote_steer`). Re-derives identity, requires
   * the `steer` capability + the workspace to be IN scope + live ownership, then runs
   * `evaluatePolicy` FIRST (deny ⇒ refuse; needs_approval ⇒ approval, not executed; allow ⇒
   * deliver via the loom `agent.prompt` seam + write an audit record). Unwired transport ⇒
   * `SERVICE_UNAVAILABLE`, never a faked delivery.
   */
  async remoteSteer(input: {
    readonly sessionId: string;
    readonly principal: Principal;
    readonly workspaceId: string;
    readonly input: string;
  }): Promise<RemoteSteerResult> {
    if (!this.remoteAttachService) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: governed remote attach is not configured on this deployment'
      );
    }
    return this.remoteAttachService.steer(input);
  }

  /**
   * List the VERIFIED skills (`recoder_skill_list`, LOOM Bigger Bet A). Reads the
   * registry that has ALREADY verified signature + pinned version at load, so only
   * trustworthy skills are ever projected. Unwired ⇒ `SERVICE_UNAVAILABLE`
   * (truthful), never a fabricated empty list.
   */
  async listVerifiedSkills(): Promise<readonly VerifiedSkillView[]> {
    if (!this.skillRegistry) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: the governed skill model is not configured on this deployment'
      );
    }
    return this.skillRegistry.list().map(({ manifest }) => ({
      id: manifest.id,
      version: manifest.version,
      publisherKeyId: manifest.publisherKeyId,
      actions: manifest.actions.map(action => ({
        id: action.id,
        title: action.title,
        requiredCapabilities: [...action.requiredCapabilities],
        params: Object.entries(action.paramsSchema).map(([name, spec]) => ({
          name,
          type: spec.type,
          required: spec.required === true,
          ...(spec.enum ? { enum: [...spec.enum] } : {}),
        })),
      })),
    }));
  }

  /**
   * Invoke ONE typed action of a VERIFIED skill (`recoder_skill_invoke`, LOOM Bigger
   * Bet A). Delegates to the {@link SkillActionService}, which runs `evaluatePolicy`
   * BEFORE any execution (deny ⇒ refuse; needs_approval ⇒ approval gate, not
   * executed; allow ⇒ the injected capability-scoped executor). An unknown/unsigned/
   * unpinned skill or params failing the typed schema ⇒ refused (never executed).
   * Unwired ⇒ `SERVICE_UNAVAILABLE` (truthful), never a faked execution.
   */
  async invokeSkillAction(input: {
    readonly skillId: string;
    readonly actionId: string;
    readonly params: unknown;
    readonly actorId: string;
    readonly workspace: string;
  }): Promise<InvokeSkillActionResult> {
    if (!this.skillActions) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'conductor: the governed skill model is not configured on this deployment'
      );
    }
    return this.skillActions.invoke(input);
  }

  async workspaceDiff(workspaceId: string): Promise<WorkspaceDiffView> {
    return this.reads.workspaceDiff(workspaceId);
  }

  async workspaceTree(workspaceId: string): Promise<WorkspaceTreeView> {
    return this.reads.workspaceTree(workspaceId);
  }

  async workspaceDiffFiles(
    workspaceId: string
  ): Promise<WorkspaceDiffFilesView> {
    return this.reads.workspaceDiffFiles(workspaceId);
  }

  async workspaceFilePatch(
    workspaceId: string,
    path: string
  ): Promise<WorkspaceFilePatchView> {
    return this.reads.workspaceFilePatch(workspaceId, path);
  }

  async workspaceMergeability(workspaceId: string): Promise<MergeabilityView> {
    return this.reads.workspaceMergeability(workspaceId);
  }

  /**
   * ON-DEMAND line-level AI review (recoder-7z42): generate candidate findings over the
   * workspace diff via the injected inference one-shot, then run the DETERMINISTIC
   * validator (evidence-grounding + confidence floor + dedup/rank/cap). On-demand — NOT
   * per readiness poll — so the LLM cost is paid only when a reviewer asks. Degrade-safe:
   * no inference / no diff / a bad reply ⇒ zero findings, never fabricated.
   */
  async generateReviewFindings(workspaceId: string, principal: Principal): Promise<ValidatedFindings> {
    // OWNERSHIP GATE (SECURITY): reveal a workspace's diff-derived review ONLY to a caller
    // authorized on that workspace — the same governance guard the write ops use, so this
    // is no cross-tenant review oracle. A denied caller is refused, never served findings.
    const workspace = await this.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, 'workspace.review', principal, {
      target: conductorTarget('workspace', workspaceId),
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId },
    });
    if (!allowed) {
      throw createError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        verdict.reason ?? 'not authorized to review this workspace',
      );
    }
    const diff = await this.reads.workspaceDiff(workspaceId).catch(() => null);
    const diffText = diff?.patch ?? '';
    const candidates = await this.reviewGenerator.review({ diffText, workspaceId });
    return validateFindings(candidates);
  }

  async workspaceReadiness(workspaceId: string): Promise<ReadinessView> {
    return this.reads.workspaceReadiness(workspaceId);
  }

  async workspaceDevCommand(
    workspaceId: string
  ): Promise<DevCommandView | null> {
    return this.reads.workspaceDevCommand(workspaceId);
  }

  async environmentImport(): Promise<EnvironmentImportView> {
    return this.reads.environmentImport();
  }

  async searchTranscripts(query: string): Promise<TranscriptSearchView> {
    return this.reads.searchTranscripts(query);
  }

  async workspaceTranscript(
    workspaceId: string
  ): Promise<WorkspaceTranscriptView | null> {
    return this.reads.workspaceTranscript(workspaceId);
  }

  async workspaceRunConfig(
    workspaceId: string
  ): Promise<WorkspaceRunConfigView | null> {
    return this.reads.workspaceRunConfig(workspaceId);
  }

  // --- workspace detail: governed writes ---------------------------------------

  async getPreviewVerification(
    workspaceId: string
  ): Promise<PreviewVerificationView | null> {
    return this.preview.getPreviewVerification(workspaceId);
  }

  async setPreviewUrl(
    workspaceId: string,
    url: unknown,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    return this.preview.setPreviewUrl(workspaceId, url, principal);
  }

  async verifyPreview(
    workspaceId: string,
    principal: Principal,
    options?: PreviewVerifyOptions
  ): Promise<PreviewVerifyResult> {
    return this.preview.verifyPreview(workspaceId, principal, options);
  }

  async attachPreviewEvidence(
    workspaceId: string,
    principal: Principal,
    options?: PreviewVerifyOptions
  ): Promise<ConductorWriteResult<PreviewEvidencePack>> {
    return this.preview.attachPreviewEvidence(workspaceId, principal, options);
  }

  async archiveWorkspace(
    workspaceId: string,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    return this.writes.archiveWorkspace(workspaceId, principal);
  }

  async discardWorkspaceFiles(
    workspaceId: string,
    paths: readonly string[],
    principal: Principal
  ): Promise<ConductorWriteResult<WorkspaceDiscardView>> {
    return this.writes.discardWorkspaceFiles(workspaceId, paths, principal);
  }

  async discardWorkspaceHunks(
    workspaceId: string,
    filePath: string,
    hunkIndexes: readonly number[],
    principal: Principal
  ): Promise<ConductorWriteResult<WorkspaceDiscardHunksView>> {
    return this.writes.discardWorkspaceHunks(
      workspaceId,
      filePath,
      hunkIndexes,
      principal
    );
  }

  async createWorkspacePr(
    workspaceId: string,
    input: CreatePrInput,
    principal: Principal
  ): Promise<ConductorWriteResult<CreatePrResultView>> {
    return this.writes.createWorkspacePr(workspaceId, input, principal);
  }

  async mergeWorkspace(
    workspaceId: string,
    input: MergeInput,
    principal: Principal
  ): Promise<ConductorWriteResult<MergeResultView>> {
    return this.writes.mergeWorkspace(workspaceId, input, principal);
  }

  async getConvergenceEvidence(
    workspaceId: string
  ): Promise<ConvergenceEvidenceRecord | null> {
    return this.compareConverge.getConvergenceEvidence(workspaceId);
  }

  async getConvergenceTrust(
    workspaceId: string
  ): Promise<ConvergenceTrust | null> {
    return this.compareConverge.getConvergenceTrust(workspaceId);
  }

  async getConvergenceEvidenceExport(
    workspaceId: string
  ): Promise<EvidenceExport | null> {
    return this.compareConverge.getConvergenceEvidenceExport(workspaceId);
  }

  /** Load + memoize the Ed25519 signing key from config (degrade-truthful: `null` = unsigned). */
  private resolveEvidenceSigningKey(): KeyObject | null {
    if (this.evidenceSigningKey === undefined) {
      this.evidenceSigningKey = loadEvidenceSigningKey(
        this.cfg.evidenceSigningKey,
        this.log
      );
    }
    return this.evidenceSigningKey;
  }

  async planConvergence(
    taskGroup: string,
    selection: Readonly<Record<string, string>>,
    options?: { readonly probe?: boolean },
    principal?: Principal
  ): Promise<ConvergencePlan> {
    return this.compareConverge.planConvergence(
      taskGroup,
      selection,
      options,
      principal
    );
  }

  async composeConvergence(
    input: ComposeConvergenceInput,
    principal: Principal
  ): Promise<ConductorWriteResult<ComposeConvergenceResult>> {
    return this.compareConverge.composeConvergence(input, principal);
  }

  async compareAdHoc(
    workspaceIds: readonly string[],
    principal?: Principal
  ): Promise<AdHocCompareOutcome> {
    return this.compareConverge.compareAdHoc(workspaceIds, principal);
  }

  async planConvergenceAdHoc(
    workspaceIds: readonly string[],
    selection: Readonly<Record<string, string>>,
    options?: { readonly probe?: boolean },
    principal?: Principal
  ): Promise<AdHocPlanOutcome> {
    return this.compareConverge.planConvergenceAdHoc(
      workspaceIds,
      selection,
      options,
      principal
    );
  }

  async composeConvergenceAdHoc(
    input: {
      readonly workspaceIds: readonly string[];
      readonly selection: Readonly<Record<string, string>>;
      readonly branch?: string;
      readonly createdBy: string;
    },
    principal: Principal
  ): Promise<ConductorWriteResult<ComposeConvergenceResult> | AdHocReject> {
    return this.compareConverge.composeConvergenceAdHoc(input, principal);
  }

  /**
   * THE fusion verb (`recoder_converge_fanout`, LOOM-ROADMAP.md §0): fan ONE task to
   * N agents in Loom panes, wait for all to settle, then auto-converge the sibling
   * diffs into ONE governed branch. Composes the shipped pieces via the pure
   * {@link ConvergeFanoutService}:
   *  - CREATE each governed loom workspace through this composer's already-gated
   *    `createWorkspace` (SoR + governance + evidence), stamping `substrate:'loom'`,
   *    a `recoder/fan-<kind>-<short>` branch, and `metadata.taskGroup=<shared>`; the
   *    task rides the loom pane's initial args (the adapter's documented delivery),
   *    so the separate delivery seam is a truthful no-op.
   *  - WAIT via this composer's `waitForWorkspaceSettle` (the shipped WaitService).
   *  - CONVERGE via the shipped AD-HOC plan/compose over the EXPLICIT settled set
   *    (excludes any pane that never settled — never a fabricated done).
   * Every downstream method self-gates under the caller; a blocked verdict surfaces
   * as a truthful per-agent failure, never a faked launch/merge.
   */
  /**
   * READ a bd issue so `recoder_fanout_from_issue` can START a workspace from it.
   * Delegates to the degrade-safe issue-graph reader (`codeIntel.readIssue`); an
   * unwired/absent seam ⇒ `null` (the tool then refuses truthfully). Never throws.
   */
  async readIssue(id: string): Promise<IssueRead | null> {
    return (await this.codeIntel?.readIssue?.(id)) ?? null;
  }

  async fanout(input: FanoutInput): Promise<FanoutResult> {
    const actor = input.actor;
    const service = new ConvergeFanoutService({
      logger: this.log,
      creator: {
        create: async (
          request: FanoutWorkspaceCreateRequest
        ): Promise<FanoutWorkspaceCreateOutcome> => {
          const created: CreateConductorWorkspaceInput = {
            spaceId: request.spaceId,
            projectId: request.projectId,
            taskId: request.taskId,
            repoPath: request.repoPath,
            // Loom drives the agent MACHINE via RECODER_LOOM_KIND; the runtimeId is
            // just the SoR label for the run (the loom adapter reads the env, not it).
            runtimeId: request.kind,
            substrate: request.substrate,
            branch: request.branch,
            ...(request.base ? { baseRef: request.base } : {}),
            // The task rides the loom pane's initial args (adapter: "initial
            // instruction rides args") — one delivery, no double-prompt.
            command: request.task,
            env: { RECODER_LOOM_KIND: request.kind },
            metadata: { taskGroup: request.taskGroup },
          };
          const result = await this.createWorkspace(created, actor);
          if (result.ok && result.value) {
            return { ok: true, workspaceId: result.value.workspaceId };
          }
          return {
            ok: false,
            reason: result.reason ?? 'workspace create refused',
          };
        },
      },
      delivery: {
        // The task was delivered as the loom pane's initial args at launch, so there
        // is no separate prompt to send — a truthful no-op (never a fake re-delivery).
        deliver: async () => {},
      },
      wait: {
        waitUntilSettled: request => this.waitForWorkspaceSettle(request),
      },
      converge: {
        plan: async request => {
          const outcome = await this.planConvergenceAdHoc(
            request.workspaceIds,
            {},
            { probe: request.probe },
            actor
          );
          if (outcome.ok) return outcome.plan;
          throw new Error(
            'reason' in outcome && outcome.reason
              ? outcome.reason
              : `convergence plan rejected (${outcome.code})`
          );
        },
        compose: async (request): Promise<FanoutComposeOutcome> => {
          const result = await this.composeConvergenceAdHoc(
            {
              workspaceIds: request.workspaceIds,
              selection: request.selection,
              createdBy: actor.userId,
            },
            actor
          );
          if (result.ok && 'value' in result && result.value) {
            return {
              ok: true,
              workspaceId: result.value.workspaceId,
              branch: result.value.branch,
            };
          }
          return {
            ok: false,
            reason:
              ('reason' in result && result.reason) ||
              'convergence not composed',
          };
        },
      },
    });
    return service.fanout(input);
  }

  /**
   * Resolve the composed convergence workspace for a first-round `taskGroup` — the
   * record whose `metadata.convergedFromTaskGroup` equals the group (its `branch` is
   * the `recoder/converge-<id>` a re-fan branches from). Returns the most-recently
   * updated match, or `null` when the group has no prior convergence (⇒ a re-fan
   * refuses truthfully). Read-only; ownership is enforced at the tool boundary.
   */
  async resolvePriorConvergence(taskGroup: string): Promise<Workspace | null> {
    if (!taskGroup) return null;
    const workspaces = await this.listWorkspaces();
    let best: Workspace | null = null;
    for (const ws of workspaces) {
      const meta = ws.metadata as Record<string, unknown> | undefined;
      if (meta?.convergedFromTaskGroup !== taskGroup) continue;
      if (!best || (ws.updatedAt ?? '') > (best.updatedAt ?? '')) best = ws;
    }
    return best;
  }

  /**
   * The SECOND-ROUND re-fan (`recoder_converge_refan`, LOOM-ROADMAP.md build-now #6):
   * take a prior fan-out's converged `recoder/converge-<id>` branch as the NEW base and
   * fan a NARROWED task to N fresh agents again, auto-converging into a new reviewable
   * branch linked to round 1. Composes the shipped pieces via the pure
   * {@link ReFanService}: it RESOLVES the prior convergence (branch + recorded
   * provenance) over {@link resolvePriorConvergence}, carries that provenance into each
   * pane's task text, then delegates to this composer's own {@link fanout} with
   * `base = recoder/converge-<id>`. No prior convergence ⇒ a truthful refusal (never a
   * fabricated base); the second round's convergence is whatever the shipped fan-out
   * truthfully reports.
   */
  async reFan(input: ReFanInput): Promise<ReFanResult> {
    const service = new ReFanService({
      logger: this.log,
      resolver: {
        resolve: async (
          taskGroup: string
        ): Promise<PriorConvergence | null> => {
          const ws = await this.resolvePriorConvergence(taskGroup);
          if (!ws) return null;
          const meta = ws.metadata as Record<string, unknown> | undefined;
          const rawProvenance = meta?.convergence;
          const provenance =
            rawProvenance && typeof rawProvenance === 'object'
              ? (rawProvenance as ConvergenceProvenance)
              : null;
          return {
            workspaceId: ws.workspaceId,
            branch: ws.branch,
            provenance,
          };
        },
      },
      fanout: { fanout: fanoutInput => this.fanout(fanoutInput) },
    });
    return service.reFan(input);
  }

  /**
   * Run a BUILT-IN multi-agent playbook (`recoder_playbook_run`, LOOM-ROADMAP.md Bigger
   * Bet B): sequence the shipped fusion verbs ({@link fanout} → {@link resolveSwarmUnblock}
   * → {@link reFan}) into ONE governed run over one shared taskGroup. Composes the pure
   * {@link PlaybookService} over this composer's OWN already-gated methods — it never
   * reimplements launch/wait/converge/unblock/re-fan. Each step self-gates under the
   * caller; a step whose primitive refuses/degrades (e.g. an unblock step on a deployment
   * with the swarm seams unwired ⇒ `SERVICE_UNAVAILABLE`) is surfaced truthfully, never a
   * fabricated step success or convergence.
   */
  async runPlaybook(input: PlaybookRunInput): Promise<PlaybookRunResult> {
    const service = new PlaybookService({
      logger: toLoggerPort(this.log),
      fanout: { fanout: fanoutInput => this.fanout(fanoutInput) },
      swarmUnblock: {
        resolveBlocked: unblockInput => this.resolveSwarmUnblock(unblockInput),
      },
      reFan: { reFan: reFanInput => this.reFan(reFanInput) },
    });
    return service.run(input);
  }

  async recordRunInferenceId(
    workspaceId: string,
    inferenceId: string
  ): Promise<boolean> {
    return this.writes.recordRunInferenceId(workspaceId, inferenceId);
  }

  async sendWorkspaceMessage(
    workspaceId: string,
    input: ContinueWorkspaceInput,
    principal: Principal
  ): Promise<ConductorWriteResult<ContinueWorkspaceResult>> {
    return this.writes.sendWorkspaceMessage(workspaceId, input, principal);
  }

  async listReconcileFindings(
    workspaceId?: string
  ): Promise<readonly ReconcileFindingView[]> {
    return this.reads.listReconcileFindings(workspaceId);
  }

  async workspaceAudit(
    workspaceId: string,
    limit?: number
  ): Promise<readonly AuditRecord[]> {
    return this.reads.workspaceAudit(workspaceId, limit);
  }

  terminal(): TerminalStreamPort {
    return this.terminalService;
  }

  routes(): Router {
    const router = Router();
    // Compare routes FIRST: `/workspaces/compare` must resolve before the main
    // router's `/workspaces/:id` (else "compare" is read as a workspace id).
    router.use(
      buildCompareRoutes({
        module: this,
        middleware: this.middleware,
        soloMode: this.cfg.soloMode,
      })
    );
    // Checkpoint routes: static `/checkpoints` segment after `:id`, no collision
    // with the main `/workspaces/:id/*` edges; register before the main router.
    router.use(
      buildCheckpointRoutes({
        module: this,
        middleware: this.middleware,
        soloMode: this.cfg.soloMode,
      })
    );
    // Board query routes: the literal `/workspaces/archived` + the query-aware
    // `GET /workspaces` MUST precede the main router so the filtered list shadows
    // the plain list and `/workspaces/archived` resolves before `/workspaces/:id`.
    router.use(
      buildWorkspaceQueryRoutes({
        module: this,
        middleware: this.middleware,
        soloMode: this.cfg.soloMode,
      })
    );
    // Repo-config + PR-status: `/repo-setup-script` (GET/PUT) + the workspace's
    // `/workspaces/:id/pr-status` read. The setup-script PUT is governed inside
    // the injected RepoSetupService (deny ⇒ truthful 403, never a faked 200).
    router.use(
      buildRepoConfigRoutes({
        module: this,
        middleware: this.middleware,
        repoSetup: this.repoSetup,
        prStatus: this.prStatus,
        soloMode: this.cfg.soloMode,
      })
    );
    router.use(
      buildConductorRoutes({
        module: this,
        middleware: this.middleware,
        soloMode: this.cfg.soloMode,
        // Idempotency-Key replay guard on POST /workspaces (BE-10.3): absent ⇒
        // identity (no behavior change).
        ...(this.idempotency ? { idempotency: this.idempotency } : {}),
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
      })
    );
    return router;
  }

  mcp(): readonly McpToolRegistration[] {
    // Read-only introspection tools + the governed write tools (steer/stop/advance).
    // Every write tool delegates to this composer's already-gated method, so the
    // host-boundary gate and the module's own write seam BOTH apply.
    return [
      ...buildConductorMcpTools(this),
      ...buildConductorWriteTools(this),
      ...buildConductorPreviewEvidenceTools(this),
      // The agent-invokable synchronous wait-until-settled primitive (absorb herdr #3).
      ...buildConductorWaitTools(this),
      // THE fusion verb: fan a task to N agents in Loom panes -> auto-converge (§0).
      ...buildConductorFanoutTools(this),
      ...buildConductorFanoutFromIssueTools(this),
      // SECOND-ROUND re-fan: iterate a prior convergence as the new base (§1 build-now #6).
      ...buildConductorReFanTools(this),
      // The LIVE convergence cockpit read — makes a fan-out observable (§1 build-now #1).
      ...buildConductorCockpitTools(this),
      // Swarm auto-unblock — resolve a Blocked pane, escalate by default (§1 build-now #3).
      ...buildConductorSwarmUnblockTools(this),
      // Multi-agent orchestration PLAYBOOKS — saved recipes over the shipped fusion verbs
      // (list the built-ins + run one governed choreography; Bigger Bet B).
      ...buildConductorPlaybookTools(this),
      // LIVE Needs-You queue — push-driven ranked panes needing the human (§1 build-now #4).
      ...buildConductorNeedsYouTools(this),
      // LIVE native status board — a kanban of ALL the caller's live panes (§1 build-now #5).
      ...buildConductorStatusBoardTools(this),
      ...buildConductorReviewTools(this),
      // GOVERNED REMOTE ATTACH (Bigger Bet C) — an authenticated, policy-gated remote/mobile
      // client monitors + opt-in steers the caller's OWN live agents (mint/monitor/steer).
      ...buildConductorRemoteAttachTools(this),
      // GOVERNED SKILL MODEL — typed, signed, policy-gated actions (Bigger Bet A): the
      // safe replacement for Loom's free-argv plugin RCE surface.
      ...buildConductorSkillTools(this),
    ];
  }

  async health(): Promise<ComponentHealth> {
    return buildConductorHealth({
      config: this.cfg,
      substrates: await this.registry.availability(),
      repositoryAvailable: this.repository.isDurable(),
      liveConnections: this.terminalService.liveConnections(),
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Open the ONE long-lived Needs-You subscription (build-now #4) when wired.
    this.needsYouQueue?.start();
    this.log.info(
      {
        substrates: (await this.registry.availability())
          .filter(s => s.available)
          .map(s => s.id),
        tmuxControlMode: this.cfg.tmuxControlMode,
      },
      'conductor module started'
    );
  }

  async stop(): Promise<void> {
    // Idempotent, degrade-safe: live sessions are substrate-owned and survive.
    // Tear down the Needs-You subscription + any pending re-subscribe (build-now #4).
    this.needsYouQueue?.stop();
  }
}
