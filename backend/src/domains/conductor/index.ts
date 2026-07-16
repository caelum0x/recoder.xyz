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
import type { RunEvent, Workspace } from '@recoder/agent-os';
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
import type { GovernanceGatePort, TerminalStreamPort, GithubStatusPort, GithubStatusView, GithubRepoView } from './ports/index.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import type { RunEventSinkPort } from './ports/run-event-sink.port.js';
import type { WorkspaceRepositoryPort } from './ports/workspace-repository.port.js';
import type {
  ReconcileFindingView,
  SteerInput,
  SubstrateAvailabilityView,
} from './types.js';
import type { CreateConductorWorkspaceInput, ConductorWriteResult } from './conductor-module.js';
import type { WorkspaceDiffView, WorkspaceTreeView } from './review/workspace-review.ops.js';
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
   * Optional GitHub identity seam (`GET /github/status`): forwarded token env +
   * `gh` login + git identity, detected for zero-config onboarding. Absent ⇒ the
   * edge reports a truthful `connected: false` (never a fabricated link).
   */
  readonly githubStatus?: GithubStatusPort;
}

/** The public surface bootstrap registers and the edge/interop consume. */
export interface ConductorModule {
  readonly name: 'conductor';
  /** List every workspace record (state of record). */
  listWorkspaces(): Promise<Workspace[]>;
  /** Fetch one workspace by id, or null. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** Create + launch a workspace — GATED (`workspace.create`) then engine-driven. */
  createWorkspace(
    input: CreateConductorWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>>;
  /** Steer a live agent (send-keys) — GATED (`workspace.steer`). */
  steerWorkspace(input: SteerInput, principal: Principal): Promise<ConductorWriteResult<void>>;
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
  /** Detected dev-server command for the worktree's project (or null). */
  workspaceDevCommand(workspaceId: string): Promise<DevCommandView | null>;
  /** Persist a sniffed loopback preview URL — GATED (`workspace.preview_url`). */
  setPreviewUrl(
    workspaceId: string,
    url: unknown,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>>;
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
  /** Chat: start another run in the same worktree — GATED (`workspace.message`). */
  sendWorkspaceMessage(
    workspaceId: string,
    input: ContinueWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<ContinueWorkspaceResult>>;
  /** Reconcile persisted workspaces against the live substrate (never kills live work). */
  reconcile(principal: Principal): Promise<ConductorWriteResult<ReconcileReport>>;
  /**
   * Inject the OPTIONAL billing entitlement gate consulted as a pre-dispatch quota
   * check before launching a run (`workspace.create`). Set post-construction by
   * bootstrap (`conductor.setEntitlementGate(billing.gate())`). Absent ⇒ the
   * conductor degrades OPEN (no quota gate); present ⇒ over-quota launches are
   * refused truthfully (never a fabricated success).
   */
  setEntitlementGate(gate: EntitlementGate): void;
  /** Truthful per-substrate availability (`GET /substrates`). */
  substrates(): readonly SubstrateAvailabilityView[];
  /** GitHub connection + detected identity (`GET /github/status`) — token-free. */
  githubStatus(): Promise<GithubStatusView>;
  /**
   * The detected account's local-clonable repos (`GET /github/repos`) via the
   * authenticated `gh` CLI. Degrade-safe: no seam / no gh / signed-out ⇒ a
   * truthful EMPTY list, never an error.
   */
  githubRepos(): Promise<readonly GithubRepoView[]>;
  /** Reconcile findings for operator/policy review. */
  listReconcileFindings(workspaceId?: string): Promise<readonly ReconcileFindingView[]>;
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
