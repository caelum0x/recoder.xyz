/**
 * `playbook.types` — the DATA-DEFINED Playbook contract (LOOM-ROADMAP.md Bigger Bet B:
 * multi-agent orchestration recipes). A Playbook is a SAVED, named choreography over N
 * Loom panes that SEQUENCES the already-shipped conductor primitives
 * ({@link ConvergeFanoutService}, {@link SwarmUnblockService}, {@link ReFanService})
 * into ONE governed run. It does NOT reimplement launch/wait/converge/unblock — it is a
 * list of typed steps, each of which delegates to a shipped service through an INJECTED
 * SEAM.
 *
 * The step set is deliberately MINIMAL and grounded ONLY in what the shipped services
 * actually do:
 *  - `fanout`         → {@link ConvergeFanoutService.fanout}: fan ONE task to N agents,
 *                       wait each, auto-converge on ≥2 done-ish into ONE branch. Mints
 *                       the run's shared `taskGroup`.
 *  - `unblock_blocked`→ {@link SwarmUnblockService.resolveBlocked} over the panes the
 *                       prior fanout reported BLOCKED (`awaiting_approval`) — escalate by
 *                       default, keeping blocked panes moving for the human.
 *  - `re_fan`         → {@link ReFanService.reFan}: a SECOND round off the prior converge
 *                       branch with a narrowed follow-up task, converging again.
 *
 * These are conductor-LOCAL types (a playbook is a conductor recipe, never a core
 * `@recoder/*` contract) so core packages stay decoupled from the runtime.
 *
 * HONESTY INVARIANTS (non-negotiable — the run NEVER fabricates):
 *  - Every step outcome carries the REAL underlying service result/reason; a refused or
 *    degraded primitive is surfaced truthfully (`status:'degraded'` + reason), never a
 *    faked step success.
 *  - The run's final `converged` is only ever a branch a shipped compose ACTUALLY built;
 *    otherwise `converged:null` + a truthful `convergeReason`.
 *  - A pane is only "blocked" when the shipped fanout truthfully reported it settled to
 *    `awaiting_approval` — unknown/timed-out/errored panes are never treated as blocked.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';
import type {
  FanoutConverged,
  FanoutInput,
  FanoutResult,
} from '../fanout/converge-fanout.service.js';
import type {
  ResolveBlockedInput,
  SwarmUnblockPolicy,
  SwarmUnblockResult,
} from '../swarm/swarm-unblock.service.js';
import type { ReFanInput, ReFanResult } from '../fanout/re-fan.service.js';

// --- the data-defined step model ---------------------------------------------

/** Every step kind a built-in playbook may sequence (grounded 1:1 in a shipped service). */
export type PlaybookStepKind = 'fanout' | 'unblock_blocked' | 're_fan';

/** Fan ONE task to N agents and auto-converge — the FIRST step of every recipe. */
export interface FanoutStep {
  readonly kind: 'fanout';
  /**
   * When the fanout produced NO converged branch (<2 done-ish), stop the run and skip
   * the remaining steps truthfully. Default `false` (continue — later steps may still
   * unblock/re-fan). Documented + tested.
   */
  readonly stopIfNotConverged?: boolean;
}

/**
 * Resolve every BLOCKED pane the prior fanout reported (`awaiting_approval`) via the
 * shipped swarm-unblock — escalate by default. A truthful no-op (`status:'skipped'`)
 * when there are no blocked panes.
 */
export interface UnblockBlockedStep {
  readonly kind: 'unblock_blocked';
}

/**
 * A SECOND round off the prior converge branch with a narrowed follow-up task. Requires
 * a follow-up task on the run input; absent ⇒ the step skips truthfully. When the prior
 * fanout did not converge, the shipped re-fan itself REFUSES (no fabricated base) and the
 * step is reported `status:'degraded'`.
 */
export interface ReFanStep {
  readonly kind: 're_fan';
  /**
   * When the re-fan is REFUSED (no prior convergence to iterate from) or SKIPPED (no
   * follow-up task), stop the run and skip the remaining steps. Default `false`.
   */
  readonly stopIfDegraded?: boolean;
}

/** One typed step in a playbook — a discriminated union over the shipped primitives. */
export type PlaybookStep = FanoutStep | UnblockBlockedStep | ReFanStep;

/** A saved, named choreography: an ordered list of typed steps + human-facing metadata. */
export interface Playbook {
  /** Stable built-in id (e.g. `'fan-converge'`) — the recoder_playbook_run selector. */
  readonly id: string;
  /** One-line human description of the recipe (surfaced by recoder_playbook_list). */
  readonly description: string;
  /** The ordered steps; a well-formed playbook ALWAYS begins with a `fanout` step. */
  readonly steps: readonly PlaybookStep[];
}

// --- injected seams (the shipped services, never reimplemented) ---------------

/** The fan-out entry a playbook delegates its `fanout` steps to (composer `fanout`). */
export interface PlaybookFanoutPort {
  fanout(input: FanoutInput): Promise<FanoutResult>;
}

/** The swarm-unblock entry an `unblock_blocked` step delegates to (composer `resolveSwarmUnblock`). */
export interface PlaybookSwarmUnblockPort {
  resolveBlocked(input: ResolveBlockedInput): Promise<SwarmUnblockResult>;
}

/** The re-fan entry a `re_fan` step delegates to (composer `reFan`). */
export interface PlaybookReFanPort {
  reFan(input: ReFanInput): Promise<ReFanResult>;
}

/** Injected wiring for the playbook runner. */
export interface PlaybookDeps {
  readonly fanout: PlaybookFanoutPort;
  readonly swarmUnblock: PlaybookSwarmUnblockPort;
  readonly reFan: PlaybookReFanPort;
  /** The built-in playbook catalog; defaults to {@link BUILT_IN_PLAYBOOKS}. */
  readonly playbooks?: ReadonlyMap<string, Playbook>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

// --- input / result ----------------------------------------------------------

/** The playbook run request: which recipe, over one task + N agents + one repo. */
export interface PlaybookRunInput {
  /** The built-in playbook to run (must be a known id). */
  readonly playbookId: string;
  readonly task: string;
  readonly agentKinds: readonly string[];
  readonly base?: string;
  readonly repoPath: string;
  readonly spaceId: string;
  /** The project anchor every sibling is scoped to. */
  readonly projectId: string;
  /** The task anchor for the siblings; defaults to each fanout's minted group. */
  readonly taskId?: string;
  readonly actor: Principal;
  /** Per-pane settle budget (ms); forwarded to each fanout/re-fan. */
  readonly settleTimeoutMs?: number;
  /**
   * OPTIONAL narrowed follow-up delivered to a `re_fan` step's fresh panes. Absent ⇒
   * every `re_fan` step skips truthfully (no fabricated follow-up).
   */
  readonly followupTask?: string;
  /**
   * OPTIONAL unblock policy for `unblock_blocked` steps. Escalate-by-default: absent ⇒
   * `{ autoAnswer:false }`.
   */
  readonly unblockPolicy?: SwarmUnblockPolicy;
}

/** How a single step resolved — never fabricated. */
export type PlaybookStepStatus = 'ok' | 'degraded' | 'skipped';

/** One BLOCKED pane an `unblock_blocked` step acted on. Either the real swarm-unblock
 * `result`, or — when the swarm primitive FAULTED for this pane (e.g. unwired ⇒
 * SERVICE_UNAVAILABLE) — a truthful `faultReason` with NO result. A fault is never
 * dressed up as a fabricated escalation. */
export interface PlaybookUnblockPaneOutcome {
  readonly workspaceId: string;
  readonly result?: SwarmUnblockResult;
  readonly faultReason?: string;
}

/** The truthful outcome of one executed (or skipped) step. */
export interface PlaybookStepOutcome {
  readonly kind: PlaybookStepKind;
  /** `ok` = the primitive did its job; `degraded` = it refused/produced no convergence; `skipped` = not applicable. */
  readonly status: PlaybookStepStatus;
  /** A truthful reason for a `degraded`/`skipped` status (absent on `ok`). */
  readonly reason?: string;
  /** The shipped fanout result (only on a `fanout` step that ran). */
  readonly fanout?: FanoutResult;
  /** Per-blocked-pane swarm-unblock outcomes (only on an `unblock_blocked` step that ran). */
  readonly unblock?: readonly PlaybookUnblockPaneOutcome[];
  /** The shipped re-fan result (only on a `re_fan` step that ran, incl. a refusal). */
  readonly reFan?: ReFanResult;
}

/** The truthful, audit-ready result of a whole playbook run. */
export interface PlaybookRunResult {
  readonly playbookId: string;
  /** The shared task-group minted by the FIRST fanout, or `null` if no fanout ran. */
  readonly taskGroup: string | null;
  /** Every step's truthful outcome, in playbook order. */
  readonly steps: readonly PlaybookStepOutcome[];
  /** The FINAL converged branch produced across the run, or `null` when none was. */
  readonly converged: FanoutConverged | null;
  /** Why `converged` is `null` (the last step's truthful reason). */
  readonly convergeReason?: string;
}
