/**
 * `AgentOsWorkflowRunnerDriver` — the concrete {@link WorkflowDriver} the control
 * plane dispatches through. It SKINS the frozen `@recoder/agent-workflows`
 * `AgentOsWorkflowRunner` (never re-implements execution): `start` drives one
 * definition through the runner's single-pass DAG walk and returns the resulting
 * `WorkflowRun`; the run is retained in a bounded in-memory index so `cancel`
 * and `signal` can address it by id. The index is capped (`maxRuns`) and evicts
 * the oldest terminal runs once the cap is exceeded, so a long-lived, high-
 * dispatch process cannot grow RSS without bound.
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

/**
 * Default cap on retained runs. The control plane dispatches indefinitely over
 * its uptime, so the index must be truly bounded (not merely "in-memory") to
 * avoid unbounded RSS growth. Terminal runs are evicted oldest-first once the
 * cap is exceeded (see {@link AgentOsWorkflowRunnerDriver.evict}).
 */
const DEFAULT_MAX_RUNS = 1_000;

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
  /**
   * Upper bound on retained runs before terminal runs are evicted oldest-first
   * (defaults to {@link DEFAULT_MAX_RUNS}). Clamped to a minimum of 1.
   */
  readonly maxRuns?: number;
}

export class AgentOsWorkflowRunnerDriver implements WorkflowDriver {
  private readonly runner: AgentOsWorkflowRunner;
  private readonly now: () => string;
  private readonly maxRuns: number;
  /** Bounded index of runs this driver has started, keyed by `workflowRunId`. */
  private readonly runs = new Map<string, WorkflowRun>();

  constructor(deps: AgentOsWorkflowRunnerDriverDeps = {}) {
    this.runner = deps.runner ?? new AgentOsWorkflowRunner(deps.ports);
    this.now = deps.now ?? (() => new Date().toISOString());
    this.maxRuns = Math.max(1, deps.maxRuns ?? DEFAULT_MAX_RUNS);
  }

  /** Drive a definition through the runner, retain the run, and return it. */
  async start(definition: WorkflowDefinition): Promise<WorkflowRun> {
    const run = await this.runner.run({ definition });
    this.runs.set(run.workflowRunId, run);
    this.evict();
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

  /**
   * Keep the index truly bounded once it exceeds {@link maxRuns}. Terminal runs
   * are dropped oldest-first — they can no longer transition, so `cancel` /
   * `signal` never need them. Map iteration is insertion (creation) order, so
   * "first visited" is "oldest". Only if live (non-terminal) runs alone still
   * exceed the cap does a second pass drop the oldest of those. Deleting during
   * Map iteration is well-defined: already-passed entries are simply not
   * revisited.
   */
  private evict(): void {
    if (this.runs.size <= this.maxRuns) return;
    for (const [id, run] of this.runs) {
      if (this.runs.size <= this.maxRuns) return;
      if (TERMINAL_STATUSES.has(run.status)) this.runs.delete(id);
    }
    for (const id of this.runs.keys()) {
      if (this.runs.size <= this.maxRuns) return;
      this.runs.delete(id);
    }
  }
}
