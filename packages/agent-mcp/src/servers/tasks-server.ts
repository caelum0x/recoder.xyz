import { TaskService, type TaskRun, type TaskRunState, type TaskSpec } from '@recoder/agent-os';
import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

export const tasksMcpServer: McpServerRegistration = {
  serverId: 'recoder.tasks',
  kind: 'tasks',
  displayName: 'Recoder Tasks',
  transport: 'http',
  enabled: true,
  toolNames: ['tasks.list', 'tasks.get', 'tasks.create', 'tasks.update', 'tasks.claim'],
};

/**
 * The injected agent-os task repository port. This is the SAME read/write
 * contract a runtime backend (docker-backend) implements over its store of
 * record. agent-mcp stays runtime-agnostic: it never owns task state, it only
 * operates over the port the host injects. All transitions go through the
 * agent-os {@link TaskService} so only legal state changes are persisted.
 */
export type TaskRepositoryPort = {
  listTasks(filter: { spaceId?: string; intent?: string }): Promise<TaskSpec[]>;
  getTask(taskId: string): Promise<TaskSpec | null>;
  saveTask(task: TaskSpec): Promise<TaskSpec>;
  getRunForTask(taskId: string): Promise<TaskRun | null>;
  saveRun(run: TaskRun): Promise<TaskRun>;
};

export type RegisterTasksOptions = {
  service?: TaskService;
};

/**
 * Register the REAL Tasks tool handlers over an injected agent-os repository
 * port. list/get are real reads; create/update/claim are real writes through
 * the port, with run lifecycle transitions validated by the agent-os
 * {@link TaskService}. No fabricated success: a missing task yields a truthful
 * not-found error; an illegal transition is rejected by the domain service.
 */
export function registerTasksMcpTools(
  router: McpToolRouter,
  repo: TaskRepositoryPort,
  options: RegisterTasksOptions = {},
): void {
  const service = options.service ?? new TaskService();

  router.register(tasksMcpServer, 'tasks.list', async (input) => {
    const tasks = await repo.listTasks({
      spaceId: readString(input.args.spaceId) ?? input.task?.spaceId,
      intent: readString(input.args.intent),
    });
    return { content: tasks, metadata: { count: tasks.length } };
  });

  router.register(tasksMcpServer, 'tasks.get', async (input) => {
    const taskId = readRequiredString(input.args.taskId, 'taskId');
    const task = await repo.getTask(taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    const run = await repo.getRunForTask(taskId);
    return { content: { task, run }, metadata: { runState: run?.state } };
  });

  router.register(tasksMcpServer, 'tasks.create', async (input) => {
    const task = readTaskSpec(input.args);
    const saved = await repo.saveTask(task);
    return { content: saved };
  });

  router.register(tasksMcpServer, 'tasks.update', async (input) => {
    const taskId = readRequiredString(input.args.taskId, 'taskId');
    const existing = await repo.getTask(taskId);
    if (!existing) {
      throw new Error(`task not found: ${taskId}`);
    }
    const updated = applyTaskPatch(existing, input.args);
    const saved = await repo.saveTask(updated);
    return { content: saved };
  });

  router.register(tasksMcpServer, 'tasks.claim', async (input) => {
    const taskId = readRequiredString(input.args.taskId, 'taskId');
    const task = await repo.getTask(taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    const assigneeAgentId = readString(input.args.assigneeAgentId) ?? input.actor.agentId;

    const existingRun = await repo.getRunForTask(taskId);
    const run = existingRun ?? service.createRun({
      runId: readString(input.args.runId) ?? `run_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      task,
      assigneeAgentId,
    });

    // Walk the run through the legal compile -> route -> claim lifecycle via the
    // agent-os TaskService. Each step is validated by the domain transition map;
    // an illegal jump throws rather than fabricating a claimed run.
    const claimed = claimRun(service, { ...run, assigneeAgentId }, assigneeAgentId);
    const saved = await repo.saveRun(claimed);
    return { content: { task, run: saved }, metadata: { runState: saved.state } };
  });
}

/**
 * Drive a run to `claimed` through the legal agent-os lifecycle. The transition
 * map is created -> compiled -> routed -> claimed; we only advance through the
 * stages still ahead of the run's current state. Each hop is validated by the
 * TaskService (illegal hops throw), so an already-terminal or already-running
 * run surfaces a truthful transition error instead of a faked claim.
 */
function claimRun(service: TaskService, run: TaskRun, claimedBy: string): TaskRun {
  const path: TaskRunState[] = ['compiled', 'routed', 'claimed'];
  const startIndex = path.indexOf(run.state as TaskRunState);
  const remaining = startIndex >= 0 ? path.slice(startIndex + 1) : path;
  let current = run;
  for (const next of remaining) {
    current = service.transition(current, next, { claimedBy });
  }
  if (current.state !== 'claimed') {
    // Already claimed (or beyond) — re-affirm assignee without an illegal hop.
    return { ...current, assigneeAgentId: claimedBy };
  }
  return current;
}

function applyTaskPatch(existing: TaskSpec, args: Record<string, unknown>): TaskSpec {
  return {
    ...existing,
    title: readString(args.title) ?? existing.title,
    goal: readString(args.goal) ?? existing.goal,
    targetPaths: readStringArray(args.targetPaths) ?? existing.targetPaths,
    forbiddenPaths: readStringArray(args.forbiddenPaths) ?? existing.forbiddenPaths,
    acceptanceCriteria: readStringArray(args.acceptanceCriteria) ?? existing.acceptanceCriteria,
    metadata: isRecord(args.metadata) ? { ...existing.metadata, ...args.metadata } : existing.metadata,
  };
}

function readTaskSpec(args: Record<string, unknown>): TaskSpec {
  return {
    taskId: readString(args.taskId) ?? `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: readRequiredString(args.title, 'title'),
    intent: readTaskIntent(args.intent),
    goal: readRequiredString(args.goal, 'goal'),
    spaceId: readRequiredString(args.spaceId, 'spaceId'),
    repo: readString(args.repo),
    targetPaths: readStringArray(args.targetPaths) ?? [],
    forbiddenPaths: readStringArray(args.forbiddenPaths) ?? [],
    acceptanceCriteria: readStringArray(args.acceptanceCriteria) ?? [],
    verification: readVerification(args.verification),
    approvalRequired: readStringArray(args.approvalRequired) ?? [],
    artifactRequired: readStringArray(args.artifactRequired) ?? [],
    metadata: isRecord(args.metadata) ? args.metadata : undefined,
  };
}

const TASK_INTENTS: ReadonlySet<TaskSpec['intent']> = new Set<TaskSpec['intent']>([
  'bugfix',
  'feature_delivery',
  'platform_hardening',
  'refactor',
  'code_review',
  'test_generation',
  'verification',
  'documentation',
  'research',
  'release',
  'incident_response',
  'migration',
  'handoff',
  'custom',
]);

function readTaskIntent(value: unknown): TaskSpec['intent'] {
  const intent = readString(value);
  if (intent && TASK_INTENTS.has(intent as TaskSpec['intent'])) {
    return intent as TaskSpec['intent'];
  }
  return 'custom';
}

function readVerification(value: unknown): TaskSpec['verification'] {
  if (isRecord(value)) {
    return {
      commands: readStringArray(value.commands) ?? [],
      browserChecks: readStringArray(value.browserChecks),
      evidenceRequired: readStringArray(value.evidenceRequired),
    };
  }
  return { commands: [] };
}

export const TASK_RUN_STATES: readonly TaskRunState[] = [
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
];

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
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
