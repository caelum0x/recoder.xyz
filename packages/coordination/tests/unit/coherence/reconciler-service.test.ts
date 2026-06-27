import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Reconciler } from '../../../src/coherence/reconciler-service';
import { DEFAULT_COORDINATION_CONFIG } from '../../../src/config/coordination-config';
import type {
  AgentPresence,
  CoordinationEvent,
  PresenceStatus,
  TaskClaim,
  WorkLock,
  WorkSignal,
} from '../../../src/domain';
import { lock, task } from './fixtures';

/** A tiny in-memory set of the ports the Reconciler needs, capturing writes. */
function fakePorts() {
  const deleted: string[] = [];
  const offlined: string[] = [];
  const emitted: WorkSignal[] = [];
  const published: CoordinationEvent[] = [];

  const locks: WorkLock[] = [lock({ lockId: 'lock_term', taskId: 'task_done' })];
  const claims: TaskClaim[] = [];
  const presence: AgentPresence[] = [];

  const clock = { now: () => Date.parse('2026-06-27T12:00:00.000Z'), iso: () => '2026-06-27T12:00:00.000Z' };

  const lockStore = {
    async list() {
      return locks;
    },
    async put(l: WorkLock) {
      return l;
    },
    async delete(lockId: string) {
      deleted.push(lockId);
    },
    async get() {
      return undefined;
    },
  };

  const claimStore = {
    async listClaims() {
      return claims;
    },
  };

  const dependencyStore = {
    async dependenciesOf() {
      return [];
    },
    async taskStates() {
      return [];
    },
    async candidateTasks() {
      return [task({ taskId: 'task_done', state: 'done' as const })];
    },
  };

  const presenceStore = {
    async get() {
      return undefined;
    },
    async list() {
      return presence;
    },
    async heartbeat() {},
    async setStatus(agentId: string, status: PresenceStatus) {
      if (status === 'offline') offlined.push(agentId);
    },
  };

  const signalSink = {
    async emit(signal: WorkSignal) {
      emitted.push(signal);
    },
    async listOpen() {
      return [] as WorkSignal[];
    },
    async resolve() {},
  };

  const eventBus = {
    async publish(event: CoordinationEvent) {
      published.push(event);
    },
    subscribe() {
      return () => {};
    },
  };

  let idN = 0;
  const ids = {
    lockId: () => 'l' as never,
    claimId: () => 'c' as never,
    handoffId: () => 'h' as never,
    eventId: () => 'e' as never,
    signalId: () => `sig_${idN++}` as never,
  };

  return {
    captured: { deleted, offlined, emitted, published },
    clock,
    lockStore,
    claimStore,
    dependencyStore,
    presenceStore,
    signalSink,
    eventBus,
    ids,
  };
}

test('Reconciler.tick loads a snapshot, reconciles, and applies heal effects', async () => {
  const p = fakePorts();
  const reconciler = new Reconciler({
    loader: {
      clock: p.clock,
      lockStore: p.lockStore,
      claimStore: p.claimStore,
      dependencyStore: p.dependencyStore,
      presenceStore: p.presenceStore,
      signalSink: p.signalSink,
      config: DEFAULT_COORDINATION_CONFIG,
    },
    effects: {
      lockStore: p.lockStore,
      presenceStore: p.presenceStore,
      signalSink: p.signalSink,
      eventBus: p.eventBus,
      clock: p.clock,
    },
    ids: p.ids,
    config: DEFAULT_COORDINATION_CONFIG,
    spaceIds: () => ['space_1'],
  });

  const result = await reconciler.tick();

  // The lock on a terminal task was auto-released through the port.
  assert.deepEqual(p.captured.deleted, ['lock_term']);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].driftKind, 'lock_without_task');
});
