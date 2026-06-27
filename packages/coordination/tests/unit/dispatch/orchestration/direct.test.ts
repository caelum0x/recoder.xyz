import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDirect } from '../../../../src/dispatch/orchestration/direct';

test('direct picks the top-ranked agent with an exclusive lock', () => {
  const plan = planDirect({
    taskId: 't',
    rankedAgentIds: ['a', 'b'],
    targetPaths: ['src/**'],
    maxConcurrency: 3,
  });
  assert.equal(plan.pattern, 'direct');
  assert.equal(plan.slots.length, 1);
  assert.equal(plan.slots[0].agentId, 'a');
  assert.equal(plan.slots[0].lockKind, 'exclusive');
  assert.equal(plan.cancelLosers, false);
});

test('direct with no agents yields no slots', () => {
  const plan = planDirect({ taskId: 't', rankedAgentIds: [], targetPaths: ['x'], maxConcurrency: 1 });
  assert.deepEqual(plan.slots, []);
});
