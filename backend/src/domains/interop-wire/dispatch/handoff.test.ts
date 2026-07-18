/**
 * `handoff` — proves the explicit A2A handoff verb: an owned task is transferred
 * to a target carrying its context bundle (dispatch onto the SAME taskId, a
 * `system` handoff message + a scratchpad note recorded), an unowned/absent task
 * is a truthful `not_found`, and a handoff with no dispatch seam fails truthfully.
 */
import { describe, it, expect } from 'vitest';
import { createTaskStoreRepo } from '../repositories/task-store.repository.js';
import { createTaskLifecycleService } from './task-lifecycle.js';
import { createScratchpadService } from '../bridge/scratchpad.js';
import { createContextBridgeService } from '../bridge/context-bridge.js';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createMultiDispatchService, type RemoteEnvelopeSender } from './multi-dispatch.js';
import { createHandoffService } from './handoff.js';
import type { A2ATransport } from '../ports/a2a-transport.port.js';
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type { AgentRow } from '../types.js';

const OFFLINE_EXECUTOR = {
  isAvailable: () => false,
  execute: async () => [],
  mutate: async () => 0,
  withTransaction: async (fn: (tx: unknown) => unknown) => fn(OFFLINE_EXECUTOR),
} as never;

const OWNER = 'user-1';

function remoteAgent(id: string): AgentRow {
  return { id, userId: OWNER, kind: 'remote_a2a', card: { id, name: id, capabilities: [] }, status: 'unknown' };
}

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

const transport: A2ATransport = {
  ingressEnvelope: async () => ({ admitted: false, status: 401, code: 'x', reason: 'x' }),
  egressEnvelope: async (env) => ({ envelope: env, signature: 'sig', keyId: 'k1' }),
  agentCard: async () => ({ id: 'self', name: 'self', capabilities: [] }),
  resolveRemoteCard: async () => null,
};

function okSender(): RemoteEnvelopeSender {
  return { async send() { return { ok: true }; } };
}

function build(targets: readonly string[], sender?: RemoteEnvelopeSender) {
  const repo = createTaskStoreRepo({ executor: OFFLINE_EXECUTOR });
  const tasks = createTaskLifecycleService(repo);
  const scratchpad = createScratchpadService(repo);
  const contextBridge = createContextBridgeService({ tasks: repo, scratchpad });
  const envelope = createEnvelopeService({ hmacSecret: 's', keyId: 'k1' });
  const dispatch = createMultiDispatchService({
    transport,
    registry: fakeRegistry(targets),
    tasks,
    ...(sender ? { remoteSender: sender } : {}),
  });
  const handoff = createHandoffService({ tasks, contextBridge, dispatch, envelope });
  return { tasks, scratchpad, handoff };
}

describe('handoff verb', () => {
  it('hands an owned task off to a reachable target (context recorded)', async () => {
    const { tasks, scratchpad, handoff } = build(['peer-b'], okSender());
    await tasks.create({ id: 't1', userId: OWNER, state: 'working' });
    await tasks.appendMessage({ taskId: 't1', role: 'user', parts: [{ kind: 'text', text: 'prior turn' }] });

    const res = await handoff.handoff({ taskId: 't1', userId: OWNER, target: 'peer-b', note: 'you take it' });
    expect(res.ok).toBe(true);
    expect(res.code).toBe('handed_off');
    expect(res.leg?.ok).toBe(true);
    expect(res.bundle?.messages.length).toBeGreaterThanOrEqual(1);

    // A system handoff message + a scratchpad note were recorded on the task.
    const msgs = await tasks.messages('t1');
    expect(msgs.some((m) => m.role === 'system')).toBe(true);
    const notes = await scratchpad.read('t1');
    expect(notes.some((n) => n.note.includes('Handoff to peer-b'))).toBe(true);
  });

  it('refuses to hand off an unowned / absent task (truthful not_found)', async () => {
    const { handoff } = build(['peer-b'], okSender());
    const res = await handoff.handoff({ taskId: 'missing', userId: OWNER, target: 'peer-b' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('not_found');
    expect(res.leg).toBeUndefined();
  });

  it('fails truthfully when the dispatch seam cannot reach the receiver', async () => {
    const { tasks, handoff } = build(['peer-b'], undefined); // no remote sender
    await tasks.create({ id: 't2', userId: OWNER, state: 'working' });
    const res = await handoff.handoff({ taskId: 't2', userId: OWNER, target: 'peer-b' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('dispatch_failed');
    expect(res.leg?.code).toBe('no_remote_sender');

    // A failed handoff must NOT terminally destroy the source task: the reused
    // in-flight task is left in its prior non-terminal state so the original
    // owner can still complete or retry it.
    const still = await tasks.get('t2', OWNER);
    expect(still?.state).toBe('working');
  });
});
