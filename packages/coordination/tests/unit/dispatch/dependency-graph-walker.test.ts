import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlockingAdjacency,
  upstreamsTerminal,
  detectDependencyCycle,
} from '../../../src/dispatch/dependency-graph-walker';
import type { DependencyEdge, TaskNode } from '../../../src/domain';

const edges: DependencyEdge[] = [
  { taskId: 'b', dependsOnTaskId: 'a', kind: 'blocks' },
  { taskId: 'c', dependsOnTaskId: 'b', kind: 'blocks' },
  { taskId: 'c', dependsOnTaskId: 'x', kind: 'related' },
];

function node(taskId: string, state: TaskNode['state']): TaskNode {
  return { taskId, spaceId: 's', state };
}

test('adjacency only includes blocks edges', () => {
  const adj = buildBlockingAdjacency(edges);
  assert.deepEqual(adj.get('b'), ['a']);
  assert.deepEqual(adj.get('c'), ['b']);
});

test('upstreamsTerminal true only when all blocking upstreams terminal', () => {
  const adj = buildBlockingAdjacency(edges);
  const states = new Map([['a', node('a', 'done')]]);
  assert.equal(upstreamsTerminal('b', adj, states), true);
  // c depends on b which is missing → not terminal
  assert.equal(upstreamsTerminal('c', adj, states), false);
});

test('detectDependencyCycle finds a back-edge cycle', () => {
  const cyclic: DependencyEdge[] = [
    { taskId: 'a', dependsOnTaskId: 'b', kind: 'blocks' },
    { taskId: 'b', dependsOnTaskId: 'a', kind: 'blocks' },
  ];
  const report = detectDependencyCycle(cyclic);
  assert.equal(report.hasCycle, true);
  assert.ok(report.cyclePath.length >= 2);
});

test('a DAG has no cycle', () => {
  assert.equal(detectDependencyCycle(edges).hasCycle, false);
});
