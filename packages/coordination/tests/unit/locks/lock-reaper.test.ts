import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reapExpiredLocks } from '../../../src/locks/lock-reaper';
import type { Effect, EmitSignalEffect } from '../../../src/domain';
import { T0, at, makeLock } from './_fixtures';

const idFns = {
  eventIdFor: (lockId: string) => `evt_${lockId}`,
  signalIdFor: (lockId: string) => `sig_${lockId}`,
};

function effectTypes(effects: Effect[]): string[] {
  return effects.map((effect) => effect.type);
}

test('an expired lock with no live run yields release + expired event only', () => {
  const expired = makeLock({ lockId: 'l1', taskId: 'task-1', expiresAt: at(-1) });
  const result = reapExpiredLocks({
    locks: [expired],
    now: T0,
    liveRunTaskIds: new Set(),
    ...idFns,
  });

  assert.deepEqual(result.reaped.map((l) => l.lockId), ['l1']);
  assert.deepEqual(effectTypes(result.effects), ['ReleaseLock', 'PublishEvent']);
});

test('an active lock is not reaped', () => {
  const live = makeLock({ lockId: 'l1', expiresAt: at(60_000) });
  const result = reapExpiredLocks({
    locks: [live],
    now: T0,
    liveRunTaskIds: new Set(['task-1']),
    ...idFns,
  });
  assert.equal(result.reaped.length, 0);
  assert.equal(result.effects.length, 0);
});

test('an expired lock whose task still has a live run also emits a run_stale signal', () => {
  const expired = makeLock({ lockId: 'l1', taskId: 'task-1', pathGlob: 'src/**', expiresAt: at(-1) });
  const result = reapExpiredLocks({
    locks: [expired],
    now: T0,
    liveRunTaskIds: new Set(['task-1']),
    ...idFns,
  });

  assert.deepEqual(effectTypes(result.effects), ['ReleaseLock', 'PublishEvent', 'EmitSignal']);

  const signalEffect = result.effects.find((e): e is EmitSignalEffect => e.type === 'EmitSignal');
  assert.ok(signalEffect);
  assert.equal(signalEffect.signal.detectedReason, 'run_stale');
  assert.equal(signalEffect.signal.source, 'work_lock');
  assert.equal(signalEffect.signal.severity, 'high');
  assert.equal(signalEffect.signal.status, 'open');
  assert.equal(signalEffect.signal.taskId, 'task-1');
  assert.equal(signalEffect.signal.signalId, 'sig_l1');
});

test('the expired event carries the injected event id and lock.expired type', () => {
  const expired = makeLock({ lockId: 'l1', expiresAt: at(-1) });
  const result = reapExpiredLocks({
    locks: [expired],
    now: T0,
    liveRunTaskIds: new Set(),
    ...idFns,
  });
  const publish = result.effects.find((e) => e.type === 'PublishEvent');
  assert.ok(publish && publish.type === 'PublishEvent');
  assert.equal(publish.event.type, 'lock.expired');
  assert.equal(publish.event.eventId, 'evt_l1');
});
