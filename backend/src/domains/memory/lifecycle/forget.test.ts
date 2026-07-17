/**
 * lifecycle/forget tests — the governance gate is the SOLE authority over a
 * durable forget: a non-allow verdict must NOT tombstone the item, and the
 * decide pipeline (the audit seam) is exercised for every attempt.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict, GovernanceEffect, GateDecisionContext } from '../../governance/types.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import { createForgetService, MEMORY_FORGET_ACTION } from './forget.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } } as never;

const principal: Principal = { userId: 'u1', scopes: [], kind: 'session', isAnonymous: false, raw: {} } as unknown as Principal;

function verdict(effect: GovernanceEffect): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'high',
    reason: `test ${effect}`,
    degraded: false,
    engine: 'ts',
    createdAt: '2026-07-15T00:00:00Z',
  } as GateVerdict;
}

/** A gate that records every decide call so the audit path is verifiable. */
function recordingGate(effect: GovernanceEffect): {
  gate: GovernanceGate;
  decideCalls: { action: string; ctx: GateDecisionContext }[];
} {
  const decideCalls: { action: string; ctx: GateDecisionContext }[] = [];
  const gate: GovernanceGate = {
    async decide(action, _principal, ctx) {
      decideCalls.push({ action, ctx });
      return verdict(effect);
    },
    async enforceTool() {
      return { outcome: 'allowed', reason: 'ok', degraded: false, engine: 'ts' } as never;
    },
    async route() {
      return { routable: true, tier: 'low', reason: 'ok' } as never;
    },
    async recordAudit() {
      return {} as never;
    },
    async verifyAudit() {
      return {} as never;
    },
  };
  return { gate, decideCalls };
}

function item(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    memoryId: 'mi_1',
    scope: 'repo',
    title: 'fact',
    body: 'the box is 16GB',
    status: 'active',
    evidence: { taskId: 't1', artifactId: 'a1' },
    createdAt: '2026-07-15T00:00:00Z',
    acceptedBy: 'u1',
    ...overrides,
  };
}

function fakeRepo(seed: MemoryItem | null = item()): { repo: MemoryRepository; items: MemoryItem[] } {
  const items: MemoryItem[] = seed ? [seed] : [];
  const repo: MemoryRepository = {
    async listItems() {
      return items;
    },
    async getItem(_u, id) {
      return items.find((i) => i.memoryId === id) ?? null;
    },
    async upsertItem(_u, i) {
      const idx = items.findIndex((x) => x.memoryId === i.memoryId);
      if (idx >= 0) items[idx] = i;
      else items.push(i);
      return i;
    },
    async listCandidates() {
      return [] as MemoryCandidate[];
    },
    async getCandidate() {
      return null;
    },
    async upsertCandidate(_u, c) {
      return c;
    },
    async addRelation() {
      throw new Error('unused');
    },
    async listRelations() {
      return [];
    },
    async deleteRelation() {
      return false;
    },
  };
  return { repo, items };
}

describe('createForgetService.forget', () => {
  it('tombstones the item to expired on an allow verdict (removed from active recall)', async () => {
    const { repo, items } = fakeRepo();
    const { gate, decideCalls } = recordingGate('allow');
    const svc = createForgetService({ repository: repo, gate, logger: silentLogger, now: () => '2026-07-15T12:00:00Z' });

    const result = await svc.forget({ userId: 'u1', memoryId: 'mi_1', principal, reason: 'no longer true' });

    expect(result.forgotten).toBe(true);
    expect(result.item.status).toBe('expired');
    expect(result.item.expiresAt).toBe('2026-07-15T12:00:00Z');
    // Persisted tombstone (not still active).
    expect(items[0]?.status).toBe('expired');
    // The governed write seam ran under the correct action (the audit path).
    expect(decideCalls).toHaveLength(1);
    expect(decideCalls[0]?.action).toBe(MEMORY_FORGET_ACTION);
    expect(decideCalls[0]?.ctx.metadata?.reason).toBe('no longer true');
  });

  it('does NOT tombstone on a deny verdict (fail-closed, item untouched, still audited)', async () => {
    const { repo, items } = fakeRepo();
    const { gate, decideCalls } = recordingGate('deny');
    const svc = createForgetService({ repository: repo, gate, logger: silentLogger });

    const result = await svc.forget({ userId: 'u1', memoryId: 'mi_1', principal, reason: 'try to delete' });

    expect(result.forgotten).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    // The item is still active — never silently deleted.
    expect(items[0]?.status).toBe('active');
    // Deny still went through decide (the audit chain seals allow AND deny).
    expect(decideCalls).toHaveLength(1);
  });

  it('does NOT tombstone on needs_approval (returns the approval gate)', async () => {
    const { repo, items } = fakeRepo();
    const { gate } = recordingGate('needs_approval');
    const svc = createForgetService({ repository: repo, gate, logger: silentLogger });

    const result = await svc.forget({ userId: 'u1', memoryId: 'mi_1', principal, reason: 'maybe' });

    expect(result.forgotten).toBe(false);
    expect(result.verdict.effect).toBe('needs_approval');
    expect(items[0]?.status).toBe('active');
  });

  it('requires a reason', async () => {
    const { repo } = fakeRepo();
    const { gate } = recordingGate('allow');
    const svc = createForgetService({ repository: repo, gate, logger: silentLogger });
    await expect(svc.forget({ userId: 'u1', memoryId: 'mi_1', principal, reason: '  ' })).rejects.toThrow(/reason/i);
  });

  it('throws NOT_FOUND for an unknown item (never gates a phantom forget)', async () => {
    const { repo } = fakeRepo(null);
    const { gate, decideCalls } = recordingGate('allow');
    const svc = createForgetService({ repository: repo, gate, logger: silentLogger });
    await expect(svc.forget({ userId: 'u1', memoryId: 'nope', principal, reason: 'x' })).rejects.toThrow(/not found/i);
    // The gate is never consulted for an item that does not exist.
    expect(decideCalls).toHaveLength(0);
  });
});
