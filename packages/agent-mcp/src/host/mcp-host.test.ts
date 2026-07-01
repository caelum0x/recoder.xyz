import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AgentProfile } from '@recoder/agent-os';
import {
  RecoderMcpHost,
  type McpToolAuditRecord,
  type McpToolExecutor,
  type McpToolResult,
} from './mcp-host';
import type { McpToolCallInput } from '../permissions';
import type { McpServerRegistration } from '../registry';

/**
 * These tests pin the degrade-safety contract of the host's audit path: the
 * audit sink is a best-effort observability side-channel, so a throwing sink
 * must NEVER change the truthful outcome of a tool call. It must not mask a
 * denial reason, must not turn a completed call into a reported failure, and
 * must not swallow the real error on the failed path.
 */

const server: McpServerRegistration = {
  serverId: 'recoder.tasks',
  kind: 'tasks',
  displayName: 'Tasks',
  transport: 'http',
  enabled: true,
  toolNames: ['tasks.read', 'tasks.write'],
};

function actor(denyTool?: string): AgentProfile {
  const toolRules = denyTool
    ? [{ toolName: denyTool, effect: 'deny', reason: `Tool denied: ${denyTool}` }]
    : [];
  return { agentId: 'agent_test', permissions: { toolRules } } as unknown as AgentProfile;
}

function callInput(toolName: string, profile: AgentProfile): McpToolCallInput {
  return {
    server,
    toolName,
    actor: profile,
    args: {},
  };
}

const okExecutor: McpToolExecutor = {
  async call(): Promise<McpToolResult> {
    return { content: { ok: true } };
  },
};

const throwingSink = async (): Promise<void> => {
  throw new Error('audit backend is down');
};

test('a throwing audit sink does not mask the denial reason', async () => {
  const host = new RecoderMcpHost(okExecutor, throwingSink);
  // tasks.write is explicitly denied by the actor's tool policy.
  await assert.rejects(
    () => host.call(callInput('tasks.write', actor('tasks.write'))),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      // Must be the truthful denial reason, NOT the audit-sink error.
      assert.notEqual(error.message, 'audit backend is down');
      assert.match(error.message, /denied/i);
      return true;
    },
  );
});

test('a throwing audit sink does not turn a completed call into a failure', async () => {
  const host = new RecoderMcpHost(okExecutor, throwingSink);
  const result = await host.call(callInput('tasks.read', actor()));
  assert.deepEqual(result.content, { ok: true });
});

test('a throwing audit sink does not mask the real executor error', async () => {
  const failingExecutor: McpToolExecutor = {
    async call(): Promise<McpToolResult> {
      throw new Error('real tool failure');
    },
  };
  const host = new RecoderMcpHost(failingExecutor, throwingSink);
  await assert.rejects(
    () => host.call(callInput('tasks.read', actor())),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'real tool failure');
      return true;
    },
  );
});

test('the optional error hook observes a dropped audit record', async () => {
  const dropped: Array<{ error: unknown; record: McpToolAuditRecord }> = [];
  const host = new RecoderMcpHost(okExecutor, throwingSink, (error, record) => {
    dropped.push({ error, record });
  });
  await host.call(callInput('tasks.read', actor()));
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]?.record.status, 'completed');
  assert.ok(dropped[0]?.error instanceof Error);
});

test('a throwing error hook is contained and never corrupts the outcome', async () => {
  const host = new RecoderMcpHost(okExecutor, throwingSink, () => {
    throw new Error('hook also broken');
  });
  const result = await host.call(callInput('tasks.read', actor()));
  assert.deepEqual(result.content, { ok: true });
});

test('the happy path still delivers exactly one audit record', async () => {
  const records: McpToolAuditRecord[] = [];
  const host = new RecoderMcpHost(okExecutor, (record) => {
    records.push(record);
  });
  await host.call(callInput('tasks.read', actor()));
  assert.equal(records.length, 1);
  assert.equal(records[0]?.status, 'completed');
  assert.equal(records[0]?.toolName, 'tasks.read');
});
