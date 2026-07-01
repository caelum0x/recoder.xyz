import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCoherenceEffect,
  applyCoherenceEffects,
  type CoherenceEffectPorts,
} from '../../../src/coherence/coherence-effects';
import type { Effect, WorkSignal } from '../../../src/domain';

/**
 * Minimal ports that record which heals ran and can be told to make a specific
 * op throw, so we can prove the batch keeps healing past a transient failure.
 */
function fakePorts(opts: { failDeleteLockId?: string } = {}) {
  const deleted: string[] = [];
  const offlined: string[] = [];
  const emitted: string[] = [];

  const clock = { now: () => 0, iso: () => '2026-06-27T12:00:00.000Z' };

  const ports: CoherenceEffectPorts = {
    lockStore: {
      async list() {
        return [];
      },
      async put(l) {
        return l;
      },
      async delete(lockId: string) {
        if (lockId === opts.failDeleteLockId) {
          throw new Error(`boom releasing ${lockId}`);
        }
        deleted.push(lockId);
      },
      async get() {
        return undefined;
      },
    },
    presenceStore: {
      async get() {
        return undefined;
      },
      async list() {
        return [];
      },
      async heartbeat() {},
      async setStatus(agentId: string) {
        offlined.push(agentId);
      },
    },
    signalSink: {
      async emit(signal: WorkSignal) {
        emitted.push(signal.signalId);
      },
      async listOpen() {
        return [];
      },
      async resolve() {},
    },
    eventBus: {
      async publish() {},
      subscribe() {
        return () => {};
      },
    },
    clock,
  };

  return { ports, captured: { deleted, offlined, emitted } };
}

function releaseLock(lockId: string): Effect {
  return { type: 'ReleaseLock', lockId };
}

function markOffline(agentId: string): Effect {
  return { type: 'MarkPresenceOffline', agentId };
}

test('applyCoherenceEffects applies every effect and reports no failures on the happy path', async () => {
  const { ports, captured } = fakePorts();

  const outcome = await applyCoherenceEffects(
    [releaseLock('lock_a'), markOffline('agent_x'), releaseLock('lock_b')],
    ports,
  );

  assert.equal(outcome.applied, 3);
  assert.deepEqual(outcome.failures, []);
  assert.deepEqual(captured.deleted, ['lock_a', 'lock_b']);
  assert.deepEqual(captured.offlined, ['agent_x']);
});

test('applyCoherenceEffects keeps healing past a transient failure and reports it', async () => {
  const { ports, captured } = fakePorts({ failDeleteLockId: 'lock_b' });

  const effects = [
    releaseLock('lock_a'), // ok
    releaseLock('lock_b'), // throws
    markOffline('agent_x'), // must still run
    releaseLock('lock_c'), // must still run
  ];

  const outcome = await applyCoherenceEffects(effects, ports);

  // Every independent heal past the failure was still attempted.
  assert.deepEqual(captured.deleted, ['lock_a', 'lock_c']);
  assert.deepEqual(captured.offlined, ['agent_x']);

  // The failure is reported truthfully, not swallowed.
  assert.equal(outcome.applied, 3);
  assert.equal(outcome.failures.length, 1);
  assert.equal(outcome.failures[0]?.effect.type, 'ReleaseLock');
  assert.ok(outcome.failures[0]?.error instanceof Error);
});

test('applyCoherenceEffect (single) still propagates so the engine transaction path is unchanged', async () => {
  const { ports } = fakePorts({ failDeleteLockId: 'lock_z' });
  await assert.rejects(
    () => applyCoherenceEffect(releaseLock('lock_z'), ports),
    /boom releasing lock_z/,
  );
});
