/**
 * `ConvergeFanoutService` — the HEADLINE fusion verb (`recoder_converge_fanout`,
 * LOOM-ROADMAP.md §0): fan ONE task to N agents in Loom panes, wait for all to
 * settle, then AUTO-CONVERGE the sibling diffs into ONE governed, reviewable
 * branch. Neither tool can do this alone — Loom fans out N live panes but has no
 * notion they are N attempts at ONE task; Recoder converges N divergent diffs but
 * does not spawn them. This service is the THIN orchestration that composes the
 * already-shipped pieces:
 *
 *   1. Mint ONE shared `taskGroup` id (Recoder stays system-of-record; Loom only
 *      executes) and, per agent kind, create a GOVERNED workspace via the shipped
 *      `createWorkspace` path with `substrate='loom'`, a branch
 *      `recoder/fan-<kind>-<short>`, the caller's `base`, and
 *      `metadata.taskGroup=<shared>`.
 *   2. Deliver the SAME task text to each pane (the loom adapter's `continueRun` =
 *      `agent.prompt`, or the initial launch command).
 *   3. Wait for EACH pane to settle via the shipped {@link WaitService}
 *      (`waitUntilSettled`, default settle set
 *      {agent_idle_prompt,review_ready,awaiting_approval,error}).
 *   4. Once ≥2 panes settle to a DONE-ISH state, run the shipped
 *      `planConvergence(taskGroup,{probe:true})` → `composeConvergence` over the
 *      EXPLICIT settled set to fold the N sibling diffs into ONE branch through the
 *      existing governed merge path.
 *
 * Every heavy op is an INJECTED SEAM ({@link ConvergeFanoutDeps}) so the loop is
 * unit-tested against fakes with no real Loom daemon, git, or gate.
 *
 * HONESTY INVARIANTS (non-negotiable, all shipped):
 *  - Loom launches every known kind as a managed `agent.start` pane. Only
 *    claude/codex/cursor/opencode/pi/gemini currently have native status
 *    detection; recoder_code/qwen_code/crush therefore report
 *    `nativeStatus:false`, never a fabricated status signal.
 *  - A pane that never settles (timeout / superseded / stream-ended) is reported
 *    `settled:false` and EXCLUDED from the converge set — never a fabricated "done".
 *  - A pane that settles into `error` is truthful (`settled:true`) but is NOT
 *    done-ish, so it is excluded from the converge set too.
 *  - If FEWER than 2 panes settle done, DO NOT converge — return `converged:null`
 *    with a truthful `convergeReason` (nothing to converge).
 *  - A create/launch OR task-delivery failure for one kind is reported per-agent and
 *    does NOT abort the other kinds.
 *  - The converged branch is only ever returned when the compose seam actually
 *    composed it; a compose failure returns `converged:null` + the real reason.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';
import type { AttentionState } from '../types.js';
import {
  DEFAULT_SETTLE_SET,
  type WaitOutcome,
  type WaitRequest,
} from '../wait/wait.service.js';
import {
  SYNTHESIZE_SELECTION,
  type ConvergencePlan,
} from '../converge/converge-plan.service.js';

/**
 * The agent kinds Loom currently drives with NATIVE agent-status events
 * (Working→Blocked→Done flows straight from the engine). A kind here reports
 * `nativeStatus:true`.
 */
export const LOOM_NATIVE_KINDS: readonly string[] = [
  'claude',
  'codex',
  'cursor',
  'opencode',
  'pi',
  'gemini',
];

/**
 * The agent kinds Loom can launch as managed `agent.start` panes but which do not
 * yet have evidence-backed screen-status detection. They keep
 * `nativeStatus:false`: launch/resume support must not be represented as a status
 * signal until the detector can report one truthfully.
 */
export const LOOM_MANAGED_NO_STATUS_KINDS: readonly string[] = [
  'recoder_code',
  'qwen_code',
  'crush',
];

/** Every kind accepted by Loom's managed `agent.start` launch path. */
export const LOOM_MANAGED_KINDS: readonly string[] = [
  ...LOOM_NATIVE_KINDS,
  ...LOOM_MANAGED_NO_STATUS_KINDS,
];

/** Every agent kind `recoder_converge_fanout` accepts. */
export const KNOWN_AGENT_KINDS: readonly string[] = [
  ...LOOM_MANAGED_KINDS,
];

/** Fan-out N bounds — clamp to a sane parallel-run count (the tool enforces these). */
export const MIN_FANOUT_AGENTS = 2;
export const MAX_FANOUT_AGENTS = 6;

/** Default per-pane settle budget when the caller does not pin one. */
export const DEFAULT_FANOUT_SETTLE_TIMEOUT_MS = 600_000;

/**
 * The attention states that count as a pane having FINISHED producing a diff — the
 * converge-eligible set. `error` is deliberately EXCLUDED (a failed agent has no
 * trustworthy diff), and `working`/`unknown` never settle in the first place.
 */
export const DONE_ISH_STATES: readonly AttentionState[] = [
  'agent_idle_prompt',
  'review_ready',
  'awaiting_approval',
];

/** True when Loom can report this kind's native agent status. */
export function isNativeKind(kind: string): boolean {
  return LOOM_NATIVE_KINDS.includes(kind);
}

// --- injected seams ----------------------------------------------------------

/** The request to create ONE governed fan-out workspace (one agent kind). */
export interface FanoutWorkspaceCreateRequest {
  readonly kind: string;
  readonly branch: string;
  readonly base?: string;
  readonly repoPath: string;
  readonly spaceId: string;
  /** The project anchor the governed workspace is scoped to. */
  readonly projectId: string;
  /** The task anchor for the governed workspace (defaults to the shared taskGroup). */
  readonly taskId: string;
  /**
   * The execution substrate — ALWAYS `'loom'` for a fan-out (Recoder stays
   * system-of-record; Loom only executes the panes). Declared explicitly at the
   * service boundary so the honesty invariant is visible + testable.
   */
  readonly substrate: 'loom';
  /** The ONE shared task-group id every sibling is stamped with. */
  readonly taskGroup: string;
  /** The task text (may ride the launch command when the substrate supports it). */
  readonly task: string;
}

/** The truthful outcome of creating one governed workspace. */
export type FanoutWorkspaceCreateOutcome =
  | { readonly ok: true; readonly workspaceId: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The GOVERNED workspace-creator seam — the real wiring binds this to the shipped
 * `createWorkspace` path (SoR + governance gate + evidence), stamping
 * `substrate='loom'` and `metadata.taskGroup`. Injected so the service is tested
 * against a fake that just returns ids.
 */
export interface FanoutWorkspaceCreator {
  create(
    request: FanoutWorkspaceCreateRequest,
    actor: Principal
  ): Promise<FanoutWorkspaceCreateOutcome>;
}

/** The task-delivery seam — real wiring binds it to the loom adapter's `agent.prompt`. */
export interface FanoutTaskDelivery {
  deliver(
    request: {
      readonly workspaceId: string;
      readonly kind: string;
      readonly task: string;
    },
    actor: Principal
  ): Promise<void>;
}

/**
 * The settle-wait seam — the shipped {@link WaitService} satisfies this structurally
 * (`waitUntilSettled(request)`), so the real wiring injects the module's
 * `waitForWorkspaceSettle` and tests inject a scripted fake.
 */
export interface FanoutWaitPort {
  waitUntilSettled(request: WaitRequest): Promise<WaitOutcome>;
}

/** The truthful outcome of composing the convergence branch. */
export type FanoutComposeOutcome =
  | { readonly ok: true; readonly workspaceId: string; readonly branch: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The convergence-ops seam — real wiring binds it to the shipped
 * `planConvergence`/`composeConvergence` (ad-hoc over an EXPLICIT workspace set +
 * the shared taskGroup for provenance). The service NEVER reimplements the fold.
 */
export interface FanoutConvergeOps {
  plan(
    request: {
      readonly taskGroup: string;
      readonly workspaceIds: readonly string[];
      readonly probe: boolean;
    },
    actor: Principal
  ): Promise<ConvergencePlan>;
  compose(
    request: {
      readonly taskGroup: string;
      readonly workspaceIds: readonly string[];
      readonly selection: Readonly<Record<string, string>>;
    },
    actor: Principal
  ): Promise<FanoutComposeOutcome>;
}

/** Injected wiring for {@link ConvergeFanoutService}. */
export interface ConvergeFanoutDeps {
  readonly creator: FanoutWorkspaceCreator;
  readonly delivery: FanoutTaskDelivery;
  readonly wait: FanoutWaitPort;
  readonly converge: FanoutConvergeOps;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
  /** Id generator (taskGroup + branch short id); defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
}

// --- input / result ----------------------------------------------------------

/** The fan-out request: one task, N agent kinds, one repo. */
export interface FanoutInput {
  readonly task: string;
  readonly agentKinds: readonly string[];
  readonly base?: string;
  readonly repoPath: string;
  readonly spaceId: string;
  /** The project anchor every fan-out sibling is scoped to. */
  readonly projectId: string;
  /** The task anchor for the siblings; defaults to the minted shared taskGroup. */
  readonly taskId?: string;
  readonly actor: Principal;
  /** Per-pane settle budget (ms); defaults to {@link DEFAULT_FANOUT_SETTLE_TIMEOUT_MS}. */
  readonly settleTimeoutMs?: number;
}

/** One agent's truthful fan-out outcome (never fabricated). */
export interface FanoutAgentResult {
  readonly kind: string;
  /** Whether Loom can report this kind's native agent status. */
  readonly nativeStatus: boolean;
  /** The created workspace id, or `null` when the governed create failed. */
  readonly workspaceId: string | null;
  /** Did the pane settle (into ANY settle-set state, including `error`)? */
  readonly settled: boolean;
  /** The truthful reason/classifier signal (settle reason, or why it did not). */
  readonly reason: string;
  /** The settled state (or the last classified state on a non-settle). */
  readonly state?: AttentionState;
}

/** The composed convergence branch — present ONLY when it was actually composed. */
export interface FanoutConverged {
  readonly workspaceId: string;
  readonly branch: string;
}

/** The truthful result of a fan-out + auto-converge run. */
export interface FanoutResult {
  /** The ONE shared task-group id every sibling was stamped with. */
  readonly taskGroup: string;
  /** Every governed workspace that was successfully created (SoR records). */
  readonly workspaceIds: readonly string[];
  /** The composed branch, or `null` when nothing was (truthfully) converged. */
  readonly converged: FanoutConverged | null;
  /** Why `converged` is `null` (nothing to converge / compose failed). */
  readonly convergeReason?: string;
  /** Per-agent truthful outcome, in the caller's `agentKinds` order. */
  readonly perAgent: readonly FanoutAgentResult[];
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the auto-converge selection from a PROBED plan: every contested path that
 * merges cleanly (`synthesizable`) is auto-selected for a line-level 3-way
 * (`@synthesize`). A contested path that does NOT merge cleanly is left OUT, so the
 * plan stays incomplete and compose truthfully refuses (the human must pick) —
 * never a fabricated merge. Pure.
 */
function autoSynthesizeSelection(
  plan: ConvergencePlan
): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const probe of plan.contested ?? []) {
    if (probe.synthesizable) selection[probe.path] = SYNTHESIZE_SELECTION;
  }
  return selection;
}

/** Per-kind intermediate: a terminal result (create/deliver failed) or a waitable pane. */
type Stub =
  | {
      readonly kind: string;
      readonly nativeStatus: boolean;
      readonly result: FanoutAgentResult;
    }
  | {
      readonly kind: string;
      readonly nativeStatus: boolean;
      readonly workspaceId: string;
    };

function isWaitable(
  stub: Stub
): stub is { kind: string; nativeStatus: boolean; workspaceId: string } {
  return 'workspaceId' in stub;
}

export class ConvergeFanoutService {
  private readonly deps: ConvergeFanoutDeps;
  private readonly logger: LoggerPort;
  private readonly newId: () => string;

  constructor(deps: ConvergeFanoutDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Fan one task to N agents in Loom panes, wait for all to settle, then
   * auto-converge the settled siblings into ONE governed branch. Truthful degrade
   * throughout — see the class-level HONESTY INVARIANTS. Never throws for a
   * per-agent failure; a fatal seam error propagates.
   */
  async fanout(input: FanoutInput): Promise<FanoutResult> {
    const taskGroup = `fan-${this.newId().slice(0, 8)}`;
    const short = this.newId().slice(0, 8);
    const timeoutMs = input.settleTimeoutMs ?? DEFAULT_FANOUT_SETTLE_TIMEOUT_MS;

    // Steps 1-3: create a governed workspace per kind + deliver the task. Isolated
    // per kind — a create/deliver failure never aborts the sibling kinds.
    const stubs: Stub[] = [];
    const workspaceIds: string[] = [];
    for (const kind of input.agentKinds) {
      const nativeStatus = isNativeKind(kind);
      const branch = `recoder/fan-${kind}-${short}`;

      let created: FanoutWorkspaceCreateOutcome;
      try {
        created = await this.deps.creator.create(
          {
            kind,
            branch,
            ...(input.base ? { base: input.base } : {}),
            repoPath: input.repoPath,
            spaceId: input.spaceId,
            projectId: input.projectId,
            taskId: input.taskId ?? taskGroup,
            substrate: 'loom',
            taskGroup,
            task: input.task,
          },
          input.actor
        );
      } catch (err) {
        created = { ok: false, reason: message(err) };
      }
      if (!created.ok) {
        stubs.push({
          kind,
          nativeStatus,
          result: {
            kind,
            nativeStatus,
            workspaceId: null,
            settled: false,
            reason: `launch failed: ${created.reason}`,
          },
        });
        continue;
      }

      const workspaceId = created.workspaceId;
      workspaceIds.push(workspaceId);

      // Deliver the SAME task text into this pane. A delivery failure is reported
      // but does not abort the other kinds; the pane is excluded from the converge.
      try {
        await this.deps.delivery.deliver(
          { workspaceId, kind, task: input.task },
          input.actor
        );
      } catch (err) {
        stubs.push({
          kind,
          nativeStatus,
          result: {
            kind,
            nativeStatus,
            workspaceId,
            settled: false,
            reason: `task delivery failed: ${message(err)}`,
          },
        });
        continue;
      }
      stubs.push({ kind, nativeStatus, workspaceId });
    }

    // Step 4: wait for EACH delivered pane to settle (concurrently — N live panes).
    const waitables = stubs.filter(isWaitable);
    const waitByWorkspace = new Map<string, FanoutAgentResult>();
    const convergeSet: string[] = [];
    await Promise.all(
      waitables.map(async stub => {
        let outcome: WaitOutcome | null = null;
        let waitReason: string | undefined;
        try {
          outcome = await this.deps.wait.waitUntilSettled({
            workspaceId: stub.workspaceId,
            timeoutMs,
            settleSet: DEFAULT_SETTLE_SET,
          });
        } catch (err) {
          waitReason = message(err);
        }
        const result = this.classifyWait(stub, outcome, waitReason);
        waitByWorkspace.set(stub.workspaceId, result);
        // Only a pane that SETTLED to a done-ish state feeds the convergence.
        if (
          result.settled &&
          result.state != null &&
          DONE_ISH_STATES.includes(result.state)
        ) {
          convergeSet.push(stub.workspaceId);
        }
      })
    );

    const perAgent: FanoutAgentResult[] = stubs.map(stub =>
      'result' in stub ? stub.result : waitByWorkspace.get(stub.workspaceId)!
    );

    // Step 5: converge the settled siblings — but only when there is honestly
    // something to converge (≥2 done-ish panes).
    const { converged, convergeReason } = await this.convergeSettled(
      taskGroup,
      convergeSet,
      input
    );

    this.logger.info('converge fanout complete', {
      taskGroup,
      created: workspaceIds.length,
      settledDone: convergeSet.length,
      converged: converged != null,
    });

    return {
      taskGroup,
      workspaceIds,
      converged,
      ...(convergeReason ? { convergeReason } : {}),
      perAgent,
    };
  }

  /** Map a wait outcome (or a wait-seam fault) into a truthful per-agent result. */
  private classifyWait(
    stub: { kind: string; nativeStatus: boolean; workspaceId: string },
    outcome: WaitOutcome | null,
    waitReason: string | undefined
  ): FanoutAgentResult {
    if (!outcome) {
      return {
        kind: stub.kind,
        nativeStatus: stub.nativeStatus,
        workspaceId: stub.workspaceId,
        settled: false,
        reason: `wait failed: ${waitReason ?? 'unknown error'}`,
      };
    }
    if (outcome.settled) {
      return {
        kind: stub.kind,
        nativeStatus: stub.nativeStatus,
        workspaceId: stub.workspaceId,
        settled: true,
        reason: outcome.reason,
        state: outcome.state,
      };
    }
    return {
      kind: stub.kind,
      nativeStatus: stub.nativeStatus,
      workspaceId: stub.workspaceId,
      settled: false,
      reason: outcome.reason,
      state: outcome.lastState,
    };
  }

  /**
   * Fold the settled siblings into ONE governed branch via the shipped plan+compose
   * ops. Refuses truthfully (`converged:null` + reason) when there are fewer than 2
   * done-ish panes, or when compose could not resolve/build the branch — never a
   * fabricated convergence.
   */
  private async convergeSettled(
    taskGroup: string,
    convergeSet: readonly string[],
    input: FanoutInput
  ): Promise<{ converged: FanoutConverged | null; convergeReason?: string }> {
    if (convergeSet.length < MIN_FANOUT_AGENTS) {
      return {
        converged: null,
        convergeReason: `nothing to converge: ${convergeSet.length} of ${input.agentKinds.length} agent(s) settled to a reviewable state (need ≥${MIN_FANOUT_AGENTS})`,
      };
    }
    try {
      const plan = await this.deps.converge.plan(
        { taskGroup, workspaceIds: convergeSet, probe: true },
        input.actor
      );
      const selection = autoSynthesizeSelection(plan);
      const composed = await this.deps.converge.compose(
        { taskGroup, workspaceIds: convergeSet, selection },
        input.actor
      );
      if (composed.ok) {
        return {
          converged: {
            workspaceId: composed.workspaceId,
            branch: composed.branch,
          },
        };
      }
      return { converged: null, convergeReason: composed.reason };
    } catch (err) {
      // A converge-seam fault is a truthful non-convergence, never a fake branch.
      this.logger.warn('converge fanout compose faulted', {
        taskGroup,
        err: message(err),
      });
      return {
        converged: null,
        convergeReason: `convergence failed: ${message(err)}`,
      };
    }
  }
}
