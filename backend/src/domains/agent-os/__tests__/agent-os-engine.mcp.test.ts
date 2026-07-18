/**
 * SECURITY: the agent-os READ tools (`agent_os_summary`, `agent_os_list_tasks`,
 * `agent_os_list_runs`) expose the tenant-owned control-plane state-of-record.
 * They MUST bind to the host-authorized {@link McpToolCaller} and return only the
 * caller's own spaces — NEVER the whole control plane. Without this, tenant A
 * would receive every other space's TaskSpec + TaskRun (cross-tenant disclosure).
 * These tests pin the space-scoping binding.
 */
import { describe, it, expect } from 'vitest';
import { buildAgentOsMcpTools } from '../mcp/agent-os-engine.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { Space, TaskRun, TaskSpec } from '@recoder/agent-os';

function space(spaceId: string, ownerId: string): Space {
  return {
    spaceId,
    displayName: spaceId,
    ownerId,
    repositories: [],
    policy: {
      policyId: `${spaceId}-policy`,
      approvalRequiredFor: [],
      forbiddenPaths: [],
      defaultVerificationCommands: [],
      allowNetworkByDefault: false,
      allowShellByDefault: false,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function task(taskId: string, spaceId: string): TaskSpec {
  return {
    taskId,
    title: `title-${taskId}`,
    intent: 'feature_delivery',
    goal: `goal-${taskId}`,
    spaceId,
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
}

function run(runId: string, taskId: string, spaceId: string): TaskRun {
  return { runId, taskId, spaceId, state: 'created', updatedAt: new Date(0).toISOString() };
}

/** Two tenants: space-a owned by user-a, space-b owned by user-b. */
function repo(): InMemoryAgentOsRepository {
  return new InMemoryAgentOsRepository({
    spaces: [space('space-a', 'user-a'), space('space-b', 'user-b')],
    tasks: [task('task-a', 'space-a'), task('task-b', 'space-b')],
    runs: [run('run-a', 'task-a', 'space-a'), run('run-b', 'task-b', 'space-b')],
  });
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const callerA: McpToolCaller = { userId: 'user-a' };
const adminCaller: McpToolCaller = { userId: 'ops', scopes: ['internal'] };

describe('agent-os MCP read tools — tenant scoping', () => {
  it('list_tasks returns ONLY the caller-owned space (no cross-tenant TaskSpec)', async () => {
    const tools = buildAgentOsMcpTools(repo());
    const result = (await tool(tools, 'agent_os_list_tasks').handler({}, callerA)) as TaskSpec[];
    expect(result.map((t) => t.taskId)).toEqual(['task-a']);
    expect(result.some((t) => t.spaceId === 'space-b')).toBe(false);
  });

  it('list_runs returns ONLY the caller-owned space (no cross-tenant TaskRun)', async () => {
    const tools = buildAgentOsMcpTools(repo());
    const result = (await tool(tools, 'agent_os_list_runs').handler({}, callerA)) as TaskRun[];
    expect(result.map((r) => r.runId)).toEqual(['run-a']);
  });

  it('summary scopes tasks/runs/spaces to the caller-owned space', async () => {
    const tools = buildAgentOsMcpTools(repo());
    const snap = (await tool(tools, 'agent_os_summary').handler({}, callerA)) as {
      tasks: TaskSpec[];
      runs: TaskRun[];
      spaces: Space[];
    };
    expect(snap.tasks.map((t) => t.taskId)).toEqual(['task-a']);
    expect(snap.runs.map((r) => r.runId)).toEqual(['run-a']);
    expect(snap.spaces.map((s) => s.spaceId)).toEqual(['space-a']);
  });

  it('refuses (AUTH_REQUIRED) when no caller identity is threaded', async () => {
    const tools = buildAgentOsMcpTools(repo());
    await expect(tool(tools, 'agent_os_list_tasks').handler({}, undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('refuses (403) a non-privileged caller selecting a foreign spaceId', async () => {
    const tools = buildAgentOsMcpTools(repo());
    await expect(
      tool(tools, 'agent_os_list_tasks').handler({ spaceId: 'space-b' }, callerA),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('admin/internal caller reads across all spaces', async () => {
    const tools = buildAgentOsMcpTools(repo());
    const result = (await tool(tools, 'agent_os_list_tasks').handler({}, adminCaller)) as TaskSpec[];
    expect(result.map((t) => t.taskId).sort()).toEqual(['task-a', 'task-b']);
  });

  it('admin/internal caller may narrow to a single spaceId', async () => {
    const tools = buildAgentOsMcpTools(repo());
    const result = (await tool(tools, 'agent_os_list_runs').handler({ spaceId: 'space-b' }, adminCaller)) as TaskRun[];
    expect(result.map((r) => r.runId)).toEqual(['run-b']);
  });
});
