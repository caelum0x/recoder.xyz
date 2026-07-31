import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentProfile } from '@recoder/agent-os';
import { McpToolRouter } from '../host/tool-router';
import { McpRegistry } from '../registry';
import {
  registerWorkflowMcpTools,
  workflowMcpServer,
  type WorkflowPort,
} from './workflow-server';

function actor(): AgentProfile {
  return { agentId: 'agent_test', permissions: { toolRules: [] } } as unknown as AgentProfile;
}

/** A fake engine that records the inputs it was called with. */
function fakePort(): WorkflowPort & {
  verifyArgs: unknown[];
  captureArgs: unknown[];
  verdict: unknown;
  hookResult: unknown;
} {
  const verifyArgs: unknown[] = [];
  const captureArgs: unknown[] = [];
  const verdict = { status: 'passed', checks: [{ name: 'verify', passed: true }], passed: true };
  const hookResult = { status: 'ok', hook: 'secret-scan', findings: [] };
  return {
    verifyArgs,
    captureArgs,
    verdict,
    hookResult,
    async verify(input) {
      verifyArgs.push(input);
      return verdict;
    },
    async captureHook(input) {
      captureArgs.push(input);
      return hookResult;
    },
  };
}

test('workflow.verify forwards workflow + checks and returns the engine verdict', async () => {
  const port = fakePort();
  const router = new McpToolRouter(new McpRegistry());
  registerWorkflowMcpTools(router, port);

  const result = await router.call({
    server: workflowMcpServer,
    toolName: 'workflow.verify',
    actor: actor(),
    args: {
      workflow: 'delivery',
      taskId: 'task_1',
      checks: [{ name: 'verify', command: 'pnpm test' }, { name: 'nope' }],
    },
  });

  assert.deepEqual(result.content, port.verdict);
  const forwarded = port.verifyArgs[0] as { workflow?: string; checks?: unknown[] };
  assert.equal(forwarded.workflow, 'delivery');
  assert.equal(forwarded.checks?.length, 2);
});

test('workflow.verify does NOT forward a caller-supplied free-form command (RCE guard)', async () => {
  const port = fakePort();
  const router = new McpToolRouter(new McpRegistry());
  registerWorkflowMcpTools(router, port);

  await router.call({
    server: workflowMcpServer,
    toolName: 'workflow.verify',
    actor: actor(),
    args: {
      workflow: 'delivery',
      // Attacker payload: a shell command straight off the MCP wire.
      checks: [{ name: 'pwn', command: 'env > /tmp/leak', kind: 'verification' }],
    },
  });

  const forwarded = port.verifyArgs[0] as {
    checks?: Array<{ name?: string; kind?: string; command?: string }>;
  };
  // The structural selector survives, but the free-form command is stripped at
  // the MCP boundary so it can never reach the verification runner / shell.
  assert.equal(forwarded.checks?.length, 1);
  assert.equal(forwarded.checks?.[0]?.name, 'pwn');
  assert.equal(forwarded.checks?.[0]?.kind, 'verification');
  assert.equal(forwarded.checks?.[0]?.command, undefined);
});

test('workflow.verify falls back to the task spec id when args omit it', async () => {
  const port = fakePort();
  const router = new McpToolRouter(new McpRegistry());
  registerWorkflowMcpTools(router, port);

  await router.call({
    server: workflowMcpServer,
    toolName: 'workflow.verify',
    actor: actor(),
    task: { taskId: 'spec_task', intent: 'ship' } as never,
    args: {},
  });

  const forwarded = port.verifyArgs[0] as { taskId?: string; task?: { intent?: string } };
  assert.equal(forwarded.taskId, 'spec_task');
  assert.equal(forwarded.task?.intent, 'ship');
});

test('workflow.capture_hook forwards content + changedFiles and returns findings', async () => {
  const port = fakePort();
  const router = new McpToolRouter(new McpRegistry());
  registerWorkflowMcpTools(router, port);

  const result = await router.call({
    server: workflowMcpServer,
    toolName: 'workflow.capture_hook',
    actor: actor(),
    args: {
      hook: 'post-tool-use',
      content: 'a diff',
      changedFiles: ['src/a.ts', 'src/b.ts'],
      exitCode: 0,
    },
  });

  assert.deepEqual(result.content, port.hookResult);
  const forwarded = port.captureArgs[0] as { hook?: string; changedFiles?: string[] };
  assert.equal(forwarded.hook, 'post-tool-use');
  assert.deepEqual(forwarded.changedFiles, ['src/a.ts', 'src/b.ts']);
});

test('the server registration advertises exactly the two workflow tools', () => {
  assert.equal(workflowMcpServer.serverId, 'recoder.workflow');
  assert.equal(workflowMcpServer.kind, 'custom');
  assert.deepEqual(workflowMcpServer.toolNames, ['workflow.verify', 'workflow.capture_hook']);
});
