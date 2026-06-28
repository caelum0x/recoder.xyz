import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentProfile, TaskRun, TaskSpec } from '@recoder/agent-os';
import { McpRegistry } from '../registry';
import { McpToolRouter } from '../host/tool-router';
import { TaskRepositoryPort, registerTasksMcpTools, tasksMcpServer } from './tasks-server';
import { RunRepositoryPort, registerRunsMcpTools, runsMcpServer } from './runs-server';

function actor(): AgentProfile {
  return { agentId: 'agent_test', permissions: { toolRules: [] } } as unknown as AgentProfile;
}

/**
 * An in-memory implementation of the injected agent-os repository ports — the
 * SAME contract a runtime backend implements over its store of record. The MCP
 * handlers do REAL reads/writes against this; the test asserts state actually
 * materializes and transitions are legal.
 */
class InMemoryRepo implements TaskRepositoryPort, RunRepositoryPort {
  readonly tasks = new Map<string, TaskSpec>();
  readonly runsByTask = new Map<string, TaskRun>();
  readonly runsById = new Map<string, TaskRun>();

  async listTasks(filter: { spaceId?: string }): Promise<TaskSpec[]> {
    return [...this.tasks.values()].filter((t) => !filter.spaceId || t.spaceId === filter.spaceId);
  }
  async getTask(taskId: string): Promise<TaskSpec | null> {
    return this.tasks.get(taskId) ?? null;
  }
  async saveTask(task: TaskSpec): Promise<TaskSpec> {
    this.tasks.set(task.taskId, task);
    return task;
  }
  async getRunForTask(taskId: string): Promise<TaskRun | null> {
    return this.runsByTask.get(taskId) ?? null;
  }
  async listRuns(filter: { taskId?: string }): Promise<TaskRun[]> {
    return [...this.runsById.values()].filter((r) => !filter.taskId || r.taskId === filter.taskId);
  }
  async getRun(runId: string): Promise<TaskRun | null> {
    return this.runsById.get(runId) ?? null;
  }
  async saveRun(run: TaskRun): Promise<TaskRun> {
    this.runsById.set(run.runId, run);
    this.runsByTask.set(run.taskId, run);
    return run;
  }
}

function wire(repo: InMemoryRepo): McpToolRouter {
  const router = new McpToolRouter(new McpRegistry());
  registerTasksMcpTools(router, repo);
  registerRunsMcpTools(router, repo);
  return router;
}

test('tasks.create then tasks.get materializes a real task through the injected repo', async () => {
  const repo = new InMemoryRepo();
  const router = wire(repo);

  const created = await router.call({
    server: tasksMcpServer,
    toolName: 'tasks.create',
    actor: actor(),
    args: {
      taskId: 'task_1',
      title: 'Real task',
      intent: 'feature_delivery',
      goal: 'Do the thing',
      spaceId: 'space_1',
      targetPaths: ['packages/x/index.ts'],
    },
  });
  const createdTask = created.content as TaskSpec;
  assert.equal(createdTask.taskId, 'task_1');
  assert.equal(repo.tasks.get('task_1')?.title, 'Real task'); // really persisted

  const fetched = await router.call({
    server: tasksMcpServer,
    toolName: 'tasks.get',
    actor: actor(),
    args: { taskId: 'task_1' },
  });
  const body = fetched.content as { task: TaskSpec; run: TaskRun | null };
  assert.equal(body.task.goal, 'Do the thing');
  assert.equal(body.run, null);
});

test('tasks.claim creates a run and transitions it to claimed via the legal-transition service', async () => {
  const repo = new InMemoryRepo();
  const router = wire(repo);
  await repo.saveTask({
    taskId: 'task_2',
    title: 'Claimable',
    intent: 'bugfix',
    goal: 'fix',
    spaceId: 'space_1',
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  });

  const claimed = await router.call({
    server: tasksMcpServer,
    toolName: 'tasks.claim',
    actor: actor(),
    args: { taskId: 'task_2', assigneeAgentId: 'agent_99' },
  });
  const body = claimed.content as { run: TaskRun };
  assert.equal(body.run.state, 'claimed');
  assert.equal(body.run.assigneeAgentId, 'agent_99');
  // Run really persisted in the repo.
  assert.equal(repo.runsByTask.get('task_2')?.state, 'claimed');
});

test('runs.transition rejects an illegal transition (truthful, not faked success)', async () => {
  const repo = new InMemoryRepo();
  const router = wire(repo);
  await repo.saveRun({
    runId: 'run_1',
    taskId: 'task_3',
    spaceId: 'space_1',
    state: 'created',
    updatedAt: new Date().toISOString(),
  });

  // created -> completed is not a legal direct transition.
  await assert.rejects(
    () =>
      router.call({
        server: runsMcpServer,
        toolName: 'runs.transition',
        actor: actor(),
        args: { runId: 'run_1', to: 'completed' },
      }),
  );
  // State unchanged in the repo.
  assert.equal(repo.runsById.get('run_1')?.state, 'created');
});

test('runs.transition applies a legal transition and persists the new state', async () => {
  const repo = new InMemoryRepo();
  const router = wire(repo);
  await repo.saveRun({
    runId: 'run_2',
    taskId: 'task_4',
    spaceId: 'space_1',
    state: 'claimed',
    updatedAt: new Date().toISOString(),
  });

  const result = await router.call({
    server: runsMcpServer,
    toolName: 'runs.transition',
    actor: actor(),
    args: { runId: 'run_2', to: 'running' },
  });
  const run = result.content as TaskRun;
  assert.equal(run.state, 'running');
  assert.equal(repo.runsById.get('run_2')?.state, 'running');
});

test('runs.append_log appends a real run event and updates run metadata', async () => {
  const repo = new InMemoryRepo();
  const router = wire(repo);
  await repo.saveRun({
    runId: 'run_3',
    taskId: 'task_5',
    spaceId: 'space_1',
    state: 'running',
    updatedAt: new Date(0).toISOString(),
  });

  const result = await router.call({
    server: runsMcpServer,
    toolName: 'runs.append_log',
    actor: actor(),
    args: { runId: 'run_3', message: 'real log line' },
  });
  const run = result.content as TaskRun;
  assert.equal(run.metadata?.lastEventType, 'log');
  assert.ok(typeof run.metadata?.lastEventId === 'string');
});
