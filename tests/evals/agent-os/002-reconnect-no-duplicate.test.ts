import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOsEvalHarness } from './harness';

test('agent reconnect updates identity without creating a duplicate', () => {
  const harness = new AgentOsEvalHarness();
  harness.connectAgent('codex', 'codex-local');
  harness.connectAgent('codex', 'codex-local');

  assert.equal(harness.agents.size, 1);
  assert.equal(harness.events.filter((event) => event.type === 'recoder.agent.connected').length, 1);
  assert.equal(harness.events.filter((event) => event.type === 'recoder.agent.reconnected').length, 1);
});
