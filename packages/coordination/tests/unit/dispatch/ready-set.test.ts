import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReadySet } from '../../../src/dispatch/ready-set';
import type { DependencyEdge, TaskClaim, TaskNode } from '../../../src/domain';
import { makeClaim } from '../../fixtures/dispatch';

function node(taskId: string, state: TaskNode['state']): TaskNode {
  return { taskId, spaceId: 'space-1', state };
}

test('returns ready, dep-met, unclaimed tasks', () => {
  const edges: DependencyEdge[] = [{ taskId: 't2', dependsOnTaskId: 't1', kind: 'blocks' }];
  const ready = computeReadySet({
    candidates: [node('t1', 'ready'), node('t2', 'ready')],
    edges,
    upstreamStates: [node('t1', 'ready')],
    liveClaims: [],
  });
  // t2 is blocked by t1 (not terminal); only t1 is ready
  assert.deepEqual(ready.map((r) => r.taskId), ['t1']);
});

test('excludes tasks with a live claim', () => {
  const ready = computeReadySet({
    candidates: [node('t1', 'ready')],
    edges: [],
    upstreamStates: [],
    liveClaims: [makeClaim({ taskId: 't1', status: 'claimed' })],
  });
  assert.deepEqual(ready, []);
});

test('includes a task once its blocking upstream is terminal', () => {
  const edges: DependencyEdge[] = [{ taskId: 't2', dependsOnTaskId: 't1', kind: 'blocks' }];
  const ready = computeReadySet({
    candidates: [node('t2', 'ready')],
    edges,
    upstreamStates: [node('t1', 'done')],
    liveClaims: [],
  });
  assert.deepEqual(ready.map((r) => r.taskId), ['t2']);
});

test('non-ready states are not dispatchable', () => {
  const ready = computeReadySet({
    candidates: [node('t1', 'running'), node('t2', 'blocked'), node('t3', 'done')],
    edges: [],
    upstreamStates: [],
    liveClaims: [],
  });
  assert.deepEqual(ready, []);
});

test('a released claim does not exclude the task', () => {
  const ready = computeReadySet({
    candidates: [node('t1', 'ready')],
    edges: [],
    upstreamStates: [],
    liveClaims: [makeClaim({ taskId: 't1', status: 'released' })],
  });
  assert.deepEqual(ready.map((r) => r.taskId), ['t1']);
});
