/**
 * interop-wire WRITE MCP tools — proves the governed A2A write surface is bound
 * and truthful: `interop_send_task` opens + dispatches a task under a strategy,
 * `interop_dispatch` requires an existing taskId, `interop_respond` appends an
 * agent response (+ optional transition) and refuses unowned tasks, and
 * `interop_inbox` lists the caller's OPEN tasks. Composes the real dispatch /
 * lifecycle / envelope services over the in-process degrade path.
 */
import { describe, it, expect } from 'vitest';
import { createTaskStoreRepo } from '../repositories/task-store.repository.js';
import { createTaskLifecycleService } from '../dispatch/task-lifecycle.js';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createMultiDispatchService, type RemoteEnvelopeSender } from '../dispatch/multi-dispatch.js';
import { buildInteropWriteMcpTools } from './interop-write-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
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
/** The host-authorized caller the edge binds for OWNER (the honest principal). */
const OWNER_CALLER: McpToolCaller = { userId: OWNER };

function remoteAgent(id: string): AgentRow {
  return { id, userId: OWNER, kind: 'remote_a2a', card: { id, name: id, capabilities: [] }, status: 'unknown' };
}
function fakeRegistry(ids: readonly string[]): AgentRegistryRepo {
  const rows = new Map(ids.map((id) => [id, remoteAgent(id)] as const));
  return {
    async get(id: string, userId: string) {
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
const okSender: RemoteEnvelopeSender = { async send() { return { ok: true }; } };

function build() {
  const repo = createTaskStoreRepo({ executor: OFFLINE_EXECUTOR });
  const tasks = createTaskLifecycleService(repo);
  const envelope = createEnvelopeService({ hmacSecret: 's', keyId: 'k1' });
  const dispatch = createMultiDispatchService({ transport, registry: fakeRegistry(['peer-a', 'peer-b']), tasks, remoteSender: okSender });
  const tools = buildInteropWriteMcpTools({ dispatch, tasks, envelope, ownerId: OWNER });
  const byName = new Map(tools.map((t) => [t.name, t] as const));
  // Default to the host-authorized OWNER caller (as the edge binds it); tests that
  // exercise the spoof/absent paths pass an explicit caller instead.
  const call = <T = unknown>(name: string, input: unknown, caller: McpToolCaller | undefined = OWNER_CALLER): Promise<T> =>
    Promise.resolve(byName.get(name)!.handler(input, caller) as T);
  return { tasks, tools, byName, call };
}

describe('interop-wire write MCP tools', () => {
  it('advertises the four write tools by name', () => {
    const { tools } = build();
    const names = tools.map((t: McpToolRegistration) => t.name).sort();
    expect(names).toEqual(['interop_dispatch', 'interop_inbox', 'interop_respond', 'interop_send_task']);
  });

  it('interop_send_task opens + dispatches a NEW task under a strategy', async () => {
    const { call, tasks } = build();
    const res = await call<{ ok: boolean; taskId: string; strategy: string; legs: unknown[] }>('interop_send_task', {
      userId: OWNER, targets: ['peer-a', 'peer-b'], text: 'do it', strategy: 'first',
    });
    expect(res.ok).toBe(true);
    expect(res.strategy).toBe('first');
    // The projection now exists and is owned.
    expect(await tasks.get(res.taskId, OWNER)).not.toBeNull();
  });

  it('interop_send_task rejects an empty targets array', async () => {
    const { call } = build();
    await expect(call('interop_send_task', { userId: OWNER, targets: [], text: 'x' })).rejects.toThrow(/targets/);
  });

  it('interop_dispatch requires an existing taskId', async () => {
    const { call } = build();
    await expect(call('interop_dispatch', { userId: OWNER, targets: ['peer-a'], text: 'x' })).rejects.toThrow(/taskId/);
  });

  it('interop_dispatch fans a follow-up onto an existing task', async () => {
    const { call, tasks } = build();
    await tasks.create({ id: 'live-1', userId: OWNER, state: 'working' });
    const res = await call<{ ok: boolean; taskId: string }>('interop_dispatch', {
      userId: OWNER, taskId: 'live-1', targets: ['peer-a'], text: 'more',
    });
    expect(res.ok).toBe(true);
    expect(res.taskId).toBe('live-1');
  });

  it('interop_respond appends an agent response + optional transition', async () => {
    const { call, tasks } = build();
    await tasks.create({ id: 'r-1', userId: OWNER, state: 'working' });
    const res = await call<{ ok: boolean; transition?: { ok: boolean; state?: string } }>('interop_respond', {
      userId: OWNER, taskId: 'r-1', text: 'done', state: 'completed',
    });
    expect(res.ok).toBe(true);
    expect(res.transition?.ok).toBe(true);
    expect(res.transition?.state).toBe('completed');
    const msgs = await tasks.messages('r-1');
    expect(msgs.at(-1)?.role).toBe('agent');
  });

  it('interop_respond refuses an unowned / absent task', async () => {
    const { call } = build();
    await expect(call('interop_respond', { userId: OWNER, taskId: 'nope', text: 'x' })).rejects.toThrow(/not found/);
  });

  it('interop_inbox lists only the OPEN (non-terminal) tasks', async () => {
    const { call, tasks } = build();
    await tasks.create({ id: 'open-1', userId: OWNER, state: 'working' });
    await tasks.create({ id: 'done-1', userId: OWNER, state: 'submitted' });
    await tasks.transition('done-1', OWNER, 'completed');
    const res = await call<{ count: number; tasks: { id: string; state: string }[] }>('interop_inbox', { userId: OWNER });
    const ids = res.tasks.map((t) => t.id);
    expect(ids).toContain('open-1');
    expect(ids).not.toContain('done-1');
    expect(res.tasks.every((t) => t.state !== 'completed')).toBe(true);
  });

  // --- SECURITY: the subject is bound to the host-authorized caller, not args ---

  it('interop_respond BLOCKS a cross-tenant spoof — victim id never reaches the data seam', async () => {
    const { byName, tasks } = build();
    // Victim owns a live task. Attacker is a DIFFERENT authorized principal.
    await tasks.create({ id: 'victim-task', userId: 'victim', state: 'working' });
    const attacker: McpToolCaller = { userId: 'attacker' };
    // Instrument the data seam so we can prove the victim id never reaches it.
    const seen: string[] = [];
    const realGet = tasks.get.bind(tasks);
    tasks.get = ((taskId: string, userId: string) => {
      seen.push(userId);
      return realGet(taskId, userId);
    }) as typeof tasks.get;
    // Attacker forges args.userId = 'victim' to respond to the victim's task.
    await expect(
      byName.get('interop_respond')!.handler({ userId: 'victim', taskId: 'victim-task', text: 'pwn' }, attacker),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(seen).not.toContain('victim');
    // The victim's task is untouched (no message appended).
    expect((await tasks.messages('victim-task')).length).toBe(0);
  });

  it('interop_inbox BLOCKS cross-tenant inbox disclosure (foreign args.userId → 403)', async () => {
    const { byName, tasks } = build();
    await tasks.create({ id: 'victim-open', userId: 'victim', state: 'working' });
    const attacker: McpToolCaller = { userId: 'attacker' };
    await expect(
      byName.get('interop_inbox')!.handler({ userId: 'victim' }, attacker),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('interop_send_task BLOCKS impersonated dispatch (from = victim) — foreign args.userId → 403', async () => {
    const { byName } = build();
    const attacker: McpToolCaller = { userId: 'attacker' };
    await expect(
      byName.get('interop_send_task')!.handler({ userId: 'victim', targets: ['peer-a'], text: 'x' }, attacker),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
  });

  it('refuses every write tool when NO caller is bound (edge-exposed ⇒ AUTH_REQUIRED)', async () => {
    const { byName } = build();
    for (const name of ['interop_send_task', 'interop_dispatch', 'interop_respond', 'interop_inbox']) {
      await expect(
        byName.get(name)!.handler({ userId: OWNER, taskId: 't', targets: ['peer-a'], text: 'x' }, undefined),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    }
  });

  it('no args.userId resolves the callers OWN subject (self-service)', async () => {
    const { byName, tasks } = build();
    await tasks.create({ id: 'self-1', userId: OWNER, state: 'working' });
    const res = (await byName.get('interop_respond')!.handler(
      { taskId: 'self-1', text: 'done' },
      OWNER_CALLER,
    )) as { ok: boolean; taskId: string };
    expect(res.ok).toBe(true);
    expect((await tasks.messages('self-1')).at(-1)?.role).toBe('agent');
  });

  it('an admin/internal caller MAY act on an arbitrary subject', async () => {
    const { byName, tasks } = build();
    await tasks.create({ id: 'other-1', userId: 'other', state: 'working' });
    const admin: McpToolCaller = { userId: 'ops', scopes: ['internal'] };
    const res = (await byName.get('interop_respond')!.handler(
      { userId: 'other', taskId: 'other-1', text: 'ack' },
      admin,
    )) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect((await tasks.messages('other-1')).at(-1)?.role).toBe('agent');
  });
});
