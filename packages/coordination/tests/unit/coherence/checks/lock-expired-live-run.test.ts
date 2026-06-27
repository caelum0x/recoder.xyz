import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkLockExpiredLiveRun } from '../../../../src/coherence/checks/lock-expired-live-run';
import { lock, minutesAgo, run, snapshot } from '../fixtures';

test('escalates an expired lock while a live run still writes', () => {
  const findings = checkLockExpiredLiveRun(
    snapshot({ locks: [lock({ expiresAt: minutesAgo(5) })], runs: [run({ alive: true })] }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'lock_expired_live_run');
  assert.equal(findings[0].disposition, 'escalate');
  assert.equal(findings[0].severity, 'high');
});

test('does not escalate when the lock is still active', () => {
  const findings = checkLockExpiredLiveRun(
    snapshot({ locks: [lock()], runs: [run({ alive: true })] }),
  );
  assert.deepEqual(findings, []);
});

test('does not escalate an expired lock with no live run', () => {
  const findings = checkLockExpiredLiveRun(
    snapshot({ locks: [lock({ expiresAt: minutesAgo(5) })], runs: [run({ alive: false })] }),
  );
  assert.deepEqual(findings, []);
});
