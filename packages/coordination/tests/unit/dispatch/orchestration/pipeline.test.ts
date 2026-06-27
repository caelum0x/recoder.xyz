import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPipeline } from '../../../../src/dispatch/orchestration/pipeline';

test('pipeline produces ascending stages over the same scope', () => {
  const plan = planPipeline({
    taskId: 't',
    rankedAgentIds: ['a', 'b', 'c'],
    targetPaths: ['src/**'],
    maxConcurrency: 3,
  });
  assert.deepEqual(plan.slots.map((s) => s.stage), [0, 1, 2]);
  assert.ok(plan.slots.every((s) => s.lockKind === 'exclusive'));
  assert.deepEqual(plan.slots.map((s) => s.agentId), ['a', 'b', 'c']);
});

test('pipeline respects the concurrency cap on stage count', () => {
  const plan = planPipeline({
    taskId: 't',
    rankedAgentIds: ['a', 'b', 'c'],
    targetPaths: ['x'],
    maxConcurrency: 2,
  });
  assert.equal(plan.slots.length, 2);
});
