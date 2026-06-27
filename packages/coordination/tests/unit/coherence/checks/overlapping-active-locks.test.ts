import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOverlappingActiveLocks } from '../../../../src/coherence/checks/overlapping-active-locks';
import { lock, minutesAgo, minutesFromNow, snapshot } from '../fixtures';

test('flags two overlapping active exclusive locks as a CRITICAL breach', () => {
  const findings = checkOverlappingActiveLocks(
    snapshot({
      locks: [
        lock({ lockId: 'lock_a', pathGlob: 'src/**', acquiredAt: minutesAgo(10) }),
        lock({ lockId: 'lock_b', pathGlob: 'src/app/**', acquiredAt: minutesAgo(5) }),
      ],
    }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'overlapping_active_locks');
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[0].disposition, 'escalate');
  // The younger lock (lock_b, acquired more recently) is named as the loser.
  assert.equal(findings[0].lockId, 'lock_b');
});

test('two shared locks never conflict', () => {
  const findings = checkOverlappingActiveLocks(
    snapshot({
      locks: [
        lock({ lockId: 'lock_a', kind: 'shared' }),
        lock({ lockId: 'lock_b', kind: 'shared' }),
      ],
    }),
  );
  assert.deepEqual(findings, []);
});

test('non-overlapping paths in the same scope do not conflict', () => {
  const findings = checkOverlappingActiveLocks(
    snapshot({
      locks: [
        lock({ lockId: 'lock_a', pathGlob: 'src/**' }),
        lock({ lockId: 'lock_b', pathGlob: 'docs/**' }),
      ],
    }),
  );
  assert.deepEqual(findings, []);
});

test('overlap across different spaces is not a breach', () => {
  const findings = checkOverlappingActiveLocks(
    snapshot({
      locks: [
        lock({ lockId: 'lock_a', spaceId: 'space_1', pathGlob: 'src/**' }),
        lock({ lockId: 'lock_b', spaceId: 'space_2', pathGlob: 'src/**' }),
      ],
    }),
  );
  assert.deepEqual(findings, []);
});

test('an expired lock is not an active overlap', () => {
  const findings = checkOverlappingActiveLocks(
    snapshot({
      locks: [
        lock({ lockId: 'lock_a', pathGlob: 'src/**', expiresAt: minutesFromNow(20) }),
        lock({ lockId: 'lock_b', pathGlob: 'src/**', expiresAt: minutesAgo(1) }),
      ],
    }),
  );
  assert.deepEqual(findings, []);
});
