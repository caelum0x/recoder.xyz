import test from 'node:test';
import assert from 'node:assert/strict';
import { canCallMcpTool } from '../../../packages/agent-mcp/src/index';
import { collectRuntimeEvents, createRuntimeEvent, type AgentRuntimeAdapter } from '../../../packages/agent-runtimes/src/index';
import { validateWorkflowDefinition } from '../../../packages/agent-workflows/src/index';
import type { AgentProfile, InstructionBundle, TaskSpec } from '../../../packages/agent-os/src/index';

const profile: AgentProfile = {
  agentId: 'claude',
  displayName: 'Claude Code',
  vendorSurface: 'claude_code',
  connectorId: 'claude-local',
  runtimeKind: 'local',
  capabilities: [{ capabilityId: 'implementation', kind: 'implementation', label: 'Implementation' }],
  tools: [{ toolName: 'repo.read', modes: ['read'] }],
  supportedTaskIntents: ['bugfix'],
  permissions: {
    defaultFileEffect: 'deny',
    pathRules: [],
    toolRules: [{ toolName: 'repo.delete', effect: 'deny' }],
    allowNetwork: true,
    allowShell: true,
    allowGitWrite: false,
    allowPrCreation: false,
    allowSecretsAccess: false,
    maxParallelSubagents: 1,
    writeLockRequired: true,
  },
  approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
  memoryScope: 'repo',
  cwdPolicy: { mode: 'repo_root', allowedRoots: ['/repo'] },
  health: { status: 'healthy', checkedAt: '2026-06-06T00:00:00.000Z' },
  lastSeenAt: '2026-06-06T00:00:00.000Z',
};

const task: TaskSpec = {
  taskId: 'task-1',
  title: 'Fix signup',
  intent: 'bugfix',
  goal: 'Fix signup crash',
  spaceId: 'space-1',
  targetPaths: ['app/**'],
  forbiddenPaths: [],
  acceptanceCriteria: ['fixed'],
  verification: { commands: ['pnpm test'] },
  approvalRequired: [],
  artifactRequired: [],
};

const bundle: InstructionBundle = {
  bundleId: 'bundle-1',
  taskId: task.taskId,
  agentId: profile.agentId,
  runtime: profile.vendorSurface,
  sharedGoal: task.goal,
  renderedPrompt: 'Fix signup crash',
  acceptanceCriteria: task.acceptanceCriteria,
  verificationCommands: task.verification.commands,
  forbiddenActions: [],
  approvalGateIds: [],
  memoryRefIds: [],
  sourceRefs: [],
  compilerVersion: 'test',
  compiledAt: '2026-06-06T00:00:00.000Z',
};

test('runtime adapter contract emits shared RunEvents', async () => {
  const adapter: AgentRuntimeAdapter = {
    id: 'test-runtime',
    kind: 'claude_code',
    health: async () => profile.health,
    capabilities: async () => profile.capabilities,
    async *sendTask(input) {
      yield createRuntimeEvent({ type: 'started', taskId: input.task.taskId, runId: 'run-1' });
      yield createRuntimeEvent({ type: 'completed', taskId: input.task.taskId, runId: 'run-1' });
    },
    cancel: async () => {},
  };

  const events = await collectRuntimeEvents(adapter.sendTask({
    task,
    bundle,
    policy: {
      requireSignedEnvelope: true,
      enforceWorkLocks: true,
      allowNetwork: true,
      allowShell: true,
      approvalMode: 'policy',
    },
  }));

  assert.deepEqual(events.map((event) => event.type), ['started', 'completed']);
});

test('workflow definitions validate missing dependencies', () => {
  const errors = validateWorkflowDefinition({
    workflowId: 'wf-1',
    name: 'Agent OS delivery',
    version: '1',
    nodes: [
      { nodeId: 'compile', kind: 'agent', label: 'Compile instructions', config: {} },
      { nodeId: 'verify', kind: 'verification', label: 'Verify', dependsOn: ['compile'], config: {} },
    ],
  });
  assert.deepEqual(errors, []);

  const broken = validateWorkflowDefinition({
    workflowId: 'wf-2',
    name: 'Broken',
    version: '1',
    nodes: [{ nodeId: 'verify', kind: 'verification', label: 'Verify', dependsOn: ['missing'], config: {} }],
  });
  assert.ok(broken.some((error) => error.includes('missing')));
});

test('MCP registry enforces enabled servers and denied tool rules', () => {
  const allowed = canCallMcpTool({
    server: {
      serverId: 'repo',
      kind: 'repo',
      displayName: 'Repo',
      transport: 'stdio',
      enabled: true,
      toolNames: ['repo.read', 'repo.delete'],
    },
    toolName: 'repo.read',
    actor: profile,
    task,
    args: {},
  });
  assert.equal(allowed.allowed, true);

  const denied = canCallMcpTool({
    server: {
      serverId: 'repo',
      kind: 'repo',
      displayName: 'Repo',
      transport: 'stdio',
      enabled: true,
      toolNames: ['repo.read', 'repo.delete'],
    },
    toolName: 'repo.delete',
    actor: profile,
    task,
    args: {},
  });
  assert.equal(denied.allowed, false);
});
