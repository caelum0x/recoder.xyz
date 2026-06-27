import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDependencies,
  blockingDependencyIds,
} from '../../../src/dispatch/dependency-resolver';
import type { DependencyEdge, TaskNode } from '../../../src/domain';

const edges: DependencyEdge[] = [
  { taskId: 't', dependsOnTaskId: 'u1', kind: 'blocks' },
  { taskId: 't', dependsOnTaskId: 'u2', kind: 'blocks' },
  { taskId: 't', dependsOnTaskId: 'note', kind: 'related' },
];

function node(taskId: string, state: TaskNode['state']): TaskNode {
  return { taskId, spaceId: 'space-1', state };
}

test('only blocks edges gate dispatch', () => {
  assert.deepEqual(blockingDependencyIds('t', edges), ['u1', 'u2']);
});

test('ready when all blocking upstreams are terminal', () => {
  const r = resolveDependencies('t', edges, [node('u1', 'done'), node('u2', 'cancelled')]);
  assert.equal(r.ready, true);
  assert.deepEqual(r.unmetDependencyTaskIds, []);
});

test('blocked when an upstream is not terminal', () => {
  const r = resolveDependencies('t', edges, [node('u1', 'done'), node('u2', 'running')]);
  assert.equal(r.ready, false);
  assert.deepEqual(r.unmetDependencyTaskIds, ['u2']);
});

test('missing upstream state is treated as unmet (fail-safe)', () => {
  const r = resolveDependencies('t', edges, [node('u1', 'done')]);
  assert.equal(r.ready, false);
  assert.deepEqual(r.unmetDependencyTaskIds, ['u2']);
});

test('a task with no blocking deps is immediately ready', () => {
  const r = resolveDependencies('x', edges, []);
  assert.equal(r.ready, true);
});
