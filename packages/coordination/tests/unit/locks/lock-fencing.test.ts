import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertFenceToken,
  fenceScopeKey,
  highestFenceToken,
  isFenceTokenCurrent,
  isFenceTokenStale,
  lockFenceScopeKey,
} from '../../../src/locks/lock-fencing';
import { FenceTokenViolationError } from '../../../src/errors';
import { makeLock } from './_fixtures';

test('a token >= the lock token is current; a lower one is stale', () => {
  const lock = makeLock({ fenceToken: 5 });
  assert.ok(isFenceTokenCurrent(lock, 5));
  assert.ok(isFenceTokenCurrent(lock, 6));
  assert.ok(isFenceTokenStale(lock, 4));
  assert.equal(isFenceTokenStale(lock, 5), false);
});

test('assertFenceToken throws on a stale token', () => {
  const lock = makeLock({ fenceToken: 10 });
  assert.throws(() => assertFenceToken(lock, 9), (error: unknown) => {
    assert.ok(error instanceof FenceTokenViolationError);
    assert.equal(error.presentedToken, 9);
    assert.equal(error.currentToken, 10);
    return true;
  });
});

test('assertFenceToken passes a current token', () => {
  const lock = makeLock({ fenceToken: 10 });
  assert.doesNotThrow(() => assertFenceToken(lock, 10));
});

test('scope key is stable for the same (space, repo, glob)', () => {
  assert.equal(fenceScopeKey('s', 'r', 'src/**'), fenceScopeKey('s', 'r', 'src/**'));
  assert.notEqual(fenceScopeKey('s', 'r', 'src/**'), fenceScopeKey('s', 'r', 'docs/**'));
});

test('lockFenceScopeKey derives the same key from a lock', () => {
  const lock = makeLock({ spaceId: 's', repo: 'r', pathGlob: 'src/**' });
  assert.equal(lockFenceScopeKey(lock), fenceScopeKey('s', 'r', 'src/**'));
});

test('highestFenceToken returns the max across locks, 0 for empty', () => {
  assert.equal(highestFenceToken([]), 0);
  assert.equal(
    highestFenceToken([makeLock({ fenceToken: 3 }), makeLock({ fenceToken: 8 }), makeLock({ fenceToken: 1 })]),
    8,
  );
});
