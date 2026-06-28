import {
  RunService,
  transitionTaskRun,
  type RunEvent,
  type TaskRun,
  type TaskRunState,
} from '@recoder/agent-os';
import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

export const runsMcpServer: McpServerRegistration = {
  serverId: 'recoder.runs',
  kind: 'runs',
  displayName: 'Recoder Runs',
  transport: 'http',
  enabled: true,
  toolNames: ['runs.list', 'runs.get', 'runs.transition', 'runs.append_log', 'runs.attach_evidence'],
};

/**
 * The injected agent-os run repository port — the SAME read/write contract a
 * runtime backend implements over its store of record. agent-mcp never owns run
 * state; it operates over the port the host injects. Transitions are validated
 * by agent-os {@link transitionTaskRun} / {@link RunService} so only legal state
 * changes are persisted.
 */
export type RunRepositoryPort = {
  listRuns(filter: { spaceId?: string; taskId?: string }): Promise<TaskRun[]>;
  getRun(runId: string): Promise<TaskRun | null>;
  saveRun(run: TaskRun): Promise<TaskRun>;
  appendRunEvent?(runId: string, event: RunEvent): Promise<void>;
};

export type RegisterRunsOptions = {
  service?: RunService;
};

/**
 * Register the REAL Runs tool handlers over an injected agent-os repository
 * port. list/get are real reads. transition moves a run through the legal
 * agent-os state machine (illegal transitions are rejected, not faked).
 * append_log/attach_evidence apply real {@link RunEvent}s via {@link RunService}.
 */
export function registerRunsMcpTools(
  router: McpToolRouter,
  repo: RunRepositoryPort,
  options: RegisterRunsOptions = {},
): void {
  const service = options.service ?? new RunService();

  router.register(runsMcpServer, 'runs.list', async (input) => {
    const runs = await repo.listRuns({
      spaceId: readString(input.args.spaceId) ?? input.task?.spaceId,
      taskId: readString(input.args.taskId) ?? input.task?.taskId,
    });
    return { content: runs, metadata: { count: runs.length } };
  });

  router.register(runsMcpServer, 'runs.get', async (input) => {
    const run = await requireRun(repo, input.args.runId);
    return { content: run, metadata: { runState: run.state } };
  });

  router.register(runsMcpServer, 'runs.transition', async (input) => {
    const run = await requireRun(repo, input.args.runId);
    const to = readRunState(input.args.to);
    // transitionTaskRun throws on an illegal transition — truthful rejection,
    // never a fabricated success.
    const next = transitionTaskRun(run, to, {
      metadata: isRecord(input.args.metadata) ? input.args.metadata : undefined,
    });
    const saved = await repo.saveRun(next);
    return {
      content: saved,
      metadata: { from: run.state, to: saved.state },
    };
  });

  router.register(runsMcpServer, 'runs.append_log', async (input) => {
    const run = await requireRun(repo, input.args.runId);
    const event = buildLogEvent(run, input);
    const next = service.appendEvent(run, event);
    const saved = await repo.saveRun(next);
    if (repo.appendRunEvent) {
      await repo.appendRunEvent(run.runId, event);
    }
    return { content: saved, metadata: { runState: saved.state } };
  });

  router.register(runsMcpServer, 'runs.attach_evidence', async (input) => {
    const run = await requireRun(repo, input.args.runId);
    const event = buildEvidenceEvent(run, input);
    const result = service.applyEvent(run, event);
    const saved = await repo.saveRun(result.run);
    if (repo.appendRunEvent) {
      await repo.appendRunEvent(run.runId, event);
    }
    return {
      content: saved,
      metadata: { applied: result.applied, reason: result.reason, runState: saved.state },
    };
  });
}

async function requireRun(repo: RunRepositoryPort, runIdValue: unknown): Promise<TaskRun> {
  const runId = readRequiredString(runIdValue, 'runId');
  const run = await repo.getRun(runId);
  if (!run) {
    throw new Error(`run not found: ${runId}`);
  }
  return run;
}

function buildLogEvent(run: TaskRun, input: { actor: { agentId: string }; args: Record<string, unknown> }): RunEvent {
  return {
    eventId: readString(input.args.eventId) ?? `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: 'log',
    runId: run.runId,
    taskId: run.taskId,
    agentId: readString(input.args.agentId) ?? input.actor.agentId,
    createdAt: readString(input.args.createdAt) ?? new Date().toISOString(),
    message: readRequiredString(input.args.message, 'message'),
    data: { level: readString(input.args.level) ?? 'info' },
  };
}

function buildEvidenceEvent(run: TaskRun, input: { actor: { agentId: string }; args: Record<string, unknown> }): RunEvent {
  // An evidence attachment is an `artifact` run event. An optional `state` lets
  // the caller advance the run (e.g. to `verifying`) atomically with the
  // evidence — RunService validates that transition is legal before applying.
  const state = readOptionalRunState(input.args.state);
  return {
    eventId: readString(input.args.eventId) ?? `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: state ? 'state_transition' : 'artifact',
    runId: run.runId,
    taskId: run.taskId,
    agentId: readString(input.args.agentId) ?? input.actor.agentId,
    createdAt: readString(input.args.createdAt) ?? new Date().toISOString(),
    artifactId: readString(input.args.artifactId),
    state,
    data: {
      kind: readString(input.args.kind),
      detail: readString(input.args.detail),
    },
  };
}

const RUN_STATES: ReadonlySet<TaskRunState> = new Set<TaskRunState>([
  'created',
  'compiled',
  'routed',
  'claimed',
  'running',
  'needs_input',
  'verifying',
  'waiting_for_approval',
  'approved',
  'delivered',
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

function readRunState(value: unknown): TaskRunState {
  const state = readString(value);
  if (state && RUN_STATES.has(state as TaskRunState)) {
    return state as TaskRunState;
  }
  throw new Error(`invalid run state: ${String(value)}`);
}

function readOptionalRunState(value: unknown): TaskRunState | undefined {
  const state = readString(value);
  return state && RUN_STATES.has(state as TaskRunState) ? (state as TaskRunState) : undefined;
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
