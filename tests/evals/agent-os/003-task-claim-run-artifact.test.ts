import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOsEvalHarness } from './harness';

test('task can be compiled, claimed, run, and produce artifacts', () => {
  const harness = new AgentOsEvalHarness();
  harness.connectAgent('codex', 'codex');
  const task = harness.createTask({ prompt: 'Fix signup crash and verify preview', assignee: 'codex' });

  harness.claimTask(task.id, 'codex');
  harness.runTask(task.id);
  harness.attachArtifact(task.id, 'delivery-summary', 'Signup crash fixed; preview verified.');

  assert.equal(task.state, 'running');
  assert.ok(task.bundle?.agent_specific_prompt.includes('Fix signup crash'));
  assert.ok(task.artifacts.some((artifact) => artifact.metadata?.type === 'instruction_bundle'));
  assert.ok(task.artifacts.some((artifact) => artifact.key === 'delivery-summary'));
  assert.ok(task.logs.includes('run started'));
});
