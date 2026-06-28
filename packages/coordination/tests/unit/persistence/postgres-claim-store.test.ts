/**
 * PostgresClaimStore unit suite — drives the durable claim store against the
 * FakePgPool (a real, if minimal, SQL engine we own), so the exactly-once CAS,
 * idempotency, recovery-window protection, fence-checked renew, release, and the
 * coherence `listClaims` read are exercised for real — not mocked.
 *
 * This is the durable, cross-process counterpart of MemoryClaimStore's CAS, and
 * the store-level proof of the design's "claim no-double-assign" invariant.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresClaimStore } from '../../../src/persistence/postgres/postgres-claim-store';
import { FakePgPool } from './fake-pg-pool';
import { makeClaim } from '../../fixtures/dispatch';

const RECOVERY_MS = 90_000;
const FIXED_NOW = '2026-06-27T00:00:00.000Z';

function makeStore(now = FIXED_NOW): { pool: FakePgPool; store: PostgresClaimStore } {
  const pool = new FakePgPool();
  const store = new PostgresClaimStore(pool, {
    recoveryWindowMs: RECOVERY_MS,
    now: () => now,
  });
  return { pool, store };
}

test('compareAndSet commits the first claim and returns it', async () => {
  const { pool, store } = makeStore();
  const result = await store.compareAndSet(makeClaim());
  assert.ok(result, 'first claim should win');
  assert.equal(result?.claimId, 'claim-1');
  assert.equal(result?.taskId, 'task-1');
  assert.equal(pool.claimCount(), 1);
});

test('two agents claiming the same task — exactly one winner, no double-assign', async () => {
  const { pool, store } = makeStore();

  const first = await store.compareAndSet(
    makeClaim({ claimId: 'claim-A', agentId: 'agent-a', idempotencyKey: 'idem-A' }),
  );
  const second = await store.compareAndSet(
    makeClaim({ claimId: 'claim-B', agentId: 'agent-b', idempotencyKey: 'idem-B' }),
  );

  assert.ok(first, 'agent-a wins the task');
  assert.equal(first?.agentId, 'agent-a');
  assert.equal(second, undefined, 'agent-b is the loser — no second claim');

  // Exactly one row, and it belongs to the winner.
  assert.equal(pool.claimCount(), 1);
  const live = await store.getByTask('task-1');
  assert.equal(live?.agentId, 'agent-a');
  assert.equal(live?.claimId, 'claim-A');
});

test('a retry with the same idempotency key returns the existing claim, never a second', async () => {
  const { pool, store } = makeStore();

  const first = await store.compareAndSet(makeClaim({ idempotencyKey: 'idem-X' }));
  const retry = await store.compareAndSet(
    // Same idempotency key, different claimId (a retry of the same logical dispatch).
    makeClaim({ claimId: 'claim-retry', idempotencyKey: 'idem-X' }),
  );

  assert.ok(first);
  assert.ok(retry, 'idempotent retry returns the stored claim');
  assert.equal(retry?.claimId, 'claim-1', 'returns the originally committed claim');
  assert.equal(pool.claimCount(), 1, 'no second claim row');
});

test('a released claim no longer blocks a new claim on the same task', async () => {
  const { store } = makeStore();

  const first = await store.compareAndSet(makeClaim({ claimId: 'claim-old' }));
  assert.ok(first);
  await store.release('claim-old');

  const second = await store.compareAndSet(
    makeClaim({ claimId: 'claim-new', agentId: 'agent-b', idempotencyKey: 'idem-new' }),
  );
  assert.ok(second, 'after release the task is reclaimable');
  assert.equal(second?.claimId, 'claim-new');
  assert.equal(second?.agentId, 'agent-b');
});

test('an expired lease past the recovery window is reclaimable; inside the window it is not', async () => {
  // The first claim was taken long ago: lease expired AND past the recovery window.
  const past = makeClaim({
    claimId: 'claim-stale',
    claimedAt: '2026-06-26T00:00:00.000Z',
    leaseUntil: '2026-06-26T00:30:00.000Z',
    idempotencyKey: 'idem-stale',
  });

  // now = a full day later → outside the 90s recovery window, lease long expired.
  const { store } = makeStore('2026-06-27T00:00:00.000Z');
  await store.compareAndSet(past);
  const reclaimed = await store.compareAndSet(
    makeClaim({ claimId: 'claim-fresh', agentId: 'agent-b', idempotencyKey: 'idem-fresh' }),
  );
  assert.ok(reclaimed, 'a long-dead claim is reclaimable');
  assert.equal(reclaimed?.claimId, 'claim-fresh');

  // A claim still inside its recovery window blocks even with an expired lease.
  const { store: store2 } = makeStore('2026-06-27T00:00:30.000Z'); // 30s after claim
  await store2.compareAndSet(
    makeClaim({
      claimId: 'claim-inflight',
      claimedAt: '2026-06-27T00:00:00.000Z',
      leaseUntil: '2026-06-27T00:00:05.000Z', // lease already expired at now
      idempotencyKey: 'idem-inflight',
    }),
  );
  const blocked = await store2.compareAndSet(
    makeClaim({ claimId: 'claim-late', agentId: 'agent-b', idempotencyKey: 'idem-late' }),
  );
  assert.equal(blocked, undefined, 'inside the recovery window the claim still blocks');
});

test('renew extends the lease only for the holder of the current fence token', async () => {
  const { store } = makeStore();
  await store.compareAndSet(makeClaim({ claimId: 'claim-1', fenceToken: 7 }));

  const renewed = await store.renew('claim-1', 7, '2026-06-27T01:00:00.000Z');
  assert.ok(renewed, 'holder of the current fence renews');
  assert.equal(renewed?.leaseUntil, '2026-06-27T01:00:00.000Z');

  const stale = await store.renew('claim-1', 6, '2026-06-27T02:00:00.000Z');
  assert.equal(stale, undefined, 'a stale fence token cannot renew');
});

test('getByTask returns undefined when no claim exists, then the live claim', async () => {
  const { store } = makeStore();
  assert.equal(await store.getByTask('task-1'), undefined);
  await store.compareAndSet(makeClaim());
  const live = await store.getByTask('task-1');
  assert.equal(live?.claimId, 'claim-1');
});

test('listClaims returns all claims, and filters by space when scoped', async () => {
  const { store } = makeStore();
  await store.compareAndSet(
    makeClaim({ claimId: 'c-1', taskId: 't-1', spaceId: 'space-1', idempotencyKey: 'i-1' }),
  );
  await store.compareAndSet(
    makeClaim({ claimId: 'c-2', taskId: 't-2', spaceId: 'space-2', idempotencyKey: 'i-2' }),
  );

  const all = await store.listClaims();
  assert.equal(all.length, 2);

  const scoped = await store.listClaims(['space-1']);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0]?.spaceId, 'space-1');
});

test('release is idempotent for a missing claim id', async () => {
  const { pool, store } = makeStore();
  await store.release('does-not-exist'); // must not throw
  assert.equal(pool.claimCount(), 0);
});
