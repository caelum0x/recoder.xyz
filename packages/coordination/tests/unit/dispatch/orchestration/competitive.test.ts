import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCompetitive } from '../../../../src/dispatch/orchestration/competitive';

test('competitive racers take shared locks and cancel losers', () => {
  const plan = planCompetitive({
    taskId: 't',
    rankedAgentIds: ['a', 'b'],
    targetPaths: ['src/**'],
    maxConcurrency: 3,
  });
  assert.equal(plan.slots.length, 2);
  assert.ok(plan.slots.every((s) => s.lockKind === 'shared'));
  assert.equal(plan.cancelLosers, true);
  assert.equal(plan.aggregation, 'first_success');
});

test('competitive respects the concurrency cap', () => {
  const plan = planCompetitive({
    taskId: 't',
    rankedAgentIds: ['a', 'b', 'c', 'd'],
    targetPaths: ['x'],
    maxConcurrency: 2,
  });
  assert.equal(plan.slots.length, 2);
});
