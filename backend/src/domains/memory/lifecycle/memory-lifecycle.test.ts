/**
 * lifecycle/memory-lifecycle tests — the governance gate is the SOLE authority
 * over durable promotion: a non-allow verdict must NOT materialize an item.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict, GovernanceEffect } from '../../governance/types.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { BeadsMemoryPort } from '../ports/beads-memory.port.js';
import { createMemoryLifecycle } from './memory-lifecycle.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } } as never;

const principal: Principal = { userId: 'u1', scopes: [], kind: 'session', isAnonymous: false, raw: {} } as unknown as Principal;

function verdict(effect: GovernanceEffect): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'medium',
    reason: `test ${effect}`,
    degraded: false,
    engine: 'ts',
    createdAt: '2026-07-15T00:00:00Z',
  } as GateVerdict;
}

function fakeGate(effect: GovernanceEffect): GovernanceGate {
  return {
    async decide() {
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
}

const beadsDown: BeadsMemoryPort = {
  available: () => false,
  remember: () => undefined,
  recall: () => [],
  promote: () => false,
  note: () => false,
};

function candidate(): MemoryCandidate {
  return {
    candidateId: 'c1',
    scope: 'repo',
    title: 'fact',
    body: 'the box is 16GB',
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy: 'agent:1',
    proposedAt: '2026-07-15T00:00:00Z',
  };
}

function fakeRepo(): { repo: MemoryRepository; items: MemoryItem[]; candidates: MemoryCandidate[] } {
  const items: MemoryItem[] = [];
  const candidates: MemoryCandidate[] = [candidate()];
  const repo: MemoryRepository = {
    async listItems() {
      return items;
    },
    async getItem() {
      return null;
    },
    async upsertItem(_u, i) {
      items.push(i);
      return i;
    },
    async listCandidates() {
      return candidates;
    },
    async getCandidate(_u, id) {
      return candidates.find((c) => c.candidateId === id) ?? null;
    },
    async upsertCandidate(_u, c) {
      const idx = candidates.findIndex((x) => x.candidateId === c.candidateId);
      if (idx >= 0) candidates[idx] = c;
      else candidates.push(c);
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
  return { repo, items, candidates };
}

describe('createMemoryLifecycle.accept', () => {
  it('materializes a durable item on an allow verdict', async () => {
    const { repo, items } = fakeRepo();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      logger: silentLogger,
      now: () => '2026-07-15T12:00:00Z',
      newId: () => 'mi_1',
    });

    const result = await lifecycle.accept({ userId: 'u1', candidateId: 'c1', principal });
    expect(result.promoted).toBe(true);
    expect(result.memory?.memoryId).toBe('mi_1');
    expect(result.memory?.status).toBe('active');
    expect(result.memory?.acceptedBy).toBe('u1');
    expect(items).toHaveLength(1);
    expect(result.candidate.status).toBe('accepted');
  });

  it('does NOT materialize on a deny verdict (fail-closed, truthful)', async () => {
    const { repo, items, candidates } = fakeRepo();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('deny'),
      beads: beadsDown,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({ userId: 'u1', candidateId: 'c1', principal });
    expect(result.promoted).toBe(false);
    expect(result.memory).toBeUndefined();
    expect(items).toHaveLength(0);
    // Candidate untouched (still a proposal).
    expect(candidates[0]?.status).toBe('candidate_created');
    expect(result.verdict.effect).toBe('deny');
  });

  it('does NOT materialize on needs_approval (returns the approval gate)', async () => {
    const { repo, items } = fakeRepo();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('needs_approval'),
      beads: beadsDown,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({ userId: 'u1', candidateId: 'c1', principal });
    expect(result.promoted).toBe(false);
    expect(items).toHaveLength(0);
    expect(result.verdict.effect).toBe('needs_approval');
  });

  it('throws NOT_FOUND for an unknown candidate', async () => {
    const { repo } = fakeRepo();
    const lifecycle = createMemoryLifecycle({ repository: repo, gate: fakeGate('allow'), beads: beadsDown, logger: silentLogger });
    await expect(lifecycle.accept({ userId: 'u1', candidateId: 'nope', principal })).rejects.toThrow(/not found/i);
  });
});

describe('createMemoryLifecycle.reject', () => {
  it('marks the candidate rejected with a reason', async () => {
    const { repo, candidates } = fakeRepo();
    const lifecycle = createMemoryLifecycle({ repository: repo, gate: fakeGate('allow'), beads: beadsDown, logger: silentLogger });
    const result = await lifecycle.reject({ userId: 'u1', candidateId: 'c1', principal, reason: 'stale' });
    expect(result.candidate.status).toBe('rejected');
    expect(result.candidate.reviewReason).toBe('stale');
    expect(candidates[0]?.status).toBe('rejected');
  });

  it('requires a reason', async () => {
    const { repo } = fakeRepo();
    const lifecycle = createMemoryLifecycle({ repository: repo, gate: fakeGate('allow'), beads: beadsDown, logger: silentLogger });
    await expect(lifecycle.reject({ userId: 'u1', candidateId: 'c1', principal, reason: '  ' })).rejects.toThrow();
  });
});
