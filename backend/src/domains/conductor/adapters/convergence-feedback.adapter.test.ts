import { describe, expect, it } from 'vitest';
import type { KvStore } from '../../persistence/ports/kv-store.port.js';
import { createConvergenceFeedbackStore } from './convergence-feedback.adapter.js';

function memoryKv(): KvStore {
  const rows = new Map<string, unknown>();
  const id = (namespace: string, key: string) => `${namespace}:${key}`;
  return {
    get: async (namespace, key) => rows.get(id(namespace, key)) ?? null,
    getJson: async <T>(namespace: string, key: string) => (rows.get(id(namespace, key)) as T | undefined) ?? null,
    set: async (namespace, key, value) => { rows.set(id(namespace, key), value); },
    setJson: async (namespace, key, value) => { rows.set(id(namespace, key), value); },
    delete: async (namespace, key) => { rows.delete(id(namespace, key)); },
    list: async () => [],
    isDurable: () => true,
  };
}

const record = (workspaceId: string, overrides: Record<string, unknown> = {}) => ({
  workspaceId,
  actorId: 'user-1',
  taskGroup: 'group-1',
  mergedAt: '2026-08-30T20:00:00.000Z',
  evidenceHash: `hash-${workspaceId}`,
  picks: [{ path: 'src/pay.ts', sourceWorkspaceId: 'ws-codex', sourceRuntime: 'codex' }],
  trustTier: 'medium' as const,
  trustScore: 68,
  proceededWithFlags: ['2 agents diverged on src/pay.ts'],
  ...overrides,
});

describe('createConvergenceFeedbackStore', () => {
  it('persists repository-scoped delivery decisions across store reconstruction', async () => {
    const kv = memoryKv();
    const first = createConvergenceFeedbackStore(kv);
    const saved = await first.record('owner__repo', record('ws-1'));
    expect(saved).toMatchObject({
      durable: true,
      totalDeliveries: 1,
      contestedPickDecisions: 1,
      proceededWithFlagDecisions: 1,
    });

    const restarted = createConvergenceFeedbackStore(kv);
    const loaded = await restarted.read('owner__repo');
    expect(loaded.decisions[0]).toMatchObject({
      workspaceId: 'ws-1',
      picks: [{ path: 'src/pay.ts', sourceRuntime: 'codex' }],
      proceededWithFlags: ['2 agents diverged on src/pay.ts'],
    });
  });

  it('is idempotent per delivered workspace and replaces its aggregate contribution', async () => {
    const store = createConvergenceFeedbackStore(memoryKv());
    await store.record('owner__repo', record('ws-1'));
    const updated = await store.record('owner__repo', record('ws-1', {
      picks: [],
      proceededWithFlags: ['reviewed assisted merge', 'reviewed degraded gate'],
    }));
    expect(updated.totalDeliveries).toBe(1);
    expect(updated.contestedPickDecisions).toBe(0);
    expect(updated.proceededWithFlagDecisions).toBe(2);
    expect(updated.decisions).toHaveLength(1);
  });

  it('serializes concurrent decisions for the same repository without losing one', async () => {
    const store = createConvergenceFeedbackStore(memoryKv());
    const [a, b] = await Promise.all([
      store.record('owner__repo', record('ws-a')),
      store.record('owner__repo', record('ws-b')),
    ]);
    expect(Math.max(a.totalDeliveries, b.totalDeliveries)).toBe(2);
    const loaded = await store.read('owner__repo');
    expect(loaded.totalDeliveries).toBe(2);
    expect(loaded.decisions.map(item => item.workspaceId).sort()).toEqual(['ws-a', 'ws-b']);
  });

  it('persists explicit flag dispositions, retains clears in history, and rejects invented flags', async () => {
    const kv = memoryKv();
    const store = createConvergenceFeedbackStore(kv);
    await store.record('owner__repo', record('ws-1'));
    const accepted = await store.setFlagDisposition('owner__repo', {
      workspaceId: 'ws-1',
      actorId: 'user-2',
      flag: '2 agents diverged on src/pay.ts',
      disposition: 'accepted',
      decidedAt: '2026-08-30T20:01:00.000Z',
    });
    expect(accepted).toMatchObject({
      totalFlagFeedbackDecisions: 1,
      acceptedFlagRules: 1,
      dismissedFlagRules: 0,
    });
    expect(accepted.flagDispositions[0]).toMatchObject({
      disposition: 'accepted',
      workspaceId: 'ws-1',
      actorId: 'user-2',
    });

    const dismissed = await store.setFlagDisposition('owner__repo', {
      workspaceId: 'ws-1',
      actorId: 'user-2',
      flag: ' 2 agents   diverged on src/pay.ts ',
      disposition: 'dismissed',
      decidedAt: '2026-08-30T20:02:00.000Z',
    });
    expect(dismissed).toMatchObject({ acceptedFlagRules: 0, dismissedFlagRules: 1 });

    const cleared = await store.setFlagDisposition('owner__repo', {
      workspaceId: 'ws-1',
      actorId: 'user-2',
      flag: '2 agents diverged on src/pay.ts',
      disposition: 'clear',
      decidedAt: '2026-08-30T20:03:00.000Z',
    });
    expect(cleared).toMatchObject({
      totalFlagFeedbackDecisions: 3,
      acceptedFlagRules: 0,
      dismissedFlagRules: 0,
    });
    expect(cleared.flagDispositions).toEqual([]);
    expect(cleared.flagFeedbackHistory.map(item => item.disposition)).toEqual([
      'clear',
      'dismissed',
      'accepted',
    ]);
    expect((await createConvergenceFeedbackStore(kv).read('owner__repo')).flagFeedbackHistory).toHaveLength(3);

    await expect(store.setFlagDisposition('owner__repo', {
      workspaceId: 'ws-1',
      actorId: 'user-2',
      flag: 'invented warning',
      disposition: 'dismissed',
      decidedAt: '2026-08-30T20:04:00.000Z',
    })).rejects.toThrow(/not recorded/i);
  });

  it('persists the operator-owned required-rule trust mode independently of repository rules', async () => {
    const kv = memoryKv();
    const store = createConvergenceFeedbackStore(kv);
    expect((await store.read('owner__repo')).requiredRulePolicy).toEqual({ mode: 'off' });
    const saved = await store.setRequiredRulePolicy('owner__repo', {
      mode: 'block', actorId: 'operator-1', updatedAt: '2026-08-31T12:00:00.000Z',
    });
    expect(saved.requiredRulePolicy).toEqual({
      mode: 'block', actorId: 'operator-1', updatedAt: '2026-08-31T12:00:00.000Z',
    });
    expect((await createConvergenceFeedbackStore(kv).read('owner__repo')).requiredRulePolicy.mode).toBe('block');
  });
});
