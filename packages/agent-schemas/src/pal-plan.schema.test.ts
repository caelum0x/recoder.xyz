import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAgentOsCanonicalSchema } from './canonical-schemas';

const basePlan = {
  taskId: 'task-1',
  primaryRuntime: 'codex',
  browserVerification: false,
  sandbox: 'daytona',
  skills: ['implementation'],
  mcpTools: ['recoder.shell.exec'],
  approvalGateIds: ['approval-1'],
  risk: 'medium',
  generatedAt: '2026-06-13T00:00:00.000Z',
};

test('PALPlan requires explicit MCP tool grants', () => {
  const result = validateAgentOsCanonicalSchema('PALPlan', basePlan);

  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.issues[0]?.path, 'mcpToolGrants');
});

test('PALPlan accepts grants with server and tool identity', () => {
  const result = validateAgentOsCanonicalSchema('PALPlan', {
    ...basePlan,
    mcpToolGrants: [
      {
        serverId: 'recoder',
        toolName: 'shell.exec',
        mode: 'execute',
        reason: 'verification command',
      },
    ],
  });

  assert.equal(result.ok, true);
});

test('PALPlan rejects malformed MCP tool grants', () => {
  const result = validateAgentOsCanonicalSchema('PALPlan', {
    ...basePlan,
    mcpToolGrants: [{ serverId: 'recoder' }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.issues[0]?.path, 'mcpToolGrants.0');
});
