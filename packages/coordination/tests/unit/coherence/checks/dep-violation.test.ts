import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDepViolation } from '../../../../src/coherence/checks/dep-violation';
import { claim, depEdge, snapshot, task } from '../fixtures';

test('escalates a task in flight whose blocking upstream is not terminal', () => {
  const findings = checkDepViolation(
    snapshot({
      claims: [claim({ taskId: 'task_1' })],
      tasks: [task({ taskId: 'task_1', state: 'running' }), task({ taskId: 'task_0', state: 'running' })],
      depEdges: [depEdge({ taskId: 'task_1', dependsOnTaskId: 'task_0', kind: 'blocks' })],
    }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'dep_violation');
  assert.equal(findings[0].disposition, 'escalate');
  assert.equal(findings[0].taskId, 'task_1');
});

test('no violation when the blocking upstream is terminal', () => {
  const findings = checkDepViolation(
    snapshot({
      claims: [claim({ taskId: 'task_1' })],
      tasks: [task({ taskId: 'task_1', state: 'running' }), task({ taskId: 'task_0', state: 'done' })],
      depEdges: [depEdge({ taskId: 'task_1', dependsOnTaskId: 'task_0', kind: 'blocks' })],
    }),
  );
  assert.deepEqual(findings, []);
});

test('non-blocks edges never gate dispatch', () => {
  const findings = checkDepViolation(
    snapshot({
      claims: [claim({ taskId: 'task_1' })],
      tasks: [task({ taskId: 'task_1', state: 'running' }), task({ taskId: 'task_0', state: 'running' })],
      depEdges: [depEdge({ taskId: 'task_1', dependsOnTaskId: 'task_0', kind: 'related' })],
    }),
  );
  assert.deepEqual(findings, []);
});

test('no violation when the dependent task is not in flight', () => {
  const findings = checkDepViolation(
    snapshot({
      claims: [],
      tasks: [task({ taskId: 'task_1', state: 'ready' }), task({ taskId: 'task_0', state: 'running' })],
      depEdges: [depEdge({ taskId: 'task_1', dependsOnTaskId: 'task_0', kind: 'blocks' })],
    }),
  );
  assert.deepEqual(findings, []);
});
