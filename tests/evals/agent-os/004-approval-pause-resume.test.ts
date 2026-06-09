import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOsEvalHarness } from './harness';

test('approval pauses and resumes task execution', () => {
  const harness = new AgentOsEvalHarness();
  harness.connectAgent('claude_code', 'claude');
  const task = harness.createTask({ prompt: 'Touch auth-adjacent signup flow', assignee: 'claude' });

  const approvalId = harness.requestApproval(task.id, 'Auth-sensitive path requires review');
  assert.equal(task.state, 'waiting_for_approval');
  assert.equal(task.approvals[0]?.status, 'pending');

  harness.approve(task.id, approvalId);
  assert.equal(task.state, 'running');
  assert.equal(task.approvals[0]?.status, 'approved');
});
