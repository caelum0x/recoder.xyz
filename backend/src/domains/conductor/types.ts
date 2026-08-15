/**
 * Conductor domain types — the data shapes not owned by `packages/*`.
 *
 * Canonical execution + state-of-record shapes (`Workspace`, `WorkspaceState`,
 * `WorkspaceSubstrate`, `RunEvent`, `TaskSpec`) come from `@recoder/agent-os`;
 * the substrate contract (`ConductorSubstrate`, `SubstrateHandle`, …) comes from
 * `@recoder/substrate`. This file declares ONLY the domain-local view/DTO shapes
 * the composer, terminal surface, and routes speak — deliberately independent of
 * package internals so a consumer imports these + the ports WITHOUT depending on
 * the engine package.
 */
import type { WorkspaceState, WorkspaceSubstrate } from '@recoder/agent-os';
import type { WorkspacePaneView } from './services/workspace-panes.js';

/**
 * The substrate a workspace runs on. Re-exported from the canonical agent-os
 * union so the domain names one thing (`SubstrateKind`) everywhere while staying
 * byte-compatible with `Workspace.substrate`.
 */
export type SubstrateKind = WorkspaceSubstrate;

/** The runtime CLIs the conductor can drive (agent-os AgentSurface ids). */
export type ConductorRuntimeKind =
  | 'claude_code'
  | 'codex'
  | 'opencode'
  | 'recoder_code'
  | 'pi'
  | 'openfang';

/**
 * Live attention classification, derived truthfully from the durable workspace
 * state, the run's lifecycle RunEvents, and the terminal tail (dmux-derived
 * heuristics — see `attention/attention-classifier.ts`).
 *
 *  - `awaiting_approval`  the run is blocked on a human approval/permission
 *  - `agent_idle_prompt`  the agent settled at an input prompt, waiting on you
 *  - `error`              the run/workspace failed truthfully
 *  - `review_ready`       the work is done and reviewable (review → merge flow)
 *  - `working`            active progress indicators observed
 *  - `unknown`            NO truthful signal (never guessed, never faked)
 */
export type AttentionState =
  | 'awaiting_approval'
  | 'agent_idle_prompt'
  | 'error'
  | 'review_ready'
  | 'working'
  | 'unknown';

/**
 * The read-model of a workspace the API/terminal surfaces return. A projection
 * of the canonical `Workspace` record enriched with live-execution status that
 * is NOT part of the durable record (attention, tail summary, availability).
 */
export interface WorkspaceView {
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly runId?: string;
  readonly runtimeId: string;
  readonly substrate: SubstrateKind;
  readonly branch: string;
  readonly baseRef: string;
  readonly worktreePath?: string;
  readonly sessionName?: string;
  readonly state: WorkspaceState;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Live attention classification (`'unknown'` when there is no truthful signal). */
  readonly attention?: AttentionState;
  /** Why the attention state was chosen (the truthful signal, or the lack of one). */
  readonly attentionReason?: string;
  /** Whether the hosting substrate currently reports a live handle (absent = not probed). */
  readonly live?: boolean;
  /**
   * Live panes of the workspace's tmux session (single-workspace read ONLY —
   * never populated by the list view). Degrade-truthful: ABSENT = not probed /
   * substrate not observable (NEVER an empty fabricated list); `[]` = the
   * session was observed and genuinely has no panes.
   */
  readonly panes?: readonly WorkspacePaneView[];
}

/**
 * Input to steer a live agent: raw keys/text sent into the substrate session. The
 * conductor routes interactive substrates through their own transport; non-live,
 * unsupported, or terminal-state workspaces reject it truthfully.
 */
export interface SteerInput {
  readonly workspaceId: string;
  /** Text/keys to send into the session (send-keys); newline submits per the agent CLI. */
  readonly keys: string;
  /** Whether to append a trailing Enter (submit). Defaults true at the call site. */
  readonly submit?: boolean;
}

/**
 * The in-memory state of a per-workspace run loop. Tracks progress through
 * enrich -> admit -> lock -> persist -> launch -> tail -> exit so the composer
 * can report truthful loop status and stop it cleanly.
 */
export type RunLoopPhase =
  | 'enriching'
  | 'admitting'
  | 'locking'
  | 'persisting'
  | 'launching'
  | 'tailing'
  | 'reviewing'
  | 'completed'
  | 'failed';

export interface RunLoopState {
  readonly workspaceId: string;
  readonly runId: string;
  readonly phase: RunLoopPhase;
  /** Exit code once the agent terminates; `null` = still running; `undefined` = unknown (NEVER fabricated 0). */
  readonly exitCode?: number | null;
  readonly startedAt: string;
  readonly updatedAt: string;
  /** Truthful failure reason when `phase === 'failed'`. */
  readonly failureReason?: string;
}

/** Truthful per-substrate availability, surfaced by `GET /substrates`. */
export interface SubstrateAvailabilityView {
  readonly id: SubstrateKind;
  readonly available: boolean;
  /** Why a substrate is unavailable (missing tmux/git/creds) — never hidden. */
  readonly reason?: string;
  /**
   * The effective pinned tmux binary this deployment drives (the conductor
   * config pin, else PATH `tmux`) — present ONLY on the `tmux_worktree` entry.
   * A config fact independent of whether the substrate is wired, so the shared-
   * tmux-server invariant (durable-shell unify §A1a) has a real, non-guessed
   * source for the wave-side attach instead of falling back to PATH `tmux`.
   */
  readonly tmuxBin?: string;
}

/** A reconcile finding as returned to operators (mirror of the DB row). */
export type ReconcileFindingKind =
  | 'live'
  | 'orphan_session'
  | 'orphan_worktree'
  | 'dangling_record'
  | 'crashed';

export interface ReconcileFindingView {
  readonly findingId: string;
  readonly workspaceId?: string;
  readonly kind: ReconcileFindingKind;
  readonly sessionName?: string;
  readonly worktreePath?: string;
  readonly detail: Record<string, unknown>;
  readonly observedAt: string;
  readonly resolved: boolean;
}

/** Aggregate result of a reconcile pass (never kills live work; only flags). */
export interface ReconcileReport {
  readonly scannedAt: string;
  readonly findings: readonly ReconcileFindingView[];
  readonly liveCount: number;
  readonly orphanCount: number;
  readonly reacquiredLockCount: number;
}
