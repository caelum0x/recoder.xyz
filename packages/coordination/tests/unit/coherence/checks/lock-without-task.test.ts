import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkLockWithoutTask } from '../../../../src/coherence/checks/lock-without-task';
import { lock, snapshot, task } from '../fixtures';

test('flags a lock whose task is terminal as healable drift', () => {
  const findings = checkLockWithoutTask(
    snapshot({ locks: [lock()], tasks: [task({ state: 'done' })] }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'lock_without_task');
  assert.equal(findings[0].disposition, 'heal');
  assert.equal(findings[0].lockId, 'lock_1');
});

test('flags a lock whose task is missing from the graph', () => {
  const findings = checkLockWithoutTask(snapshot({ locks: [lock()], tasks: [] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /not in the task graph/);
});

test('does not flag a lock whose task is still running', () => {
  const findings = checkLockWithoutTask(
    snapshot({ locks: [lock()], tasks: [task({ state: 'running' })] }),
  );
  assert.deepEqual(findings, []);
});
