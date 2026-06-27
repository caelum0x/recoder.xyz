import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findCoveringLock, hasCoveringLock } from '../../../src/locks/lock-coverage';
import { T0, at, makeLock } from './_fixtures';

const base = {
  spaceId: 'space-1',
  ownerAgentId: 'agent-a',
  taskId: 'task-1',
  now: T0,
};

test('an active owning lock covers a matching path', () => {
  const locks = [makeLock({ lockId: 'l1', pathGlob: 'src/**', ownerAgentId: 'agent-a', taskId: 'task-1' })];
  const lock = findCoveringLock(locks, { ...base, path: 'src/app/page.tsx' });
  assert.equal(lock?.lockId, 'l1');
});

test('no coverage when the path is outside the glob', () => {
  const locks = [makeLock({ pathGlob: 'src/**' })];
  assert.equal(hasCoveringLock(locks, { ...base, path: 'docs/readme.md' }), false);
});

test('no coverage from another owner', () => {
  const locks = [makeLock({ pathGlob: 'src/**', ownerAgentId: 'agent-b', taskId: 'task-9' })];
  assert.equal(hasCoveringLock(locks, { ...base, path: 'src/x.ts' }), false);
});

test('an expired lock does not cover', () => {
  const locks = [makeLock({ pathGlob: 'src/**', expiresAt: at(-1) })];
  assert.equal(hasCoveringLock(locks, { ...base, path: 'src/x.ts' }), false);
});

test('a current fence token is accepted; a stale one is not', () => {
  const locks = [makeLock({ pathGlob: 'src/**', fenceToken: 5 })];
  assert.ok(hasCoveringLock(locks, { ...base, path: 'src/x.ts', fenceToken: 5 }));
  assert.equal(hasCoveringLock(locks, { ...base, path: 'src/x.ts', fenceToken: 4 }), false);
});
