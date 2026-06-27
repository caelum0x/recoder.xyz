import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFanOut, partitionPaths } from '../../../../src/dispatch/orchestration/fan-out';

test('partitionPaths splits paths round-robin into disjoint buckets', () => {
  const buckets = partitionPaths(['a', 'b', 'c', 'd'], 2);
  assert.deepEqual(buckets, [['a', 'c'], ['b', 'd']]);
});

test('fan-out enforces disjoint lock scopes across parallel slots', () => {
  const plan = planFanOut({
    taskId: 't',
    rankedAgentIds: ['a', 'b'],
    targetPaths: ['src/x/**', 'src/y/**'],
    maxConcurrency: 2,
  });
  assert.equal(plan.slots.length, 2);
  const allPaths = plan.slots.flatMap((s) => s.pathGlobs);
  // no path appears in two slots → disjoint
  assert.equal(new Set(allPaths).size, allPaths.length);
  // every fan-out writer is exclusive
  assert.ok(plan.slots.every((s) => s.lockKind === 'exclusive'));
});

test('fan-out is limited to the number of distinct path partitions', () => {
  const plan = planFanOut({
    taskId: 't',
    rankedAgentIds: ['a', 'b', 'c'],
    targetPaths: ['only/one.ts'],
    maxConcurrency: 3,
  });
  // one path → at most one writer (cannot fan two exclusive writers onto one path)
  assert.equal(plan.slots.length, 1);
});

test('fan-out respects the concurrency cap', () => {
  const plan = planFanOut({
    taskId: 't',
    rankedAgentIds: ['a', 'b', 'c'],
    targetPaths: ['p1', 'p2', 'p3'],
    maxConcurrency: 2,
  });
  assert.equal(plan.slots.length, 2);
});
