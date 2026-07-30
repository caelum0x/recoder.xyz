/**
 * Conductor domain — public factory + the ONE public interface.
 *
 * `createConductorModule(deps)` composes THE terminal product: isolated
 * git-worktree + tmux execution behind the `@recoder/substrate` `WorkspaceEngine`,
 * the restart-survivable reconciler, the run-tailer → RunEvent stream, the
 * `/terminal` + `/sync` WebSocket surface, and the `/api/conductor` HTTP edges —
 * every write routed through the injected governance gate (`decide → audit`).
 *
 * Composed behind ports (dependency inversion): the substrate registry, the
 * workspace repository (over the Phase-1 persistence executor), the governance
 * write seam, and the run-event sink are all injected. Degrade-safe throughout:
 * with no substrate wired a launch fails truthfully (never faked); without a DB
 * the repository degrades to a bounded in-process store; without the gate the
 * module refuses to construct (writes must be governed).
 */
import type { Router } from 'express';
import type { RunEvent, Workspace, WorkspaceState } from '@recoder/agent-os';
import type { ReconcileReport } from '@recoder/substrate';
import type { ConductorSubstrate, WorkLockPort, AdmissionPort } from '@recoder/substrate';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../identity/types.js';
import type { ConductorConfigOverrides } from './config.js';
import type { GovernanceGatePort, TerminalStreamPort, GithubStatusPort, GithubStatusView, GithubRepoView, SteerTransportPort, AuditReaderPort, AuditRecord } from './ports/index.js';
import type { McpInjectPort } from './ports/mcp-inject.port.js';
import type { CoordinationAdmissionPort } from './ports/coordination-admission.port.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type { UsageMeterPort } from './ports/usage-meter.port.js';
import type { RunSignalPushPort } from './ports/run-signal-push.port.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import type {
  PreviewVerifyPort,
  PreviewVerificationView,
} from './ports/preview-verify.port.js';
import type {
  PreviewVerifyOptions,
  PreviewVerifyResult,
} from './services/preview-verify.service.js';

export type { PreviewVerificationView } from './ports/preview-verify.port.js';
import type { ConductorPlanPort } from './ports/plan.port.js';
import type { ColbertSearchPort } from '../memory/ports/colbert-search.port.js';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import type { SubstrateScanDeps } from './adapters/substrate-scan.adapter.js';
import type { RunEventSinkPort } from './ports/run-event-sink.port.js';
import type { WorkspaceRepositoryPort } from './ports/workspace-repository.port.js';
import type {
  ReconcileFindingView,
  SteerInput,
  SubstrateAvailabilityView,
  WorkspaceView,
} from './types.js';
import type { CreateConductorWorkspaceInput, ConductorWriteResult, WorkspaceRunConfigView } from './conductor-module.js';
import type { ReviewComment } from './review/review-comments.js';
import type { EnvironmentImportView } from './services/environment-import.js';
import type {
  WorkspaceDiffView,
  WorkspaceDiffFilesView,
  WorkspaceFilePatchView,
  WorkspaceTreeView,
} from './review/workspace-review.ops.js';
export type {
  WorkspaceDiffFilesView,
  WorkspaceFilePatchView,
} from './review/workspace-review.ops.js';
import type { MergeabilityView } from './services/mergeability.service.js';
import type { ReadinessView } from './services/readiness.service.js';
export type { ReadinessView, ReadinessSignal } from './services/readiness.service.js';
import type { ConvergenceEvidenceRecord } from './evidence/convergence-evidence.js';
export type {
  ConvergenceEvidence,
  ConvergenceEvidenceRecord,
  EvidenceCandidate,
  EvidenceConvergence,
  EvidenceFileSelection,
  EvidenceGovernance,
  EvidenceVerification,
} from './evidence/convergence-evidence.js';
import type { EvidenceExport } from './evidence/evidence-export.js';
export type {
  EvidenceExport,
  EvidenceControl,
  ControlStatus,
  ControlCoverage,
  EvidenceSignature,
} from './evidence/evidence-export.js';
export {
  verifyEvidenceSignature,
  type EvidenceSignatureVerification,
} from './evidence/evidence-signing.js';
import type { ConvergencePlan } from './converge/converge-plan.service.js';
export { SYNTHESIZE_SELECTION } from './converge/converge-plan.service.js';
export type {
  ConvergencePlan,
  ConvergenceFileWinner,
  ConvergenceMode,
  ConvergenceUnresolved,
  ConvergencePlanSource,
  ContestedProbe,
} from './converge/converge-plan.service.js';
import type {
  ComposeConvergenceInput,
  ComposeConvergenceResult,
} from './converge/converge.ops.js';
export type { ComposeConvergenceInput, ComposeConvergenceResult } from './converge/converge.ops.js';
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
import type { DevCommandView } from './adapters/dev-command.adapter.js';
import type { ConductorRuntimeView } from './adapters/runtime-listing.adapter.js';
import type { WorkspaceQueryFilters } from './services/workspace-query.service.js';
import type { CompareView } from './services/compare.service.js';
import type { WorkspaceGridPort, GroupGridArrangement } from './ports/workspace-grid.port.js';
// Type-only across the boundary (the guard allows types): the read-only
// `/sessions` attach bridge observes through an INJECTED engines-owned tmux
// introspect port; the concrete value is built at the composition root.
import type { TmuxIntrospectPort } from '../engines/adapters/cli/tmux-introspect.adapter.js';
import type { CheckpointRecord, CheckpointStorePort } from './ports/checkpoint-store.port.js';
import type { BranchResultView, RestoreResultView } from './services/checkpoint.service.js';
import type { RepoSetupStorePort } from './ports/repo-setup-store.port.js';
import type { RepoSetupExec } from './services/repo-setup.service.js';
import type { CloneRepoInput, CloneRepoOutcome } from './services/repo-clone.service.js';
import type { WorkspaceChecksView } from './services/pr-checks.service.js';
export type { CloneRepoInput, CloneRepoOutcome } from './services/repo-clone.service.js';
export type { WorkspaceChecksView, WorkspaceCheckRow } from './services/pr-checks.service.js';

/** Dependencies injected by bootstrap (after persistence + identity + governance). */
export interface ConductorModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the conductor-owned tables bind to (degrade-safe). */
  readonly executor: QueryExecutor;
  /** The composed auth middleware the `/api/conductor` edges guard with. */
  readonly middleware: AuthMiddleware;
  /** THE write seam — every conductor mutation passes `decide` before it happens. */
  readonly gate: GovernanceGatePort;
  /** Not-yet-in-AppConfig conductor values (tmux bin, control-mode, caps, creds). */
  readonly overrides?: ConductorConfigOverrides;
  /** Concrete substrates to register (tmux/daytona/in-process/ssh) — empty ⇒ fail truthfully. */
  readonly substrates?: readonly ConductorSubstrate[];
  /**
   * The DURABLE run-event sink the run-tailer emits into — the agent-os RunEvent
   * bus, adapted to the narrow `append(event)` shape at the composition root. When
   * provided, every tailed `RunEvent` is ALSO ingested into the state-of-record
   * (agent-os); when omitted, only the conductor-local durable+live sink is used.
   */
  readonly runEventSink?: RunEventSinkPort;
  /** Optional durable workspace repository (agent-os-backed) overriding the default. */
  readonly repository?: WorkspaceRepositoryPort;
  /** Optional collision-prevention write-lock (conductor-locks over coordination). */
  readonly lock?: WorkLockPort;
  /** Optional resource-governor admission (refuse over-budget launches). */
  readonly admission?: AdmissionPort;
  /**
   * Optional DOUBLE-ASSIGNMENT admission gate over the Multica coordination
   * fabric (agent-os `coordinationAdmission()`). Consulted in `createWorkspace`
   * alongside the path-level {@link WorkLockPort}: when the issue a launch is
   * about to work is ALREADY actively held by 2+ agents, the launch is
   * skipped/deferred with a truthful reason, and a governance-gated reroute asks
   * the squad leader to re-balance. Absent, or the coordination engine down ⇒ a
   * truthful skip (`gated:false`) that NEVER blocks a launch. See
   * `services/coordination-admission.service.ts`.
   */
  readonly coordinationAdmission?: CoordinationAdmissionPort;
  /**
   * Optional memory-backed brain (mem0 ∪ beads ∪ candidates → ColBERT rerank).
   * Used TWO ways by the run flow: injected as `engineDeps.brain` so the CLI
   * launch path enriches the prompt (`enrichPrompt`), AND consulted by the
   * completion sink to harvest an evidence-backed memory candidate on terminal
   * events (`harvestOnCompletion`). Absent ⇒ launches use the raw prompt and no
   * harvest runs (truthful skip). See `adapters/brain-memory.adapter.ts`.
   */
  readonly brain?: ConductorBrainMemory;
  /**
   * Optional code-intel seam: recodergit repo index + beads issue-graph tracking.
   * On create the run flow indexes the repo (`indexRepo`) and claims the bd issue
   * (`trackWork`); on terminal events it closes/notes the issue (`completeWork`).
   * Absent/disabled engines ⇒ every call is a truthful logged skip (never blocks a
   * launch, never fabricated). See `adapters/code-intel.adapter.ts`.
   */
  readonly codeIntel?: CodeIntelPort;
  /**
   * OPTIONAL preview verifier (the browsing facet): a concrete
   * {@link PreviewVerifyPort} over the engines-domain browser-use
   * `EngineClientPort`, constructed at bootstrap
   * (`createBrowserPreviewVerifier(engines.client('browser-use'))`). When wired,
   * `setPreviewUrl` fires a fire-and-forget, deadline-bounded verification of the
   * just-persisted URL, and `verifyPreview` serves the explicit/route path — both
   * sealing evidence to the audit chain. Absent ⇒ both are truthful no-ops (never
   * a faked pass, never a block on a run/merge). See
   * `adapters/browser-preview-verify.adapter.ts`.
   */
  readonly previewVerify?: PreviewVerifyPort;
  /**
   * Optional pal launch-planning seam (`engines.pal().planLaunch()`, adapted at
   * the composition root). On a workspace create the launch path consults it —
   * AFTER the governance write-gate allow, BEFORE substrate/skill selection — for
   * pal's advisory runtime/skill/tool-grant/sandbox tier + governed risk. The
   * CALLER's explicit choices ALWAYS win (pal only fills gaps the operator left
   * blank); `risk`/`approvalRequired` are recorded as advisory launch-audit
   * metadata (pal advises, the governance kernel still decides). Absent ⇒ the
   * launch is byte-identical to today; a throwing port never fails a launch. See
   * `adapters/plan.adapter.ts`.
   */
  readonly plan?: ConductorPlanPort;
  /**
   * Optional ColBERT PLAID index seam (`memory.colbertSearch()`). On a workspace
   * create the run flow chunks the repo's text files and builds/refreshes the
   * per-repo late-interaction collection, so retrieval can surface passages the
   * single-vector Qdrant top-K misses. Absent, or the daemon unconfigured, ⇒ a
   * truthful skip (`configured():false`) — never blocks a launch, never fabricated.
   */
  readonly colbertIndex?: ColbertSearchPort;
  /**
   * Optional GitHub identity seam (`GET /github/status`): forwarded token env +
   * `gh` login + git identity, detected for zero-config onboarding. Absent ⇒ the
   * edge reports a truthful `connected: false` (never a fabricated link).
   */
  readonly githubStatus?: GithubStatusPort;
  /**
   * Optional live send-keys transport (`steerWorkspace`): delivers the user's
   * steer text into the workspace's interactive session (tmux-backed at the
   * composition root, addressed by the workspace's `sessionName`). Absent ⇒
   * steering is refused truthfully (never faked); a delivery fault surfaces as
   * `ok:false` with the transport's reason.
   */
  readonly steerTransport?: SteerTransportPort;
  /**
   * Optional per-worktree `.mcp.json` injector: on a successful launch the composer
   * writes a secret-free `.mcp.json` into the workspace's worktree pointing the
   * launched agent at the GOVERNED backend MCP host (the Recoder capability-tools
   * bridge). Absent ⇒ injection is a truthful skip (the agent runs without the
   * Recoder toolbelt, never a fabricated write). See `adapters/mcp-inject.adapter.ts`.
   */
  readonly mcpInject?: McpInjectPort;
  /**
   * Optional durable checkpoint metadata store. Absent ⇒ the module uses a
   * bounded, degrade-truthful in-process store (`isDurable():false`) — the git
   * objects a checkpoint points at stay durable in the repo, but the metadata is
   * lost on restart and the store never pretends otherwise.
   */
  readonly checkpointStore?: CheckpointStorePort;
  /**
   * Optional durable per-repo setup-script store. Absent ⇒ the module uses a
   * bounded, degrade-truthful in-process store (survives the process, not a
   * restart) — mirroring the checkpoint store's posture. The script the store
   * holds is run inside every fresh worktree by the createWorkspace hook.
   */
  readonly repoSetupStore?: RepoSetupStorePort;
  /**
   * Optional child-process exec seam the repo-setup RUN hook shells the configured
   * script through (`bash -lc <script>` in the new worktree). Test-injectable;
   * absent ⇒ the real bounded `execFileSafe`.
   */
  readonly repoSetupExec?: RepoSetupExec;
  /**
   * Optional delivery-feedback sink (the inference routing feedback seam, adapted
   * at the composition root). A MERGED workspace is THE positive delivery outcome:
   * when the run's routed `inference_id` was persisted onto the workspace record
   * (`metadata.inferenceId`), the merge flow fires this sink so the LLM gateway
   * learns `task_success` from real deliveries (TensorZero feedback). Absent, or
   * no persisted inference_id (not tracked today) ⇒ a truthful silent skip — the
   * feedback still reaches the gateway through the `/inference/feedback` route +
   * MCP tool, never fabricated.
   */
  readonly onDeliveryFeedback?: (
    inferenceId: string,
    userId: string | undefined,
    success: boolean,
  ) => void;
  /**
   * Optional live-substrate scan source for reconcile GC. Reconcile joins persisted
   * workspaces against the REAL box — live `recoder-*` tmux sessions (fed by the
   * engines-domain tmux introspection port) + conductor worktrees — so orphaned or
   * leaked sessions are flagged and record-vs-session drift is corrected. Bootstrap
   * builds this from `engines.tmuxIntrospect()` via `createTmuxScanSource`. Absent ⇒
   * `createSubstrateScan()` degrades to "cannot see the substrate" (empty lists),
   * the truthful default — never fabricated live work. See
   * `adapters/tmux-scan-source.adapter.ts` + `adapters/substrate-scan.adapter.ts`.
   */
  readonly substrateScan?: SubstrateScanDeps;
  /**
   * Optional dmux LAYOUT-brain seam for the F3 compare/parallel group. When wired
   * (bootstrap builds `createDmuxGridAdapter` over `engines.dmuxLayout()` +
   * `engines.client('dmux')`), the compare read model carries a READ-ONLY
   * operator-attach hint (`CompareView.grid`) and `arrangeCompareGrid` builds a
   * GOVERNED worktree-bound operator grid — one pane per sibling, EACH cwd'd to
   * its OWN worktree. The `attachCommand` half of the hint is emitted ONLY in the
   * single-tenant desktop composition (the box-wide dmux console spans every
   * tenant); `visibleSessions` (intersected to the group) is tenant-safe and
   * always emitted. Absent / dmux not built ⇒ no grid + no hint, the compare read
   * still returns (never a fabricated layout, never blocks a compare). See
   * `adapters/dmux-grid.adapter.ts`.
   */
  readonly workspaceGrid?: WorkspaceGridPort;
  /**
   * Optional read-only tmux introspection port for the `/sessions` attach bridge
   * (durable-shell unify §A2). Bootstrap injects `engines.tmuxIntrospect()` — the
   * SAME pinned binary the conductor drives — so the read-only `recoder-*` session
   * lister can surface live sessions WITHOUT the conductor value-importing the
   * engines domain. Absent ⇒ the bridge degrades truthfully to an empty list
   * (never a fabricated live session). See `adapters/recoder-session-lister.adapter.ts`.
   */
  readonly tmuxIntrospect?: TmuxIntrospectPort;
  /**
   * Optional READ seam over the durable governance audit chain, scoped by
   * workspace (`GET …/audit`). Bootstrap injects an adapter over
   * `governance.audit().range({ workspaceId })` — the READ half of the
   * merge→audit seam whose WRITE half (`recordAudit`) already seals every
   * conductor mutation. Absent ⇒ the edge degrades to a truthful empty trail
   * (`[]`), never a fabricated record. See `adapters/audit-reader.adapter.ts`.
   */
  readonly auditReader?: AuditReaderPort;
}

/** The public surface bootstrap registers and the edge/interop consume. */
export interface ConductorModule {
  readonly name: 'conductor';
  /** List every workspace record (state of record). */
  listWorkspaces(): Promise<Workspace[]>;
  /** Board search/filter over the record list (read-only; empty match ⇒ truthful `[]`). */
  queryWorkspaces(filters: WorkspaceQueryFilters): Promise<Workspace[]>;
  /** Archived history — every archived workspace, most-recent-first (read-only). */
  listArchivedWorkspaces(): Promise<Workspace[]>;
  /** Fetch one workspace by id, or null. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** Create + launch a workspace — GATED (`workspace.create`) then engine-driven. */
  createWorkspace(
    input: CreateConductorWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>>;
  /** Steer a live agent (send-keys) — GATED (`workspace.steer`). */
  steerWorkspace(input: SteerInput, principal: Principal): Promise<ConductorWriteResult<void>>;
  /**
   * Send line-anchored diff-review comments to a live agent — GATED
   * (`workspace.steer`): folds the comments into one structured prompt and steers
   * it, so the reviewer's `file:line` notes become precise context the agent acts
   * on. Delegates to {@link steerWorkspace} for all governance.
   */
  sendReviewComments(
    input: { readonly workspaceId: string; readonly comments: readonly ReviewComment[] },
    principal: Principal,
  ): Promise<ConductorWriteResult<void>>;
  /**
   * Gracefully STOP a running workspace — GATED (`workspace.stop`): substrate
   * session kill (worktree preserved for review) + `cancelled` transition +
   * audit. A kill fault refuses truthfully with the state UNCHANGED.
   */
  stopWorkspace(workspaceId: string, principal: Principal): Promise<ConductorWriteResult<Workspace>>;
  /**
   * ADVANCE the workspace one lifecycle step (review → merge flow) — GATED
   * (`workspace.advance`). Pure transitions only; the agent-os state machine
   * enforces from→to legality and delivery states keep their own edges.
   */
  advanceWorkspaceState(
    workspaceId: string,
    to: WorkspaceState,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>>;
  /** Attention-enriched read model of one workspace (truthful `'unknown'` on no signal). */
  workspaceView(workspaceId: string): Promise<WorkspaceView | null>;
  /** Attention-enriched views of every workspace (the cockpit list's badges). */
  listWorkspaceViews(): Promise<WorkspaceView[]>;
  /**
   * Side-by-side compare of a parallel-run group (F3): aggregate every sibling
   * workspace sharing `taskGroup` — each row's agent, diffStat, its tracked
   * changed-file paths, outcome, runId — plus the view's CONTESTED set (files 2+
   * siblings both touched, always emitted as `[]` when none). Read-only +
   * degrade-safe: an unreadable sibling reports a reason and contributes NOTHING
   * to the overlap; a missing/blank group is a truthful empty view.
   */
  compareTaskGroup(taskGroup: string): Promise<CompareView>;
  /**
   * The compare view for the group a single workspace belongs to (its own
   * singleton set when ungrouped — `contested` is then always `[]`). Each row
   * carries its changed-file list; the view carries the contested-overlap set.
   * Null when the workspace does not exist.
   */
  workspaceSiblings(workspaceId: string): Promise<CompareView | null>;
  /**
   * Arrange the parallel-run group's operator grid — GATED (`workspace.grid`):
   * ensure the dedicated `recoder-group-<taskGroup>` session then build one pane
   * per sibling, EACH cwd'd to its OWN worktree (`agent-grid`). NEVER splits,
   * moves, or links a live agent session, so it cannot disrupt a running run.
   * Degrade-truthful: dmux absent, no wired grid, or <2 siblings with a real
   * worktree ⇒ `{ ok:true, value:null }` (no honest N-way grid to build); a tmux
   * fault ⇒ `value:null` — never a fabricated/hollow arrangement.
   */
  arrangeCompareGrid(
    taskGroup: string,
    principal: Principal,
  ): Promise<ConductorWriteResult<GroupGridArrangement | null>>;
  /** RunEvents for a workspace's run — the conversation + lifecycle log. */
  listWorkspaceEvents(workspaceId: string): Promise<RunEvent[]>;
  /** Captured pane text (the stream client's poll fallback). */
  workspaceOutput(workspaceId: string, lines?: number): Promise<{ output: string }>;
  /** Live agent status: alive + exit code + recent output + persisted state. */
  workspaceStatus(workspaceId: string): Promise<{
    alive: boolean;
    exitCode: number | null;
    recentOutput: string | null;
    state: Workspace['state'];
    reason?: string;
  }>;
  /** Reviewable diff of the worktree against its base ref (running → awaiting_review). */
  workspaceDiff(workspaceId: string): Promise<WorkspaceDiffView>;
  /** Full worktree file list (tracked + untracked), changed subset marked. */
  workspaceTree(workspaceId: string): Promise<WorkspaceTreeView>;
  /**
   * Per-file changed list (numstat + name-status) — a faithful slice of the
   * {@link workspaceDiff} blob (working tree vs base). PURE read (no transition);
   * degrade-truthful (`available:false, files:[]` for a non-repo/no-worktree tree).
   */
  workspaceDiffFiles(workspaceId: string): Promise<WorkspaceDiffFilesView>;
  /**
   * A single file's unified patch (working tree vs base) — the agent-supplied
   * `path` is passed ONLY as a pathspec after `--` and rejected pre-spawn on a
   * leading `-`. PURE read; degrade-truthful (`patch:null` when uncomputable).
   */
  workspaceFilePatch(workspaceId: string, path: string): Promise<WorkspaceFilePatchView>;
  /** Read-only pre-merge conflict + base-divergence probe (git-native, degrade-truthful; never a fabricated clean). */
  workspaceMergeability(workspaceId: string): Promise<MergeabilityView>;
  /**
   * Fold the four merge-decision signals (lifecycle, mergeability, PR checks,
   * preview verification) into ONE truthful read-model (`GET …/readiness`). PURE
   * read (no gate/audit/mutation); each probe degrades INDEPENDENTLY to an
   * `'unknown'` signal, and the verdict is never `'ready'` unless the merge gate
   * is a real `available && clean` pass. A missing workspace throws (→ 404).
   */
  workspaceReadiness(workspaceId: string): Promise<ReadinessView>;
  /** Detected dev-server command for the worktree's project (or null). */
  workspaceDevCommand(workspaceId: string): Promise<DevCommandView | null>;
  /** Effective run config: committed scripts + stable RECODER_PORT + detected command (or null). */
  workspaceRunConfig(workspaceId: string): Promise<WorkspaceRunConfigView | null>;
  /** First-run environment import: git identity, agent configs, gh auth, shell (degrade-truthful). */
  environmentImport(): Promise<EnvironmentImportView>;
  /** Persist a sniffed loopback preview URL — GATED (`workspace.preview_url`). */
  setPreviewUrl(
    workspaceId: string,
    url: unknown,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>>;
  /**
   * VERIFY the workspace's stored preview URL — GATED (`workspace.preview_verify`,
   * a SECOND gate independent of the `workspace.preview_url` write). The awaited
   * twin of the fire-and-forget auto-verify `setPreviewUrl` fires: one bounded
   * browser run navigates the preview, asserts expected text, captures an
   * evidence screenshot, and SEALS the summary + screenshot artifact ids into the
   * durable audit chain. Degrade-truthful: no verifier wired / no driver / no
   * stored preview URL ⇒ `ok:false` or a `skipped(degraded)` verification with the
   * real reason — never a fabricated pass, never a block on a run/merge.
   */
  verifyPreview(
    workspaceId: string,
    principal: Principal,
    options?: PreviewVerifyOptions,
  ): Promise<PreviewVerifyResult>;
  /**
   * PURE READ projection of a workspace's persisted preview-verification summary
   * (`metadata.previewVerification`, written back by {@link verifyPreview} and the
   * `setPreviewUrl` auto-verify) — the `GET …/preview-verification` read model, or
   * `null` when the workspace does not exist OR was never verified. Read-only (no
   * gate/audit/mutation); `screenshotRef` is always `null` (the screenshot PNG is
   * not retained — only an opaque artifact id was sealed). A never-verified
   * workspace is a truthful `null`, never a fabricated pass.
   */
  getPreviewVerification(workspaceId: string): Promise<PreviewVerificationView | null>;
  /** Archive a finished workspace (teardown + archived) — GATED (`workspace.archive`). */
  archiveWorkspace(workspaceId: string, principal: Principal): Promise<ConductorWriteResult<Workspace>>;
  /** Push the branch + open a PR — GATED (`workspace.pr`). */
  createWorkspacePr(
    workspaceId: string,
    input: CreatePrInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<CreatePrResultView>>;
  /** Merge the branch into its base (gh or local) — GATED (`workspace.merge`). */
  mergeWorkspace(
    workspaceId: string,
    input: MergeInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<MergeResultView>>;
  /**
   * SINGLE-WRITER persist of a run's TensorZero-resolvable `inference_id` onto the
   * workspace record (`metadata.inferenceId`), so a later {@link mergeWorkspace}
   * fires real `task_success` RLHF feedback on an anchor the gateway can resolve.
   * Reuses the same-state metadata-patch idiom of {@link setPreviewUrl}
   * (`advanceWorkspace` MERGES the `{ inferenceId }` patch, never replaces) and is
   * WRITE-ONCE — an already-anchored workspace is a durable no-op (the run's first
   * napi-served completion claims the anchor). Backs the inference
   * `RunInferenceSinkPort` injected at bootstrap, reached ONLY for napi-tier ids
   * (the routing service gates on `tier === 'napi'`, so a non-napi provider id is
   * never persisted). Not governance-gated: an internal correlation write, not a
   * customer-visible action. Degrade-truthful: a missing workspace ⇒ `false`.
   * Returns whether the anchor is now persisted.
   */
  recordRunInferenceId(workspaceId: string, inferenceId: string): Promise<boolean>;
  /** Chat: start another run in the same worktree — GATED (`workspace.message`). */
  sendWorkspaceMessage(
    workspaceId: string,
    input: ContinueWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<ContinueWorkspaceResult>>;
  /** Reconcile persisted workspaces against the live substrate (never kills live work). */
  reconcile(principal: Principal): Promise<ConductorWriteResult<ReconcileReport>>;
  /** Capture a git checkpoint of a workspace — GATED (`workspace.checkpoint`). */
  checkpointWorkspace(
    workspaceId: string,
    input: { label?: string; description?: string },
    principal: Principal,
  ): Promise<ConductorWriteResult<CheckpointRecord>>;
  /** List a workspace's checkpoints (newest-first). Read-only. */
  listWorkspaceCheckpoints(workspaceId: string): Promise<readonly CheckpointRecord[]>;
  /** Restore a workspace's worktree to a checkpoint — GATED (`workspace.restore`). */
  restoreCheckpoint(
    workspaceId: string,
    checkpointId: string,
    principal: Principal,
  ): Promise<ConductorWriteResult<RestoreResultView>>;
  /** Branch a NEW workspace from a checkpoint — GATED (`workspace.branch`). */
  branchFromCheckpoint(
    workspaceId: string,
    checkpointId: string,
    input: { branch?: string; runtimeId?: string; taskId?: string; prompt?: string },
    principal: Principal,
  ): Promise<ConductorWriteResult<BranchResultView>>;
  /**
   * Inject the OPTIONAL billing entitlement gate consulted as a pre-dispatch quota
   * check before launching a run (`workspace.create`). Set post-construction by
   * bootstrap (`conductor.setEntitlementGate(billing.gate())`). Absent ⇒ the
   * conductor degrades OPEN (no quota gate); present ⇒ over-quota launches are
   * refused truthfully (never a fabricated success).
   */
  setEntitlementGate(gate: EntitlementGate): void;
  /**
   * Inject the OPTIONAL billing usage meter. Set post-construction by bootstrap
   * (`conductor.setUsageMeter(billing.metering())`), next to the entitlement gate.
   * When wired, a completed/failed run meters one `agent_run` for the owning
   * subject (idempotent by the workspace/run anchor) so the pre-dispatch quota
   * actually decrements. Absent ⇒ a truthful no-op (no per-run metering). A
   * metering hiccup never blocks or delays the terminal RunEvent.
   */
  setUsageMeter(meter: UsageMeterPort): void;
  /**
   * Inject the OPTIONAL ops-recorder reverse-push port. Set post-construction by
   * bootstrap (`conductor.setRunSignalPush({...})`) after observability exists,
   * satisfied STRUCTURALLY so neither domain imports the other. When wired, a
   * terminal run reverse-pushes a failed/stuck outcome onto the ops-recorder
   * stuck-work board (a `completed` run is a truthful far-side skip). Absent ⇒ a
   * truthful no-op (no push); a push fault NEVER blocks or delays the completion.
   */
  setRunSignalPush(port: RunSignalPushPort): void;
  /** Truthful per-substrate availability (`GET /substrates`). */
  substrates(): readonly SubstrateAvailabilityView[];
  /**
   * Every selectable runtime (`GET /runtimes`): PATH-probed CLIs + the native
   * in-process openfang runtime with its live engine availability (truthful
   * `available:false` + reason when the addon/env is absent — never faked).
   */
  runtimes(): Promise<readonly ConductorRuntimeView[]>;
  /** GitHub connection + detected identity (`GET /github/status`) — token-free. */
  githubStatus(): Promise<GithubStatusView>;
  /**
   * The detected account's local-clonable repos (`GET /github/repos`) via the
   * authenticated `gh` CLI. Degrade-safe: no seam / no gh / signed-out ⇒ a
   * truthful EMPTY list, never an error.
   */
  githubRepos(): Promise<readonly GithubRepoView[]>;
  /**
   * Clone a GitHub repo onto the box (`POST /repos/clone`) — `gh repo clone`
   * first (inherits gh auth for private repos), plain `git clone` fallback.
   * Never throws: bad url / existing non-empty dir / no tool / a failed clone
   * are all typed, truthful outcomes (never a fabricated clone).
   */
  cloneRepo(input: CloneRepoInput): Promise<CloneRepoOutcome>;
  /**
   * The workspace's per-check PR rollup (`GET …/checks`) via `gh pr view` in
   * the worktree (gh resolves the branch's PR itself). Degrade-truthful:
   * gh missing / unauthenticated / no PR / non-GitHub remote ⇒ a 200 with
   * `available:false` + a truthful reason — NEVER fabricated. Null when the
   * workspace does not exist (→ 404 at the edge).
   */
  workspaceChecks(workspaceId: string): Promise<WorkspaceChecksView | null>;
  /** Reconcile findings for operator/policy review. */
  listReconcileFindings(workspaceId?: string): Promise<readonly ReconcileFindingView[]>;
  /**
   * The durable governance-audit trail for one workspace (`GET …/audit`) — the
   * sealed control-plane events whose payload carries this `workspaceId`,
   * ascending by chain `seq`. Read-only. The READ half of the merge→audit seam:
   * `mergeWorkspace` returns the sealed audit id, this returns the queryable
   * trail. No reader wired ⇒ a truthful empty trail, never a fabricated record.
   */
  workspaceAudit(workspaceId: string, limit?: number): Promise<readonly AuditRecord[]>;
  /**
   * The exportable convergence evidence record a governed merge produced
   * (`GET …/evidence`) — the step-3 headline artifact: task + the N candidate runs
   * and their diff hashes + which was chosen + the governance verdict/approval +
   * the pre-merge verification + provenance, sealed with a SHA-256 `contentHash`
   * and pointing at its durable Merkle audit leaf. Read-only. A never-merged (or
   * evidence-less) workspace is a truthful `null` (⇒ 404), never a fabricated record.
   */
  getConvergenceEvidence(workspaceId: string): Promise<ConvergenceEvidenceRecord | null>;
  /**
   * The framework-mapped, exportable evidence PACK (`GET …/evidence/export`) —
   * renders the stored convergence evidence record into a control-mapped artifact
   * (SOC 2 / EU AI Act / DORA / Recoder) + a human-readable markdown summary,
   * content-hashed. Read-only, pure over the record; every control status is derived
   * from the backing fields (never a fabricated `met`). `null` ⇒ 404 (no evidence).
   */
  getConvergenceEvidenceExport(workspaceId: string): Promise<EvidenceExport | null>;
  /**
   * PLAN a convergence (`GET …/converge-plan`) — the PURE fold of a parallel-run
   * group's N sibling diffs + a per-contested-file selection into a resolved
   * file→source map (step 2). Read-only. Non-contested paths auto-resolve to their
   * sole author; contested paths resolve to a valid selection or surface as
   * `unresolved` (never an invented winner). `complete` ⇒ compose-ready.
   *
   * `options.probe` opts into a read-only synthesizability dry-run over the contested
   * paths, enriching the plan with `contested[]` (no worktree/mutation); unprobed the
   * pure fold is returned verbatim (no `contested` field).
   */
  planConvergence(
    taskGroup: string,
    selection: Readonly<Record<string, string>>,
    options?: { readonly probe?: boolean },
  ): Promise<ConvergencePlan>;
  /**
   * COMPOSE a convergence (`POST …/converge`) — GATED (`workspace.branch`).
   * Materializes a COMPLETE plan into a NEW convergence worktree/branch (whole-file
   * pick, no agent launched) and registers it as a reviewable workspace that then
   * flows through the existing governed merge + evidence record. Degrade-truthful.
   */
  composeConvergence(
    input: ComposeConvergenceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<ComposeConvergenceResult>>;
  /** The terminal WS surface (edge registers `terminalBackends()`). */
  terminal(): TerminalStreamPort;
  /** The `/api/conductor` router. */
  routes(): Router;
  /** Read-only MCP introspection tools (workspaces / substrates / findings). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health. */
  health(): Promise<ComponentHealth>;
  /** Boot hook (idempotent). */
  start(): Promise<void>;
  /** Shutdown hook (idempotent, degrade-safe). */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { ConductorComposer } from './conductor-module.js';

/** Build the conductor module. Never throws for a missing substrate/DB — degrades. */
export function createConductorModule(deps: ConductorModuleDeps): ConductorModule {
  return new ConductorComposer(deps);
}
