/**
 * `AgentOsWorkflowRunnerDriver` — the concrete {@link WorkflowDriver} the control
 * plane dispatches through. It SKINS the frozen `@recoder/agent-workflows`
 * `AgentOsWorkflowRunner` (never re-implements execution): `start` drives one
 * definition through the runner's single-pass DAG walk and returns the resulting
 * `WorkflowRun`; the run is retained in a bounded in-memory index so `cancel`
 * and `signal` can address it by id.
 *
 * Degrade posture (never fakes success):
 *  - With no node-handler ports injected the runner still executes — nodes that
 *    require a handler (tool / verification / pull-request / deploy) surface a
 *    truthful `failed` run, and approval / approval-wait nodes park the run in
 *    `waiting`. Bootstrap may inject real handler ports (runtime resolution,
 *    approvals, verification, PR, deploy) for full execution behind THIS seam.
 *  - The in-process runner has no durable resume, so a non-`cancel` `signal`
 *    surfaces a truthful error rather than pretending to resume a parked run;
 *    `cancel` marks a tracked, non-terminal run `cancelled` (idempotent on
 *    terminal runs) and rejects an unknown run id.
 */
import {
  AgentOsWorkflowRunner,
  type AgentOsWorkflowRunnerPorts,
  type WorkflowDefinition,
  type WorkflowDriver,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowSignal,
} from '@recoder/agent-workflows';

/** Run states past which no further transition is legal (cancel is a no-op). */
const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export interface AgentOsWorkflowRunnerDriverDeps {
  /** A pre-built runner (tests / explicit composition). Omitted ⇒ built from `ports`. */
  readonly runner?: AgentOsWorkflowRunner;
  /**
   * Node-handler ports forwarded to the runner when it is built here. Absent ⇒
   * the bare runner (handler-less nodes fail / park truthfully — see class doc).
   */
  readonly ports?: AgentOsWorkflowRunnerPorts;
  /** Injectable clock for cancel timestamps (defaults to wall-clock ISO). */
  readonly now?: () => string;
}

export class AgentOsWorkflowRunnerDriver implements WorkflowDriver {
  private readonly runner: AgentOsWorkflowRunner;
  private readonly now: () => string;
  /** Bounded index of runs this driver has started, keyed by `workflowRunId`. */
  private readonly runs = new Map<string, WorkflowRun>();

  constructor(deps: AgentOsWorkflowRunnerDriverDeps = {}) {
    this.runner = deps.runner ?? new AgentOsWorkflowRunner(deps.ports);
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** Drive a definition through the runner, retain the run, and return it. */
  async start(definition: WorkflowDefinition): Promise<WorkflowRun> {
    const run = await this.runner.run({ definition });
    this.runs.set(run.workflowRunId, run);
    return run;
  }

  /**
   * Deliver a signal to a tracked run. `cancel` delegates to {@link cancel};
   * every other signal type is rejected truthfully — the in-process runner
   * executes a definition in a single pass and has no durable resume seam, so a
   * parked run cannot be resumed by an `input` / `approval_decision` signal here.
   */
  async signal(runId: string, signal: WorkflowSignal): Promise<void> {
    if (signal.type === 'cancel') {
      await this.cancel(runId);
      return;
    }
    this.requireRun(runId);
    throw new Error(
      `workflow run ${runId} cannot accept a '${signal.type}' signal: ` +
        'the in-process runner has no durable resume seam',
    );
  }

  /**
   * Cancel a tracked run. Idempotent no-op when the run is already terminal;
   * rejects an unknown run id (never silently fabricates a cancellation).
   */
  async cancel(runId: string): Promise<void> {
    const run = this.requireRun(runId);
    if (TERMINAL_STATUSES.has(run.status)) return;
    const cancelledAt = this.now();
    this.runs.set(runId, {
      ...run,
      status: 'cancelled',
      updatedAt: cancelledAt,
      completedAt: cancelledAt,
    });
  }

  /** The retained run for `runId`, or `null` when this driver never started it. */
  getRun(runId: string): WorkflowRun | null {
    return this.runs.get(runId) ?? null;
  }

  private requireRun(runId: string): WorkflowRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown workflow run: ${runId}`);
    return run;
  }
}
