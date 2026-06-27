import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LockService } from '../../../src/locks/lock-service';
import { LockConflictError } from '../../../src/errors';
import { FenceTokenViolationError } from '../../../src/errors';
import { T0, at, makeLock } from './_fixtures';

const service = new LockService();

test('acquire returns a new lock + appended active set, without mutating input', () => {
  const existing = [makeLock({ lockId: 'l1', pathGlob: 'docs/**' })];
  const before = [...existing];

  const { lock, locks } = service.acquire({
    existingLocks: existing,
    lockId: 'l2',
    fenceToken: 7,
    spaceId: 'space-1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
    now: T0,
  });

  assert.equal(lock.lockId, 'l2');
  assert.equal(lock.fenceToken, 7);
  assert.equal(lock.kind, 'exclusive');
  assert.equal(lock.acquiredAt, T0);
  assert.equal(locks.length, 2);
  // input untouched (immutability)
  assert.deepEqual(existing, before);
});

test('acquire throws LockConflictError carrying the conflicting lock', () => {
  const existing = [makeLock({ lockId: 'held', pathGlob: 'src/**', ownerAgentId: 'agent-a', taskId: 'task-1' })];

  assert.throws(
    () =>
      service.acquire({
        existingLocks: existing,
        lockId: 'new',
        fenceToken: 2,
        spaceId: 'space-1',
        pathGlob: 'src/app/**',
        ownerAgentId: 'agent-b',
        taskId: 'task-2',
        now: T0,
      }),
    (error: unknown) => {
      assert.ok(error instanceof LockConflictError);
      assert.equal(error.conflicts.length, 1);
      assert.equal(error.conflicts[0]?.lockId, 'held');
      return true;
    },
  );
});

test('acquire ignores expired locks when checking conflicts', () => {
  const expired = makeLock({ lockId: 'old', pathGlob: 'src/**', expiresAt: at(-1) });

  const { lock } = service.acquire({
    existingLocks: [expired],
    lockId: 'fresh',
    fenceToken: 1,
    spaceId: 'space-1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
    now: T0,
  });

  assert.equal(lock.lockId, 'fresh');
});

test('the same (agent, task) never conflicts with itself', () => {
  const held = makeLock({ ownerAgentId: 'agent-a', taskId: 'task-1', pathGlob: 'src/**' });

  const { lock } = service.acquire({
    existingLocks: [held],
    lockId: 'reacq',
    fenceToken: 2,
    spaceId: 'space-1',
    pathGlob: 'src/**',
    ownerAgentId: 'agent-a',
    taskId: 'task-1',
    now: T0,
  });

  assert.equal(lock.lockId, 'reacq');
});

test('release removes a matching lock, scoped by owner + task', () => {
  const locks = [makeLock({ lockId: 'l1', ownerAgentId: 'agent-a', taskId: 'task-1' })];
  const after = service.release(locks, { lockId: 'l1', ownerAgentId: 'agent-a', taskId: 'task-1' });
  assert.equal(after.length, 0);
});

test('release does not remove a lock owned by a different agent', () => {
  const locks = [makeLock({ lockId: 'l1', ownerAgentId: 'agent-a' })];
  const after = service.release(locks, { lockId: 'l1', ownerAgentId: 'agent-b' });
  assert.equal(after.length, 1);
});

test('release with a stale fence token throws FenceTokenViolationError', () => {
  const locks = [makeLock({ lockId: 'l1', fenceToken: 5 })];
  assert.throws(
    () => service.release(locks, { lockId: 'l1', fenceToken: 4 }),
    FenceTokenViolationError,
  );
});

test('renew extends an active lock and keeps its fence token', () => {
  const locks = [makeLock({ lockId: 'l1', fenceToken: 9, expiresAt: at(60_000) })];
  const { lock } = service.renew(locks, {
    lockId: 'l1',
    ownerAgentId: 'agent-a',
    taskId: 'task-1',
    fenceToken: 9,
    now: at(10_000),
    ttlMs: 60_000,
  });
  assert.equal(lock.fenceToken, 9);
  assert.equal(lock.acquiredAt, at(10_000));
  assert.equal(lock.expiresAt, at(70_000));
});

test('renew of an expired lock is rejected (re-acquire required)', () => {
  const locks = [makeLock({ lockId: 'l1', expiresAt: at(-1) })];
  assert.throws(
    () =>
      service.renew(locks, {
        lockId: 'l1',
        ownerAgentId: 'agent-a',
        taskId: 'task-1',
        fenceToken: 1,
        now: T0,
      }),
    LockConflictError,
  );
});

test('listActive filters expired locks', () => {
  const locks = [
    makeLock({ lockId: 'live', expiresAt: at(60_000) }),
    makeLock({ lockId: 'dead', expiresAt: at(-60_000) }),
  ];
  const active = service.listActive(locks, T0);
  assert.deepEqual(active.map((l) => l.lockId), ['live']);
});
