/**
 * `multi-dispatch` — proves the multi-peer RESPONSE STRATEGIES (`all | first |
 * quorum`) over a real task-store projection + real task-lifecycle, with a fake
 * registry + a controllable remote sender.
 *
 * Truthful by construction:
 *   - `all` needs every leg; one failure ⇒ `ok:false`;
 *   - `first` short-circuits on the first success — later targets are NOT sent
 *     (recorded truthfully as `skipped`), never faked;
 *   - `quorum` needs the majority (or an explicit threshold);
 *   - with NO remote sender / NO local seam, legs fail truthfully (degrade-safe).
 */
import { describe, it, expect } from 'vitest';
import { createTaskStoreRepo } from '../repositories/task-store.repository.js';
import { createTaskLifecycleService } from './task-lifecycle.js';
import {
  createMultiDispatchService,
  requiredSuccesses,
  type RemoteEnvelopeSender,
} from './multi-dispatch.js';
import type { A2ATransport } from '../ports/a2a-transport.port.js';
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type { A2AEnvelope, AgentRow } from '../types.js';

const OFFLINE_EXECUTOR = {
  isAvailable: () => false,
  execute: async () => [],
  mutate: async () => 0,
  withTransaction: async (fn: (tx: unknown) => unknown) => fn(OFFLINE_EXECUTOR),
} as never;

const OWNER = 'user-1';

/** A remote agent row (the dispatch path treats non-runtime as a remote peer). */
function remoteAgent(id: string): AgentRow {
  return { id, userId: OWNER, kind: 'remote_a2a', card: { id, name: id, capabilities: [] }, status: 'unknown' };
}

/** A registry stub that resolves a fixed set of owned remote agents. */
function fakeRegistry(ids: readonly string[]): AgentRegistryRepo {
  const rows = new Map(ids.map((id) => [id, remoteAgent(id)] as const));
  return {
    async get(id: string, userId: string): Promise<AgentRow | null> {
      const row = rows.get(id);
      return row && userId === OWNER ? row : null;
    },
    upsert: async () => { throw new Error('unused'); },
    list: async () => [...rows.values()],
    setStatus: async () => true,
    remove: async () => true,
    recordHeartbeat: async () => {},
    lastHeartbeat: async () => null,
  };
}

/** A transport whose `egressEnvelope` just marks the envelope sealed. */
const transport: A2ATransport = {
  ingressEnvelope: async () => ({ admitted: false, status: 401, code: 'x', reason: 'x' }),
  egressEnvelope: async (env) => ({ envelope: env, signature: 'sig', keyId: 'k1' }),
  agentCard: async () => ({ id: 'self', name: 'self', capabilities: [] }),
  resolveRemoteCard: async () => null,
};

/** A remote sender that fails for any target in `failing`. */
function senderFailing(failing: ReadonlySet<string>): RemoteEnvelopeSender & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(target: AgentRow) {
      calls.push(target.id);
      return failing.has(target.id) ? { ok: false, error: `peer ${target.id} down` } : { ok: true };
    },
  };
}

function envelope(text: string): A2AEnvelope {
  return { id: 'e1', from: OWNER, kind: 'message', payload: { text }, createdAt: new Date().toISOString() };
}

function buildService(ids: readonly string[], sender?: RemoteEnvelopeSender) {
  const repo = createTaskStoreRepo({ executor: OFFLINE_EXECUTOR });
  const tasks = createTaskLifecycleService(repo);
  const dispatch = createMultiDispatchService({
    transport,
    registry: fakeRegistry(ids),
    tasks,
    ...(sender ? { remoteSender: sender } : {}),
  });
  return { dispatch, tasks };
}

describe('multi-dispatch response strategies', () => {
  it('pure requiredSuccesses agrees with each strategy', () => {
    expect(requiredSuccesses('all', 3)).toBe(3);
    expect(requiredSuccesses('first', 3)).toBe(1);
    expect(requiredSuccesses('quorum', 3)).toBe(2); // strict majority
    expect(requiredSuccesses('quorum', 4)).toBe(3);
    expect(requiredSuccesses('quorum', 3, 1)).toBe(1); // explicit, clamped low
    expect(requiredSuccesses('quorum', 3, 99)).toBe(3); // explicit, clamped high
  });

  it('all: every leg must succeed', async () => {
    const { dispatch } = buildService(['a', 'b', 'c'], senderFailing(new Set()));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'all' });
    expect(res.ok).toBe(true);
    expect(res.strategy).toBe('all');
    expect(res.satisfied).toEqual({ succeeded: 3, required: 3 });
    expect(res.legs.every((l) => l.ok)).toBe(true);
  });

  it('all: one failing leg ⇒ ok:false (never faked)', async () => {
    const { dispatch, tasks } = buildService(['a', 'b', 'c'], senderFailing(new Set(['b'])));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'all' });
    expect(res.ok).toBe(false);
    expect(res.satisfied.succeeded).toBe(2);
    // The projection moved to failed, not working.
    expect((await tasks.get(res.taskId, OWNER))?.state).toBe('failed');
  });

  it('first: short-circuits on the first success — later targets are NOT sent', async () => {
    const sender = senderFailing(new Set());
    const { dispatch } = buildService(['a', 'b', 'c'], sender);
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'first' });
    expect(res.ok).toBe(true);
    expect(res.satisfied).toEqual({ succeeded: 1, required: 1 });
    // Only the first target was actually contacted.
    expect(sender.calls).toEqual(['a']);
    // Remaining targets are recorded truthfully as skipped, never faked ok.
    expect(res.legs.filter((l) => l.code === 'skipped').map((l) => l.targetId)).toEqual(['b', 'c']);
  });

  it('first: falls through to the next target when the first fails', async () => {
    const sender = senderFailing(new Set(['a']));
    const { dispatch } = buildService(['a', 'b', 'c'], sender);
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'first' });
    expect(res.ok).toBe(true);
    expect(sender.calls).toEqual(['a', 'b']); // a failed, b won
    expect(res.legs.find((l) => l.targetId === 'c')?.code).toBe('skipped');
  });

  it('quorum: satisfied at strict majority (2 of 3)', async () => {
    const { dispatch } = buildService(['a', 'b', 'c'], senderFailing(new Set(['c'])));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'quorum' });
    expect(res.ok).toBe(true);
    expect(res.satisfied).toEqual({ succeeded: 2, required: 2 });
  });

  it('quorum: NOT satisfied below the majority (1 of 3)', async () => {
    const { dispatch } = buildService(['a', 'b', 'c'], senderFailing(new Set(['b', 'c'])));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'quorum' });
    expect(res.ok).toBe(false);
    expect(res.satisfied.succeeded).toBe(1);
  });

  it('quorum: honors an explicit threshold', async () => {
    const { dispatch } = buildService(['a', 'b', 'c'], senderFailing(new Set(['b', 'c'])));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b', 'c'], envelope: envelope('hi'), strategy: 'quorum', quorum: 1 });
    expect(res.ok).toBe(true);
    expect(res.satisfied.required).toBe(1);
  });

  it('degrades truthfully with NO remote sender wired (never a faked success)', async () => {
    const { dispatch } = buildService(['a', 'b'], undefined);
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b'], envelope: envelope('hi'), strategy: 'first' });
    expect(res.ok).toBe(false);
    expect(res.legs.every((l) => l.code === 'no_remote_sender')).toBe(true);
  });

  it('an unknown target is a truthful target_not_found leg', async () => {
    const { dispatch } = buildService(['a'], senderFailing(new Set()));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['ghost'], envelope: envelope('hi'), strategy: 'all' });
    expect(res.ok).toBe(false);
    expect(res.legs[0]?.code).toBe('target_not_found');
  });

  it('defaults to `all` when no strategy is given (backward compatible)', async () => {
    const { dispatch } = buildService(['a', 'b'], senderFailing(new Set(['b'])));
    const res = await dispatch.dispatch({ userId: OWNER, targets: ['a', 'b'], envelope: envelope('hi') });
    expect(res.strategy).toBe('all');
    expect(res.ok).toBe(false);
  });

  it('one peer: first == quorum == all == the single reply', async () => {
    // With a single reachable peer every strategy collapses to the same result:
    // the one reply is the whole quorum and the whole fan-out (required = 1).
    for (const strategy of ['all', 'first', 'quorum'] as const) {
      const { dispatch } = buildService(['solo'], senderFailing(new Set()));
      const res = await dispatch.dispatch({ userId: OWNER, targets: ['solo'], envelope: envelope('hi'), strategy });
      expect(res.ok).toBe(true);
      expect(res.satisfied).toEqual({ succeeded: 1, required: 1 });
      expect(res.legs.filter((l) => l.ok)).toHaveLength(1);
    }
  });

  it('one peer down: every strategy reports the same truthful failure', async () => {
    for (const strategy of ['all', 'first', 'quorum'] as const) {
      const { dispatch } = buildService(['solo'], senderFailing(new Set(['solo'])));
      const res = await dispatch.dispatch({ userId: OWNER, targets: ['solo'], envelope: envelope('hi'), strategy });
      expect(res.ok).toBe(false);
      expect(res.satisfied.succeeded).toBe(0);
    }
  });

  it('zero peers: a truthful empty result — never a fabricated success', async () => {
    for (const strategy of ['all', 'first', 'quorum'] as const) {
      const { dispatch, tasks } = buildService([], senderFailing(new Set()));
      const res = await dispatch.dispatch({ userId: OWNER, targets: [], envelope: envelope('hi'), strategy });
      // No peers can never be "satisfied": ok stays false with an empty leg set.
      expect(res.ok).toBe(false);
      expect(res.legs).toHaveLength(0);
      expect(res.satisfied.succeeded).toBe(0);
      // The projection is NOT advanced to working on an empty fan-out.
      expect((await tasks.get(res.taskId, OWNER))?.state).toBe('failed');
    }
  });
});
