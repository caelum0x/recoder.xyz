/**
 * The shared collaborator seam behind the `ConductorComposer` facade: the
 * {@link ConductorContext} every extracted method group runs over (narrow,
 * facade-bound dep slices — never the module itself), plus the public
 * result/read-model types and the helpers used by MORE than one group.
 */
import type {
  WorkspaceEngine,
  WorkspaceEngineDeps,
  CreateWorkspaceInput,
} from '@recoder/substrate';
import type {
  Workspace,
  WorkspaceState,
  WorkspaceSubstrate,
} from '@recoder/agent-os';
import type { KeyObject } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { ConductorConfig } from '../config.js';
import type {
  GateVerdict,
  GithubStatusPort,
  SteerTransportPort,
  AuditReaderPort,
} from '../ports/index.js';
import type { EntitlementGate } from '../ports/entitlement-gate.port.js';
import type { PrReviewPort } from '../ports/pr-review.port.js';
import type { WorkspaceRepositoryPort } from '../ports/workspace-repository.port.js';
import type { WorkspaceView } from '../types.js';
import type { ConductorModuleDeps } from '../index.js';
import type { CodeIntelPort } from '../ports/code-intel.port.js';
import type {
  PreviewVerifyPort,
  PreviewVerificationView,
} from '../ports/preview-verify.port.js';
import type { CoordinationAdmissionPort } from '../ports/coordination-admission.port.js';
import type { ConductorPlanPort } from '../ports/plan.port.js';
import type { ConductorBrainMemory } from '../adapters/brain-memory.adapter.js';
import type { ConductorRegistry } from '../adapters/substrate-registry.adapter.js';
import type { ConductorRunTailer } from '../adapters/run-tailer.adapter.js';
import type { TerminalStreamService } from '../terminal/terminal-stream.js';
import type { McpInjectPort } from '../ports/mcp-inject.port.js';
import type { ReviewOpsDeps } from '../review/workspace-review.ops.js';
import type { CheckpointStorePort } from '../ports/checkpoint-store.port.js';
import type { RepoSetupService } from '../services/repo-setup.service.js';
import type { PrStatusService } from '../services/pr-status.service.js';
import type { RepoCloneService } from '../services/repo-clone.service.js';
import type { PrChecksService } from '../services/pr-checks.service.js';
import type { MergeabilityService } from '../services/mergeability.service.js';
import type { WorktreeStatusService } from '../services/worktree-status.service.js';
import type { EnvironmentImportService } from '../services/environment-import.js';
import type { SessionTranscriptService } from '../services/session-transcript.service.js';
import type { ReadinessView } from '../services/readiness.service.js';
import type { CompareView } from '../services/compare.service.js';
import type { WorkspaceGridPort } from '../ports/workspace-grid.port.js';

/** The create request the routes/callers build (createdBy is stamped from the principal). */
export type CreateConductorWorkspaceInput = Omit<
  CreateWorkspaceInput,
  'createdBy'
> & {
  /**
   * Mid-run sibling awareness opt-out (recoder-i499). Defaults TRUE for a
   * taskGroup launch (informing still-running siblings when one finishes is the
   * point of launching 2+ parallel agents) and unset otherwise; an explicit
   * `false` opts the workspace out. Persisted as `metadata.siblingAwareness` so
   * the completion-time hook can check it.
   */
  readonly siblingAwareness?: boolean;
};

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
  /**
   * OPTIONAL failure discriminator for a `ok:false` result whose cause is a CLIENT
   * input error (a 4xx), NOT a governance deny or a service fault — e.g. a
   * convergence that cannot be resolved as requested (`unresolved`) or has nothing
   * to converge (`empty`). Absent ⇒ the caller maps deny→403 / allow-fail→503 as usual.
   */
  readonly code?: 'unresolved' | 'empty';
}

/** The `GET …/run-config` read-model: how to run a workspace + its dev port. */
export interface WorkspaceRunConfigView {
  /** Stable per-workspace dev-server port (`RECODER_PORT`). */
  readonly port: number;
  /** EFFECTIVE setup script (governed store override, else committed file); '' = none. */
  readonly setup: string;
  /** Where `setup` came from — the same resolver the create hook executes. */
  readonly setupSource: 'store' | 'file' | 'none';
  /** Effective run command: committed run script, else the detected dev command, else ''. */
  readonly run: string;
  /** Where `run` came from, so the UI can be truthful about the source. */
  readonly runSource: 'config' | 'detected' | 'none';
  /** The auto-detected dev command (null when unrecognized), for display/override. */
  readonly detectedCommand: string | null;
}

/**
 * How a batch of review comments reached the agent — so the reviewer's client can
 * be truthful about whether the note steered a LIVE turn or kicked a NEW follow-up
 * run. Returned as the value of `ConductorModule.sendReviewComments`.
 */
export interface ReviewCommentDelivery {
  /** `'steer'` = folded into a live running agent's turn; `'run'` = a new gated worktree run. */
  readonly delivery: 'steer' | 'run';
  /** The follow-up run id (only when `delivery === 'run'`). */
  readonly runId?: string;
  /** The workspace state after the follow-up run started (only when `delivery === 'run'`). */
  readonly state?: WorkspaceState;
}

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

/**
 * The narrow, facade-bound dependency slice every collaborator (method group)
 * runs over. Fields are the SAME constructed instances the composer owns;
 * `entitlementGate`/`prReview` are late-bound (bootstrap setters) and exposed as
 * getters so collaborators always read the current binding. The function members
 * are the ONLY cross-group seams — each is bound to the collaborator that owns
 * the method, never to the module itself.
 */
export interface ConductorContext {
  readonly log: Logger;
  readonly cfg: ConductorConfig;
  readonly gate: ConductorModuleDeps['gate'];
  readonly registry: ConductorRegistry;
  readonly repository: WorkspaceRepositoryPort;
  readonly tailer: ConductorRunTailer;
  readonly terminalService: TerminalStreamService;
  readonly engine: WorkspaceEngine;
  readonly engineDeps: WorkspaceEngineDeps;
  readonly checkpointStore: CheckpointStorePort;
  readonly repoSetup: RepoSetupService;
  readonly prStatus: PrStatusService;
  readonly prChecks: PrChecksService;
  readonly repoClone: RepoCloneService;
  readonly mergeability: MergeabilityService;
  readonly worktreeStatus: WorktreeStatusService;
  readonly environmentImportService: EnvironmentImportService;
  readonly sessionTranscriptService: SessionTranscriptService;
  readonly brain?: ConductorBrainMemory;
  readonly codeIntel?: CodeIntelPort;
  readonly previewVerify?: PreviewVerifyPort;
  readonly plan?: ConductorPlanPort;
  readonly coordinationAdmission: CoordinationAdmissionPort | null;
  readonly colbertIndex?: ConductorModuleDeps['colbertIndex'];
  readonly github?: GithubStatusPort;
  readonly steerTransport?: SteerTransportPort;
  readonly onDeliveryFeedback?: ConductorModuleDeps['onDeliveryFeedback'];
  readonly mcpInject?: McpInjectPort;
  readonly workspaceGrid?: WorkspaceGridPort;
  readonly tmuxIntrospect?: ConductorModuleDeps['tmuxIntrospect'];
  readonly auditReader?: AuditReaderPort;
  /** Late-bound pre-dispatch quota gate (bootstrap `setEntitlementGate`). */
  readonly entitlementGate: EntitlementGate | undefined;
  /** Late-bound advisory PR auto-review port (bootstrap `setPrReview`). */
  readonly prReview: PrReviewPort | undefined;

  /** Cross-group read: the state-of-record workspace (reads group). */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** Cross-group read: the attention-enriched view builder (reads group). */
  buildWorkspaceView(workspace: Workspace): Promise<WorkspaceView>;
  /** Cross-group read: the sibling compare aggregate (compare group). */
  workspaceSiblings(
    workspaceId: string,
    principal?: Principal
  ): Promise<CompareView | null>;
  /** Cross-group read: the folded merge-readiness view (reads group). */
  workspaceReadiness(workspaceId: string): Promise<ReadinessView>;
  /** Cross-group read: the persisted preview-verification summary (preview group). */
  getPreviewVerification(
    workspaceId: string
  ): Promise<PreviewVerificationView | null>;
  /** Memoized Ed25519 evidence-signing key (facade-owned; `null` = unsigned). */
  resolveEvidenceSigningKey(): KeyObject | null;
}

/** The narrow deps slice the ported review/publish/continue ops run over. */
export function buildReviewDeps(ctx: ConductorContext): ReviewOpsDeps {
  return {
    getWorkspace: id => ctx.engine.getWorkspace(id),
    advanceWorkspace: (id, to, patch, metadata) =>
      ctx.engine.advanceWorkspace(id, to, patch, metadata),
    getSubstrate: (id: WorkspaceSubstrate) => ctx.registry.getFull(id),
    logger: ctx.log,
    ...(ctx.engineDeps.lock ? { lock: ctx.engineDeps.lock } : {}),
  };
}

/**
 * Inject the Recoder toolbelt `.mcp.json` into the launched workspace's worktree
 * (fire-and-forget). Truthful degrade: no injector wired, or no worktree path on
 * the record (e.g. a remote/in-process substrate without a local dir), is a
 * logged skip — never a fabricated write, never a launch failure.
 */
export function injectWorktreeMcp(
  ctx: ConductorContext,
  workspace: Workspace
): void {
  if (!ctx.mcpInject) return;
  if (!workspace.worktreePath) {
    ctx.log.debug(
      { workspaceId: workspace.workspaceId, substrate: workspace.substrate },
      'conductor .mcp.json injection skipped (no worktree path)'
    );
    return;
  }
  void ctx.mcpInject
    .inject(workspace.worktreePath)
    .catch(err =>
      ctx.log.warn(
        { err, workspaceId: workspace.workspaceId },
        'conductor .mcp.json injection faulted'
      )
    );
}
