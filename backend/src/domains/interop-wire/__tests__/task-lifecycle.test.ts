/**
 * `task-lifecycle` — the A2A task projection state machine. Proves the
 * fail-closed transition guard: legal moves apply, illegal/terminal moves are
 * REFUSED (never silently applied), not-owned/absent resolves to `null` (never a
 * fabricated row), and the message log round-trips.
 *
 * Runs over the in-process degrade path of the frozen {@link TaskStoreRepo}
 * (executor unavailable) so it needs no Postgres.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTaskStoreRepo } from '../repositories/task-store.repository.js';
import {
  createTaskLifecycleService,
  isLegalTransition,
  isTerminalTaskState,
  type TaskLifecycleService,
} from '../dispatch/task-lifecycle.js';

/** A persistence executor that is never available — forces the in-process path. */
const OFFLINE_EXECUTOR = {
  isAvailable: () => false,
  execute: async () => [],
  mutate: async () => 0,
  withTransaction: async (fn: (tx: unknown) => unknown) => fn(OFFLINE_EXECUTOR),
} as never;

const OWNER = 'user-1';

describe('task-lifecycle state machine', () => {
  let svc: TaskLifecycleService;

  beforeEach(async () => {
    const repo = createTaskStoreRepo({ executor: OFFLINE_EXECUTOR });
    svc = createTaskLifecycleService(repo);
    await svc.create({ id: 'task-1', userId: OWNER, state: 'submitted' });
  });

  it('applies a legal transition (submitted → working)', async () => {
    const res = await svc.transition('task-1', OWNER, 'working');
    expect(res.ok).toBe(true);
    expect(res.code).toBe('transitioned');
    expect(res.task?.state).toBe('working');
  });

  it('REFUSES an illegal transition without mutating state', async () => {
    await svc.transition('task-1', OWNER, 'completed');
    const res = await svc.transition('task-1', OWNER, 'working');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('terminal');
    // The task stays completed — the illegal move never applied.
    const now = await svc.get('task-1', OWNER);
    expect(now?.state).toBe('completed');
  });

  it('REFUSES a transition out of a terminal state', async () => {
    await svc.transition('task-1', OWNER, 'canceled');
    const res = await svc.transition('task-1', OWNER, 'working');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('terminal');
  });

  it('treats a same-state transition as an idempotent no-op', async () => {
    await svc.transition('task-1', OWNER, 'working');
    const res = await svc.transition('task-1', OWNER, 'working');
    expect(res.ok).toBe(true);
    expect(res.task?.state).toBe('working');
  });

  it('resolves not-owned / absent tasks to a truthful not_found (never fabricates)', async () => {
    const foreign = await svc.transition('task-1', 'attacker', 'working');
    expect(foreign.ok).toBe(false);
    expect(foreign.code).toBe('not_found');
    expect(foreign.task).toBeNull();

    const missing = await svc.get('does-not-exist', OWNER);
    expect(missing).toBeNull();
  });

  it('cancel() routes through the guard to the canceled state', async () => {
    const res = await svc.cancel('task-1', OWNER);
    expect(res.ok).toBe(true);
    expect(res.task?.state).toBe('canceled');
  });

  it('appends and reads back the message log oldest-first', async () => {
    await svc.appendMessage({ taskId: 'task-1', role: 'user', parts: [{ text: 'hi' }] });
    await svc.appendMessage({ taskId: 'task-1', role: 'agent', parts: [{ text: 'yo' }] });
    const msgs = await svc.messages('task-1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[1]?.role).toBe('agent');
    expect(msgs[0]?.id).toBeTruthy();
  });

  it('pure guards agree with the transition table', () => {
    expect(isLegalTransition('submitted', 'working')).toBe(true);
    expect(isLegalTransition('completed', 'working')).toBe(false);
    expect(isTerminalTaskState('completed')).toBe(true);
    expect(isTerminalTaskState('working')).toBe(false);
  });
});
