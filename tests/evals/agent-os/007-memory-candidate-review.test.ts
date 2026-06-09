import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOsEvalHarness } from './harness';

test('memory update is proposed for review before durable memory write', () => {
  const harness = new AgentOsEvalHarness();
  harness.connectAgent('codex', 'codex');
  const task = harness.createTask({ prompt: 'Record verification command after completion', assignee: 'codex' });

  harness.verify(task.id, 'agent-os evals passed');
  harness.completeWithMemoryCandidate(task.id);

  assert.equal(task.state, 'completed');
  assert.equal(harness.memoryCandidates.length, 1);
  assert.equal(harness.memory.length, 0);

  harness.approveMemoryCandidate(harness.memoryCandidates[0]!.id);
  assert.equal(harness.memoryCandidates[0]!.status, 'approved');
  assert.equal(harness.memory.length, 1);
});
