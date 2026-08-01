/**
 * A2A JSON-RPC owner-binding tests. The wire has no session cookie, so ownership
 * MUST derive from the cryptographically-verified signer identity (the ed25519
 * `key_id`, carried out of admission), never from a client-supplied
 * `params.userId` — otherwise any one enrolled peer can read/cancel every other
 * tenant's tasks (confused-deputy / IDOR).
 *
 * The insecure-dev / solo posture has no verified signer, so it falls back to the
 * caller-supplied `userId` (single-tenant fail-open) — asserted here too.
 */
import { describe, it, expect, vi } from 'vitest';
import { createA2AJsonRpcServer, A2A_METHODS } from '../wire/a2a-jsonrpc-server.js';
import { registerA2AMethods } from './a2a-methods.js';
import type { TaskLifecycleService } from './task-lifecycle.js';
import type { MultiDispatchService } from './multi-dispatch.js';
import type { EnvelopeService } from '../wire/a2a-envelope.service.js';

function buildServer() {
  const getCalls: Array<{ id: string; userId: string }> = [];
  const cancelCalls: Array<{ id: string; userId: string }> = [];
  const dispatchCalls: Array<{ userId: string }> = [];

  const tasks = {
    get: vi.fn(async (id: string, userId: string) => {
      getCalls.push({ id, userId });
      // Only the true owner "peer-b" holds this task.
      return userId === 'peer-b' ? ({ id, userId, state: 'working' } as unknown) : null;
    }),
    cancel: vi.fn(async (id: string, userId: string) => {
      cancelCalls.push({ id, userId });
      return userId === 'peer-b'
        ? { ok: true, task: { id, userId, state: 'canceled' } }
        : { ok: false, code: 'not_found', reason: `Task ${id} not found.` };
    }),
    messages: vi.fn(async () => []),
  } as unknown as TaskLifecycleService;

  const dispatch = {
    dispatch: vi.fn(async (input: { userId: string }) => {
      dispatchCalls.push({ userId: input.userId });
      return { taskId: 't1', results: [] };
    }),
  } as unknown as MultiDispatchService;

  const envelope = {
    buildEnvelope: vi.fn((e: unknown) => e),
  } as unknown as EnvelopeService;

  const jsonRpc = createA2AJsonRpcServer();
  registerA2AMethods({ jsonRpc, tasks, dispatch, envelope });
  return { jsonRpc, getCalls, cancelCalls, dispatchCalls };
}

const rpc = (method: string, params: unknown) => ({ jsonrpc: '2.0' as const, id: 1, method, params });

describe('A2A method owner-binding (signed wire)', () => {
  it('tasks/get scopes by the verified signer keyId (userId derived from signer, not params)', async () => {
    const { jsonRpc, getCalls } = buildServer();
    // No params.userId — ownership comes purely from the verified signer.
    const res = await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.TASKS_GET, { id: 'victim-task' }),
      { signer: { keyId: 'peer-b' } },
    );
    // The store must have been queried under the SIGNER (peer-b), never peer-a.
    expect(getCalls.every((c) => c.userId === 'peer-b')).toBe(true);
    // And it must succeed for the signer's own task.
    expect((res as { error?: unknown }).error).toBeUndefined();
  });

  it('tasks/get REJECTS a params.userId that mismatches the signer, never reading the victim', async () => {
    const { jsonRpc, getCalls } = buildServer();
    const res = await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.TASKS_GET, { id: 'victim-task', userId: 'peer-a' }),
      { signer: { keyId: 'peer-b' } },
    );
    // peer-b claiming userId:peer-a is a spoof → INVALID_PARAMS (-32602), and the
    // victim (peer-a) store scope is NEVER queried.
    const err = (res as { error?: { code: number } }).error;
    expect(err?.code).toBe(-32602);
    expect(getCalls.some((c) => c.userId === 'peer-a')).toBe(false);
  });

  it('tasks/cancel scopes by the verified signer keyId, not params.userId', async () => {
    const { jsonRpc, cancelCalls } = buildServer();
    await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.TASKS_CANCEL, { id: 'victim-task', userId: 'peer-a' }),
      { signer: { keyId: 'peer-b' } },
    );
    expect(cancelCalls.every((c) => c.userId === 'peer-b')).toBe(true);
    expect(cancelCalls.some((c) => c.userId === 'peer-a')).toBe(false);
  });

  it('message/send dispatches under the verified signer keyId, not params.userId', async () => {
    const { jsonRpc, dispatchCalls } = buildServer();
    await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.MESSAGE_SEND, {
        userId: 'peer-a',
        message: { text: 'hi' },
        targets: ['peer-c'],
      }),
      { signer: { keyId: 'peer-b' } },
    );
    expect(dispatchCalls.every((c) => c.userId === 'peer-b')).toBe(true);
  });

  it('insecure-dev posture (no signer) falls back to params.userId (single-tenant fail-open)', async () => {
    const { jsonRpc, getCalls } = buildServer();
    await jsonRpc.handleA2ARpc(rpc(A2A_METHODS.TASKS_GET, { id: 't', userId: 'peer-b' }), {});
    expect(getCalls.some((c) => c.userId === 'peer-b')).toBe(true);
  });
});

describe('A2A message/stream — dispatch + resubscribe projection', () => {
  it('is registered as a wired method (advertised in the agent-card capabilities)', () => {
    const { jsonRpc } = buildServer();
    expect(jsonRpc.methods()).toContain(A2A_METHODS.MESSAGE_STREAM);
  });

  it('dispatches under the verified signer keyId, then streams the task + RunEvents back', async () => {
    // A richer task mock: the just-dispatched task (t1) is visible to peer-b and
    // carries a two-event message log — the RunEvent stream we expect projected.
    const events = [
      { id: 'm1', taskId: 't1', role: 'user', parts: [{ kind: 'text', text: 'hi' }] },
      { id: 'm2', taskId: 't1', role: 'agent', parts: [{ kind: 'text', text: 'working' }] },
    ];
    const dispatchCalls: Array<{ userId: string }> = [];
    const messagesCalls: string[] = [];
    const tasks = {
      get: vi.fn(async (id: string, userId: string) =>
        userId === 'peer-b' ? ({ id, userId, state: 'working' } as unknown) : null,
      ),
      messages: vi.fn(async (taskId: string) => {
        messagesCalls.push(taskId);
        return events;
      }),
    } as unknown as TaskLifecycleService;
    const dispatch = {
      dispatch: vi.fn(async (input: { userId: string }) => {
        dispatchCalls.push({ userId: input.userId });
        return { taskId: 't1', legs: [], ok: true, strategy: 'all', satisfied: { succeeded: 1, required: 1 } };
      }),
    } as unknown as MultiDispatchService;
    const envelope = { buildEnvelope: vi.fn((e: unknown) => e) } as unknown as EnvelopeService;
    const jsonRpc = createA2AJsonRpcServer();
    registerA2AMethods({ jsonRpc, tasks, dispatch, envelope });

    const res = await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.MESSAGE_STREAM, { message: { text: 'hi' }, targets: ['peer-c'] }),
      { signer: { keyId: 'peer-b' } },
    );

    // Dispatched under the SIGNER, never a caller-supplied id.
    expect(dispatchCalls.every((c) => c.userId === 'peer-b')).toBe(true);
    const result = (res as { result?: Record<string, unknown> }).result;
    expect((res as { error?: unknown }).error).toBeUndefined();
    expect(result?.streaming).toBe(true);
    // The RunEvents were re-projected via the resubscribe plumbing (owner-scoped
    // messages of the just-dispatched task).
    expect(messagesCalls).toContain('t1');
    expect(result?.events).toEqual(events);
    expect((result?.result as { taskId: string }).taskId).toBe('t1');
  });

  it('REJECTS a params.userId that mismatches the signer (spoof) without dispatching', async () => {
    const { jsonRpc, dispatchCalls } = buildServer();
    const res = await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.MESSAGE_STREAM, { userId: 'peer-a', message: { text: 'hi' }, targets: ['peer-c'] }),
      { signer: { keyId: 'peer-b' } },
    );
    expect((res as { error?: { code: number } }).error?.code).toBe(-32602);
    expect(dispatchCalls.length).toBe(0);
  });

  it('fail-closed: a non-owner-visible task yields empty events (never a fabricated stream)', async () => {
    // The dispatched task id is NOT visible to the signer (get ⇒ null) ⇒ events [].
    const tasks = {
      get: vi.fn(async () => null),
      messages: vi.fn(async () => [{ id: 'leak', taskId: 't1', role: 'agent', parts: [] }]),
    } as unknown as TaskLifecycleService;
    const dispatch = {
      dispatch: vi.fn(async () => ({ taskId: 't1', legs: [], ok: true, strategy: 'all', satisfied: { succeeded: 1, required: 1 } })),
    } as unknown as MultiDispatchService;
    const envelope = { buildEnvelope: vi.fn((e: unknown) => e) } as unknown as EnvelopeService;
    const jsonRpc = createA2AJsonRpcServer();
    registerA2AMethods({ jsonRpc, tasks, dispatch, envelope });

    const res = await jsonRpc.handleA2ARpc(
      rpc(A2A_METHODS.MESSAGE_STREAM, { message: { text: 'hi' }, targets: ['peer-c'] }),
      { signer: { keyId: 'peer-b' } },
    );
    const result = (res as { result?: Record<string, unknown> }).result;
    expect(result?.streaming).toBe(true);
    expect(result?.task).toBeNull();
    expect(result?.events).toEqual([]);
    // The message log of an unowned task is NEVER read (no cross-tenant leak).
    expect(tasks.messages).not.toHaveBeenCalled();
  });
});
