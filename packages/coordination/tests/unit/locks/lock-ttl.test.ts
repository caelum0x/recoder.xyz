import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeLocks,
  computeExpiry,
  expiredLocks,
  isLockActive,
  isLockExpired,
  isRenewable,
  lockRemainingMs,
} from '../../../src/locks/lock-ttl';
import { T0, at, makeLock } from './_fixtures';

test('computeExpiry adds the ttl to now', () => {
  assert.equal(computeExpiry(T0, 60_000), at(60_000));
});

test('computeExpiry defaults to the 30-minute lock TTL', () => {
  assert.equal(computeExpiry(T0), at(30 * 60_000));
});

test('isLockActive / isLockExpired flip at expiry', () => {
  const lock = makeLock({ expiresAt: at(60_000) });
  assert.ok(isLockActive(lock, at(59_000)));
  assert.equal(isLockExpired(lock, at(59_000)), false);
  assert.ok(isLockExpired(lock, at(60_000)));
  assert.equal(isLockActive(lock, at(60_000)), false);
});

test('lockRemainingMs is negative once expired', () => {
  const lock = makeLock({ expiresAt: at(10_000) });
  assert.equal(lockRemainingMs(lock, T0), 10_000);
  assert.equal(lockRemainingMs(lock, at(15_000)), -5_000);
});

test('isRenewable only inside the renew window, only while active', () => {
  const lock = makeLock({ expiresAt: at(10 * 60_000) });
  // 9.5m elapsed → 30s left, inside the default 5m window
  assert.ok(isRenewable(lock, at((10 * 60 - 30) * 1000)));
  // 1m elapsed → 9m left, outside the window
  assert.equal(isRenewable(lock, at(60_000)), false);
  // already expired → not renewable
  assert.equal(isRenewable(lock, at(11 * 60_000)), false);
});

test('activeLocks / expiredLocks partition the set', () => {
  const locks = [
    makeLock({ lockId: 'live', expiresAt: at(60_000) }),
    makeLock({ lockId: 'dead', expiresAt: at(-1) }),
  ];
  assert.deepEqual(activeLocks(locks, T0).map((l) => l.lockId), ['live']);
  assert.deepEqual(expiredLocks(locks, T0).map((l) => l.lockId), ['dead']);
});
