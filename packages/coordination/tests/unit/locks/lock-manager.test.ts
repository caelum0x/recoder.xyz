import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LockManager } from '../../../src/locks/lock-manager';
import type {
  ClockPort,
  IdGeneratorPort,
  LeaseFencerPort,
  LockScope,
  LockStorePort,
} from '../../../src/ports';
import type { WorkLock } from '../../../src/domain';
import { CoordinationErrorCode } from '../../../src/errors';
import { T0 } from './_fixtures';

/** Minimal in-memory LockStorePort for the manager shell tests. */
function memoryStore(): LockStorePort {
  const locks = new Map<string, WorkLock>();
  return {
    async list(scope: LockScope) {
      return [...locks.values()].filter(
        (lock) => lock.spaceId === scope.spaceId && (lock.repo ?? '') === (scope.repo ?? ''),
      );
    },
    async put(lock) {
      locks.set(lock.lockId, lock);
      return lock;
    },
    async delete(lockId) {
      locks.delete(lockId);
    },
    async get(lockId) {
      return locks.get(lockId);
    },
  };
}

function monotonicFencer(): LeaseFencerPort {
  const tokens = new Map<string, number>();
  return {
    async issue(scopeKey: string) {
      const next = (tokens.get(scopeKey) ?? 0) + 1;
      tokens.set(scopeKey, next);
      return next;
    },
    async verify(scopeKey: string, token: number) {
      return token >= (tokens.get(scopeKey) ?? 0);
    },
  };
}

function seqIds(): IdGeneratorPort {
  let n = 0;
  const next = (p: string) => `${p}_${(n += 1)}`;
  return {
    lockId: () => next('lock') as never,
    claimId: () => next('claim') as never,
    handoffId: () => next('handoff') as never,
    eventId: () => next('evt') as never,
    signalId: () => next('sig') as never,
  };
}

const fixedClock: ClockPort = { now: () => Date.parse(T0), iso: () => T0 };

function makeManager() {
  return new LockManager({
    store: memoryStore(),
    fencer: monotonicFencer(),
    ids: seqIds(),
    clock: fixedClock,
  });
}

const acquireReq = {
  spaceId: 'space-1',
  pathGlob: 'src/**',
  ownerAgentId: 'agent-a',
  taskId: 'task-1',
};

test('acquire returns ok with a persisted lock and an issued fence token', async () => {
  const manager = makeManager();
  const result = await manager.acquire(acquireReq);
  assert.ok(result.ok);
  assert.equal(result.value.pathGlob, 'src/**');
  assert.equal(result.value.fenceToken, 1);
  assert.equal(result.value.acquiredAt, T0);
});

test('a conflicting acquire returns err(LOCK_CONFLICT), never throws', async () => {
  const manager = makeManager();
  const first = await manager.acquire(acquireReq);
  assert.ok(first.ok);

  const second = await manager.acquire({
    ...acquireReq,
    pathGlob: 'src/app/**',
    ownerAgentId: 'agent-b',
    taskId: 'task-2',
  });
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.error.code, CoordinationErrorCode.LOCK_CONFLICT);
  }
});

test('listActive returns only active locks for the scope', async () => {
  const manager = makeManager();
  await manager.acquire(acquireReq);
  const active = await manager.listActive({ spaceId: 'space-1' });
  assert.equal(active.length, 1);
});

test('release removes the lock and is idempotent for a missing id', async () => {
  const manager = makeManager();
  const acquired = await manager.acquire(acquireReq);
  assert.ok(acquired.ok);

  const released = await manager.release({ lockId: acquired.value.lockId });
  assert.ok(released.ok);
  assert.equal((await manager.listActive({ spaceId: 'space-1' })).length, 0);

  const again = await manager.release({ lockId: 'does-not-exist' });
  assert.ok(again.ok);
});

test('release with a stale fence token returns err(FENCE_VIOLATION)', async () => {
  const manager = makeManager();
  const acquired = await manager.acquire(acquireReq);
  assert.ok(acquired.ok);

  const result = await manager.release({
    lockId: acquired.value.lockId,
    fenceToken: acquired.value.fenceToken - 1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, CoordinationErrorCode.FENCE_VIOLATION);
  }
});

test('renew extends an active lock through the manager', async () => {
  const manager = makeManager();
  const acquired = await manager.acquire(acquireReq);
  assert.ok(acquired.ok);

  const renewed = await manager.renew({
    lockId: acquired.value.lockId,
    ownerAgentId: 'agent-a',
    taskId: 'task-1',
    fenceToken: acquired.value.fenceToken,
  });
  assert.ok(renewed.ok);
  assert.equal(renewed.value.fenceToken, acquired.value.fenceToken);
});
