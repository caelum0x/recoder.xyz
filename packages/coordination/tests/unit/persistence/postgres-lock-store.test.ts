/**
 * PostgresLockStore unit suite — drives the durable lock store against the
 * FakePgPool (a real, if minimal, SQL engine we own). It exercises the durable
 * CAS for real: the put upsert + scope MAX(fence_token) read, the stale-fence
 * rejection, list/get/delete, and the empty-string repo sentinel — the same
 * behaviour the memory adapter provides, proven against the Postgres SQL path.
 *
 * The FakePgPool helper shipped with the package but had no test exercising the
 * Postgres lock path; this suite closes that gap so the helper backs real
 * assertions rather than sitting unused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresLockStore } from '../../../src/persistence/postgres/postgres-lock-store';
import { FenceTokenViolationError } from '../../../src/errors';
import { FakePgPool } from './fake-pg-pool';
import { makeLock } from '../locks/_fixtures';

function makeStore(): { pool: FakePgPool; store: PostgresLockStore } {
  const pool = new FakePgPool();
  return { pool, store: new PostgresLockStore(pool) };
}

test('put persists a lock and get reads it back', async () => {
  const { pool, store } = makeStore();
  const lock = makeLock({ lockId: 'lock-1', fenceToken: 1 });
  const stored = await store.put(lock);
  assert.equal(stored.lockId, 'lock-1');
  assert.equal(pool.lockCount(), 1);

  const fetched = await store.get('lock-1');
  assert.equal(fetched?.lockId, 'lock-1');
  assert.equal(fetched?.fenceToken, 1);
});

test('put rejects a stale fence token (CAS) and never double-grants the scope', async () => {
  const { pool, store } = makeStore();
  // A newer writer has already recorded fence token 5 for this scope.
  await store.put(makeLock({ lockId: 'lock-new', fenceToken: 5 }));

  // A slow writer resuming with fence token 3 must be rejected.
  await assert.rejects(
    () => store.put(makeLock({ lockId: 'lock-stale', fenceToken: 3 })),
    (err: unknown) => err instanceof FenceTokenViolationError,
  );
  assert.equal(pool.lockCount(), 1, 'the stale write left no row behind');
});

test('a fence token equal to the high-water mark is accepted (re-put of the holder)', async () => {
  const { store } = makeStore();
  await store.put(makeLock({ lockId: 'lock-1', fenceToken: 4 }));
  // Same id, same fence token >= high-water — an idempotent re-put updates in place.
  const again = await store.put(
    makeLock({ lockId: 'lock-1', fenceToken: 4, taskId: 'task-2' }),
  );
  assert.equal(again.taskId, 'task-2');
});

test('the empty-repo sentinel round-trips as undefined', async () => {
  const { store } = makeStore();
  await store.put(makeLock({ lockId: 'lock-norepo', repo: undefined }));
  const fetched = await store.get('lock-norepo');
  assert.ok(fetched);
  assert.equal(fetched?.repo, undefined, 'no repo comes back undefined, not ""');
});

test('list filters by space (and repo) scope', async () => {
  const { store } = makeStore();
  await store.put(makeLock({ lockId: 'l-a', spaceId: 'space-1', repo: 'repo-1' }));
  await store.put(makeLock({ lockId: 'l-b', spaceId: 'space-2', repo: 'repo-2', pathGlob: 'lib/**' }));

  const inSpace1 = await store.list({ spaceId: 'space-1' });
  assert.equal(inSpace1.length, 1);
  assert.equal(inSpace1[0]?.lockId, 'l-a');

  const byRepo = await store.list({ spaceId: 'space-1', repo: 'repo-1' });
  assert.equal(byRepo.length, 1);
  assert.equal(byRepo[0]?.repo, 'repo-1');
});

test('delete removes a lock and is owner/task scoped', async () => {
  const { pool, store } = makeStore();
  await store.put(makeLock({ lockId: 'lock-1', ownerAgentId: 'agent-a', taskId: 'task-1' }));

  // A delete scoped to a different owner removes nothing.
  await store.delete('lock-1', { ownerAgentId: 'agent-other' });
  assert.equal(pool.lockCount(), 1);

  // The matching owner/task delete removes it.
  await store.delete('lock-1', { ownerAgentId: 'agent-a', taskId: 'task-1' });
  assert.equal(pool.lockCount(), 0);
  assert.equal(await store.get('lock-1'), undefined);
});
