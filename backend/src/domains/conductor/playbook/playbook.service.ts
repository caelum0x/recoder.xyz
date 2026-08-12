/**
 * `PlaybookService` — runs a BUILT-IN playbook's typed steps IN ORDER over ONE shared
 * `taskGroup`, delegating each step to a SHIPPED conductor service through an injected
 * seam. It NEVER reimplements fan-out / wait / converge / unblock / re-fan — it only
 * SEQUENCES them and threads the run state (the shared group + the latest converge
 * branch) between steps.
 *
 * See {@link Playbook} for the data-defined step model and the HONESTY INVARIANTS. In
 * short: every step outcome reflects the REAL underlying service result; a refused or
 * degraded primitive is surfaced truthfully (`status:'degraded'` + reason); a pane is
 * only "blocked" when the shipped fan-out truthfully reported it settled to
 * `awaiting_approval`; and the run's final `converged` is only ever a branch a shipped
 * compose ACTUALLY built.
 *
 * Stop-vs-continue is per the PLAYBOOK DEFINITION, not the service: a `fanout` step may
 * set `stopIfNotConverged`, a `re_fan` step may set `stopIfDegraded`. When a step so
 * marked degrades, the remaining steps are recorded truthfully as `skipped` — the run is
 * never silently truncated.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { AttentionState } from '../types.js';
import type {
  FanoutConverged,
  FanoutInput,
  FanoutResult,
} from '../fanout/converge-fanout.service.js';
import type { ReFanInput, ReFanResult } from '../fanout/re-fan.service.js';
import type {
  ResolveBlockedInput,
  SwarmUnblockPolicy,
  SwarmUnblockResult,
} from '../swarm/swarm-unblock.service.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import { BUILT_IN_PLAYBOOKS } from './playbooks.js';
import type {
  Playbook,
  PlaybookDeps,
  PlaybookRunInput,
  PlaybookRunResult,
  PlaybookStep,
  PlaybookStepOutcome,
  PlaybookUnblockPaneOutcome,
} from './playbook.types.js';

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** Escalate-by-default posture when the run supplies no unblock policy. */
const DEFAULT_UNBLOCK_POLICY: SwarmUnblockPolicy = { autoAnswer: false };

/**
 * The single attention state a shipped fan-out reports for a pane that is BLOCKED —
 * waiting for the human/agent to answer/approve before it can proceed (Loom native
 * "Blocked"). `agent_idle_prompt`/`review_ready` are done-but-not-blocked, and
 * `error`/`working`/`unknown` are not blocked either — so only this state feeds
 * swarm-unblock, never a fabricated block.
 */
const BLOCKED_STATE: AttentionState = 'awaiting_approval';

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The panes a prior fan-out truthfully reported BLOCKED: settled to `awaiting_approval`
 * with a real workspace id. Pure — derived ONLY from the shipped {@link FanoutResult},
 * never guessed.
 */
export function blockedPanesOf(fanout: FanoutResult): readonly string[] {
  return fanout.perAgent
    .filter(
      a => a.settled && a.state === BLOCKED_STATE && a.workspaceId != null
    )
    .map(a => a.workspaceId as string);
}

/** Mutable-in-place run accumulator (local to one `run` call; never shared). */
interface RunState {
  taskGroup: string | null;
  lastFanout: FanoutResult | null;
  converged: FanoutConverged | null;
  convergeReason: string | undefined;
  stopped: boolean;
  stopReason: string | undefined;
}

export class PlaybookService {
  private readonly deps: PlaybookDeps;
  private readonly logger: LoggerPort;
  private readonly playbooks: ReadonlyMap<string, Playbook>;

  constructor(deps: PlaybookDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
    this.playbooks = deps.playbooks ?? BUILT_IN_PLAYBOOKS;
  }

  /**
   * Run the named built-in playbook end-to-end. Throws `NOT_FOUND` for an unknown id
   * (a bad recipe never launches anything). Otherwise returns a truthful
   * {@link PlaybookRunResult} — the shared group, per-step outcomes, and the final
   * converged branch (or `null` + reason).
   */
  async run(input: PlaybookRunInput): Promise<PlaybookRunResult> {
    const playbook = this.playbooks.get(input.playbookId);
    if (!playbook) {
      throw createError(
        ErrorCode.NOT_FOUND,
        `unknown playbook '${input.playbookId}'`
      );
    }

    const state: RunState = {
      taskGroup: null,
      lastFanout: null,
      converged: null,
      convergeReason: undefined,
      stopped: false,
      stopReason: undefined,
    };
    const steps: PlaybookStepOutcome[] = [];

    for (const step of playbook.steps) {
      if (state.stopped) {
        steps.push({
          kind: step.kind,
          status: 'skipped',
          reason:
            state.stopReason ?? 'a prior step degraded and the run stopped',
        });
        continue;
      }
      steps.push(await this.runStep(step, input, state));
    }

    this.logger.info('playbook run complete', {
      playbookId: input.playbookId,
      taskGroup: state.taskGroup,
      steps: steps.map(s => `${s.kind}:${s.status}`),
      converged: state.converged != null,
    });

    return {
      playbookId: input.playbookId,
      taskGroup: state.taskGroup,
      steps,
      converged: state.converged,
      ...(state.converged == null && state.convergeReason
        ? { convergeReason: state.convergeReason }
        : {}),
    };
  }

  /** Dispatch one typed step to its shipped service; mutate the run state truthfully. */
  private async runStep(
    step: PlaybookStep,
    input: PlaybookRunInput,
    state: RunState
  ): Promise<PlaybookStepOutcome> {
    switch (step.kind) {
      case 'fanout':
        return this.runFanout(step, input, state);
      case 'unblock_blocked':
        return this.runUnblock(input, state);
      case 're_fan':
        return this.runReFan(step, input, state);
    }
  }

  /** A `fanout` step: delegate to the shipped fan-out, thread the group + converge branch. */
  private async runFanout(
    step: Extract<PlaybookStep, { kind: 'fanout' }>,
    input: PlaybookRunInput,
    state: RunState
  ): Promise<PlaybookStepOutcome> {
    const fanoutInput: FanoutInput = {
      task: input.task,
      agentKinds: input.agentKinds,
      repoPath: input.repoPath,
      spaceId: input.spaceId,
      projectId: input.projectId,
      actor: input.actor,
      ...(input.base ? { base: input.base } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.settleTimeoutMs !== undefined
        ? { settleTimeoutMs: input.settleTimeoutMs }
        : {}),
    };
    const fanout = await this.deps.fanout.fanout(fanoutInput);

    // The FIRST fanout mints the run's shared group; later fanouts still link here.
    if (state.taskGroup == null) state.taskGroup = fanout.taskGroup;
    state.lastFanout = fanout;
    if (fanout.converged) {
      state.converged = fanout.converged;
      state.convergeReason = undefined;
    } else {
      state.convergeReason = fanout.convergeReason;
    }

    if (!fanout.converged) {
      if (step.stopIfNotConverged) {
        state.stopped = true;
        state.stopReason =
          fanout.convergeReason ?? 'fanout produced no converged branch';
      }
      return {
        kind: 'fanout',
        status: 'degraded',
        ...(fanout.convergeReason ? { reason: fanout.convergeReason } : {}),
        fanout,
      };
    }
    return { kind: 'fanout', status: 'ok', fanout };
  }

  /**
   * An `unblock_blocked` step: run swarm-unblock over every pane the prior fanout
   * reported BLOCKED. No prior fanout ⇒ skipped truthfully; no blocked panes ⇒ a
   * truthful no-op. Escalate by default (the run's policy, default `autoAnswer:false`).
   */
  private async runUnblock(
    input: PlaybookRunInput,
    state: RunState
  ): Promise<PlaybookStepOutcome> {
    if (!state.lastFanout || state.taskGroup == null) {
      return {
        kind: 'unblock_blocked',
        status: 'skipped',
        reason: 'no prior fanout to source blocked panes from',
      };
    }
    const blocked = blockedPanesOf(state.lastFanout);
    if (blocked.length === 0) {
      return {
        kind: 'unblock_blocked',
        status: 'skipped',
        reason: 'no blocked panes reported by the prior fanout',
      };
    }
    const policy = input.unblockPolicy ?? DEFAULT_UNBLOCK_POLICY;
    const taskGroup = state.taskGroup;
    const outcomes: PlaybookUnblockPaneOutcome[] = [];
    for (const workspaceId of blocked) {
      const resolveInput: ResolveBlockedInput = {
        workspaceId,
        taskGroup,
        policy,
        actor: input.actor,
      };
      let result: SwarmUnblockResult;
      try {
        result = await this.deps.swarmUnblock.resolveBlocked(resolveInput);
      } catch (err) {
        // A per-pane swarm-unblock fault is surfaced truthfully as an escalation-miss;
        // it never fabricates an answer and never aborts the other blocked panes.
        this.logger.warn('playbook unblock step: pane resolve faulted', {
          workspaceId,
          err: message(err),
        });
        result = {
          action: 'escalated',
          requestId: '',
          question: null,
          reason: `swarm-unblock faulted: ${message(err)}`,
        };
      }
      outcomes.push({ workspaceId, result });
    }
    return { kind: 'unblock_blocked', status: 'ok', unblock: outcomes };
  }

  /**
   * A `re_fan` step: iterate the prior convergence with a narrowed follow-up. Requires a
   * follow-up task (absent ⇒ skipped truthfully) and a prior group (the run's shared
   * group). The shipped re-fan REFUSES when there is no prior convergence — surfaced as
   * `degraded`, never a fabricated base or downstream success.
   */
  private async runReFan(
    step: Extract<PlaybookStep, { kind: 're_fan' }>,
    input: PlaybookRunInput,
    state: RunState
  ): Promise<PlaybookStepOutcome> {
    if (state.taskGroup == null) {
      return this.degradeOrSkipReFan(
        step,
        state,
        'skipped',
        'no prior fanout to iterate a re-fan from'
      );
    }
    const followup = input.followupTask?.trim();
    if (!followup) {
      return this.degradeOrSkipReFan(
        step,
        state,
        'skipped',
        'no followupTask supplied for the re-fan step'
      );
    }

    const reFanInput: ReFanInput = {
      taskGroup: state.taskGroup,
      narrowedTask: followup,
      agentKinds: input.agentKinds,
      repoPath: input.repoPath,
      spaceId: input.spaceId,
      projectId: input.projectId,
      actor: input.actor,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.settleTimeoutMs !== undefined
        ? { settleTimeoutMs: input.settleTimeoutMs }
        : {}),
    };
    const reFan = await this.deps.reFan.reFan(reFanInput);

    if (reFan.refused) {
      if (step.stopIfDegraded) {
        state.stopped = true;
        state.stopReason = reFan.reason;
      }
      // Do NOT overwrite an earlier real convergence with the refusal — but surface the
      // refusal reason when nothing converged yet.
      if (state.converged == null) state.convergeReason = reFan.reason;
      return {
        kind: 're_fan',
        status: 'degraded',
        reason: reFan.reason,
        reFan,
      };
    }

    // A non-refused re-fan mints its OWN second-round group; the run's SHARED group
    // stays the round-1 group (its result links back via `priorTaskGroup`).
    if (reFan.converged) {
      state.converged = reFan.converged;
      state.convergeReason = undefined;
    } else if (state.converged == null) {
      state.convergeReason = reFan.convergeReason;
    }
    return { kind: 're_fan', status: 'ok', reFan };
  }

  /** Record a `re_fan` skip/degrade truthfully, honouring the step's stop flag. */
  private degradeOrSkipReFan(
    step: Extract<PlaybookStep, { kind: 're_fan' }>,
    state: RunState,
    status: 'skipped' | 'degraded',
    reason: string
  ): PlaybookStepOutcome {
    if (step.stopIfDegraded) {
      state.stopped = true;
      state.stopReason = reason;
    }
    return { kind: 're_fan', status, reason };
  }
}
