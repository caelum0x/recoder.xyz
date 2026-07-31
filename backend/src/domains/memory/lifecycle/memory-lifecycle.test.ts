/**
 * lifecycle/memory-lifecycle tests — the governance gate is the SOLE authority
 * over durable promotion: a non-allow verdict must NOT materialize an item.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict, GovernanceEffect } from '../../governance/types.js';
import type { MemoryRepository, MemoryCandidateItemStore } from '../ports/memory-repository.port.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { IssueGraphService } from '../ports/issue-graph.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import type { Mem0Message, Mem0Port, Mem0Scope } from '../ports/mem0.port.js';
import { createMemoryLifecycle } from './memory-lifecycle.js';
import { createMemoryRepository } from '../adapters/candidate-repository.adapter.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() {
    return silentLogger;
  },
} as never;

const principal: Principal = {
  userId: 'u1',
  scopes: [],
  kind: 'session',
  isAnonymous: false,
  raw: {},
} as unknown as Principal;

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
      return {
        outcome: 'allowed',
        reason: 'ok',
        degraded: false,
        engine: 'ts',
      } as never;
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

const beadsDown: IssueGraphService = fakeIssueGraph();

/** A live fake mem0 port that records every add(messages, scope). */
function mem0Up(): {
  port: Mem0Port;
  added: { messages: readonly Mem0Message[]; scope: Mem0Scope }[];
} {
  const added: { messages: readonly Mem0Message[]; scope: Mem0Scope }[] = [];
  const port: Mem0Port = {
    async search() {
      return [];
    },
    async add(messages, scope) {
      added.push({ messages, scope });
      return { ok: true };
    },
    async health() {
      return { available: true, mode: 'oss' };
    },
  };
  return { port, added };
}

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    candidateId: 'c1',
    scope: 'repo',
    title: 'fact',
    body: 'the box is 16GB',
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy: 'agent:1',
    proposedAt: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

/** A live fake issue-graph facet that records which ids get promoted (+ actor). */
function beadsUp(): {
  port: IssueGraphService;
  promoted: { id: string; actor: string }[];
} {
  const promoted: { id: string; actor: string }[] = [];
  const port = fakeIssueGraph({
    health: async () => ({ available: true }),
    remember: async () => 'bd-unused',
    promote: async (id, actor) => {
      promoted.push({ id, actor });
      return true;
    },
  });
  return { port, promoted };
}

function fakeRepo(seed: MemoryCandidate = candidate()): {
  repo: MemoryRepository;
  items: MemoryItem[];
  candidates: MemoryCandidate[];
} {
  const items: MemoryItem[] = [];
  const candidates: MemoryCandidate[] = [seed];
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
      return candidates.find(c => c.candidateId === id) ?? null;
    },
    async upsertCandidate(_u, c) {
      const idx = candidates.findIndex(x => x.candidateId === c.candidateId);
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

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
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

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
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

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    expect(result.promoted).toBe(false);
    expect(items).toHaveLength(0);
    expect(result.verdict.effect).toBe('needs_approval');
  });

  it('promotes the beads wisp by its bd-issued id, never the local candidateId', async () => {
    const { repo } = fakeRepo(candidate({ beadsRef: 'bd-42' }));
    const beads = beadsUp();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beads.port,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    expect(result.promoted).toBe(true);
    // The bd id captured at propose time — NOT the locally-minted 'c1'/'mc_' id;
    // the reviewing principal is threaded as the bd audit-trail actor.
    expect(beads.promoted).toEqual([{ id: 'bd-42', actor: 'u1' }]);
  });

  it('skips beads promote when the candidate carries no beadsRef (still materializes)', async () => {
    const { repo, items } = fakeRepo(candidate()); // no beadsRef: bd was down at propose
    const beads = beadsUp();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beads.port,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    // Durable store-of-record promotion still happens; no bogus bd promote issued.
    expect(result.promoted).toBe(true);
    expect(items).toHaveLength(1);
    expect(beads.promoted).toEqual([]);
  });

  it('throws NOT_FOUND for an unknown candidate', async () => {
    const { repo } = fakeRepo();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      logger: silentLogger,
    });
    await expect(
      lifecycle.accept({ userId: 'u1', candidateId: 'nope', principal })
    ).rejects.toThrow(/not found/i);
  });

  it('mirrors the accepted durable fact into mem0 (closes the write-half loop)', async () => {
    const { repo, items } = fakeRepo();
    const mem0 = mem0Up();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      mem0: mem0.port,
      logger: silentLogger,
      newId: () => 'mi_1',
    });

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    expect(result.promoted).toBe(true);
    // The fusion FIRED: mem0.add got the tenant-scoped fact from the accepted candidate.
    expect(mem0.added).toHaveLength(1);
    expect(mem0.added[0]?.scope.userId).toBe('u1');
    expect(mem0.added[0]?.scope.metadata?.memoryId).toBe('mi_1');
    expect(mem0.added[0]?.messages.map(m => m.content)).toContain(
      'the box is 16GB'
    );
  });

  it('mirrors the supersedes link into the mem0 add scope metadata', async () => {
    const { repo } = fakeRepo();
    // addRelation throws in fakeRepo; the mem0 mirror must still fire (best-effort edge).
    const mem0 = mem0Up();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      mem0: mem0.port,
      logger: silentLogger,
      newId: () => 'mi_1',
    });

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
      supersedesMemoryId: 'mi_old',
    });
    expect(result.promoted).toBe(true);
    expect(mem0.added[0]?.scope.metadata?.supersedesMemoryId).toBe('mi_old');
  });

  it('still promotes when the mem0 mirror throws (best-effort, never blocks)', async () => {
    const { repo, items } = fakeRepo();
    const throwingMem0: Mem0Port = {
      async search() {
        return [];
      },
      async add() {
        throw new Error('mem0 exploded');
      },
      async health() {
        return { available: true, mode: 'oss' };
      },
    };
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      mem0: throwingMem0,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    expect(result.promoted).toBe(true);
    expect(items).toHaveLength(1);
  });

  it('does NOT write mem0 on a denied promotion (no durable fact to mirror)', async () => {
    const { repo } = fakeRepo();
    const mem0 = mem0Up();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('deny'),
      beads: beadsDown,
      mem0: mem0.port,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    expect(result.promoted).toBe(false);
    expect(mem0.added).toHaveLength(0);
  });
});

describe('createMemoryLifecycle.reject', () => {
  it('marks the candidate rejected with a reason', async () => {
    const { repo, candidates } = fakeRepo();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      logger: silentLogger,
    });
    const result = await lifecycle.reject({
      userId: 'u1',
      candidateId: 'c1',
      principal,
      reason: 'stale',
    });
    expect(result.candidate.status).toBe('rejected');
    expect(result.candidate.reviewReason).toBe('stale');
    expect(candidates[0]?.status).toBe('rejected');
  });

  it('requires a reason', async () => {
    const { repo } = fakeRepo();
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: fakeGate('allow'),
      beads: beadsDown,
      logger: silentLogger,
    });
    await expect(
      lifecycle.reject({
        userId: 'u1',
        candidateId: 'c1',
        principal,
        reason: '  ',
      })
    ).rejects.toThrow();
  });
});

// --- Cross-tenant accept/reject over the REAL owner-bound adapter (IDOR #3) ----

/** Relations are untouched here — an unavailable pool is fine. */
const idleQuery: QueryExecutor = {
  async execute() {
    return [];
  },
  async one() {
    return null;
  },
  async read() {
    return [];
  },
  async mutate() {
    return 0;
  },
  async withTransaction(fn) {
    return fn(idleQuery);
  },
  isAvailable() {
    return false;
  },
} as unknown as QueryExecutor;

/** The GLOBAL agent-os store (unscoped) — the adapter is what constrains by owner. */
function fakeStore(seed: MemoryCandidate[]): {
  store: MemoryCandidateItemStore;
  items: MemoryItem[];
  candidates: MemoryCandidate[];
} {
  const items: MemoryItem[] = [];
  const candidates: MemoryCandidate[] = [...seed];
  const store: MemoryCandidateItemStore = {
    listMemoryItems() {
      return items;
    },
    upsertMemoryItem(m) {
      items.push(m);
      return m;
    },
    listMemoryCandidates() {
      return candidates;
    },
    upsertMemoryCandidate(c) {
      const idx = candidates.findIndex((x) => x.candidateId === c.candidateId);
      if (idx >= 0) candidates[idx] = c;
      else candidates.push(c);
      return c;
    },
  };
  return { store, items, candidates };
}

/** A gate that counts `decide` calls so we can prove it is never consulted for an IDOR. */
function countingGate(effect: GovernanceEffect): { gate: GovernanceGate; decideCalls: number; auditCalls: number } {
  const state = { decideCalls: 0, auditCalls: 0 };
  const gate: GovernanceGate = {
    async decide() {
      state.decideCalls += 1;
      return verdict(effect);
    },
    async enforceTool() {
      return { outcome: 'allowed', reason: 'ok', degraded: false, engine: 'ts' } as never;
    },
    async route() {
      return { routable: true, tier: 'low', reason: 'ok' } as never;
    },
    async recordAudit() {
      state.auditCalls += 1;
      return {} as never;
    },
    async verifyAudit() {
      return {} as never;
    },
  };
  return {
    gate,
    get decideCalls() {
      return state.decideCalls;
    },
    get auditCalls() {
      return state.auditCalls;
    },
  };
}

function principalFor(userId: string, scopes: readonly string[] = [], kind = 'session'): Principal {
  return { userId, scopes, kind, isAnonymous: false, raw: {} } as unknown as Principal;
}

/** A candidate owned by user A (proposedBy is the proposer's userId). */
const ownedByA = candidate({ candidateId: 'cA', proposedBy: 'userA', title: 'A secret', body: 'A body' });

describe('createMemoryLifecycle.accept — cross-tenant is NOT_FOUND (IDOR #3)', () => {
  it('the owner can promote their own candidate', async () => {
    const { store, items } = fakeStore([ownedByA]);
    const repo = createMemoryRepository({ query: idleQuery, store });
    const mem0 = mem0Up();
    const g = countingGate('allow');
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: g.gate,
      beads: beadsDown,
      mem0: mem0.port,
      logger: silentLogger,
    });

    const result = await lifecycle.accept({
      userId: 'userA',
      candidateId: 'cA',
      principal: principalFor('userA'),
    });
    expect(result.promoted).toBe(true);
    expect(items).toHaveLength(1);
    expect(mem0.added).toHaveLength(1);
    expect(g.decideCalls).toBe(1);
  });

  it('another tenant gets NOT_FOUND before the gate + performs no materialize/mem0 write', async () => {
    const { store, items } = fakeStore([ownedByA]);
    const repo = createMemoryRepository({ query: idleQuery, store });
    const mem0 = mem0Up();
    const g = countingGate('allow');
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: g.gate,
      beads: beadsDown,
      mem0: mem0.port,
      logger: silentLogger,
    });

    await expect(
      lifecycle.accept({ userId: 'userB', candidateId: 'cA', principal: principalFor('userB') })
    ).rejects.toThrow(/not found/i);
    // The gate was never consulted, and nothing was materialized or mirrored.
    expect(g.decideCalls).toBe(0);
    expect(items).toHaveLength(0);
    expect(mem0.added).toHaveLength(0);
  });

  it('an admin operator may promote another tenant candidate (privileged bypass)', async () => {
    const { store, items } = fakeStore([ownedByA]);
    const repo = createMemoryRepository({ query: idleQuery, store });
    const g = countingGate('allow');
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: g.gate,
      beads: beadsDown,
      logger: silentLogger,
    });
    const result = await lifecycle.accept({
      userId: 'operator',
      candidateId: 'cA',
      principal: principalFor('operator', ['admin']),
    });
    expect(result.promoted).toBe(true);
    expect(items).toHaveLength(1);
  });

  it('fails open under solo mode (single local owner)', async () => {
    const { store, items } = fakeStore([ownedByA]);
    const repo = createMemoryRepository({ query: idleQuery, store });
    const g = countingGate('allow');
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: g.gate,
      beads: beadsDown,
      logger: silentLogger,
      soloMode: true,
    });
    const result = await lifecycle.accept({
      userId: 'solo-user',
      candidateId: 'cA',
      principal: principalFor('solo-user'),
    });
    expect(result.promoted).toBe(true);
    expect(items).toHaveLength(1);
  });
});

describe('createMemoryLifecycle.reject — cross-tenant is NOT_FOUND (IDOR #3)', () => {
  it('another tenant gets NOT_FOUND and does not mutate the candidate', async () => {
    const { store, candidates } = fakeStore([ownedByA]);
    const repo = createMemoryRepository({ query: idleQuery, store });
    const g = countingGate('allow');
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: g.gate,
      beads: beadsDown,
      logger: silentLogger,
    });
    await expect(
      lifecycle.reject({
        userId: 'userB',
        candidateId: 'cA',
        principal: principalFor('userB'),
        reason: 'not mine to reject',
      })
    ).rejects.toThrow(/not found/i);
    // No audit seal was written and the candidate is untouched.
    expect(g.auditCalls).toBe(0);
    expect(candidates[0]?.status).toBe('candidate_created');
  });

  it('the owner can reject their own candidate', async () => {
    const { store, candidates } = fakeStore([ownedByA]);
    const repo = createMemoryRepository({ query: idleQuery, store });
    const g = countingGate('allow');
    const lifecycle = createMemoryLifecycle({
      repository: repo,
      gate: g.gate,
      beads: beadsDown,
      logger: silentLogger,
    });
    const result = await lifecycle.reject({
      userId: 'userA',
      candidateId: 'cA',
      principal: principalFor('userA'),
      reason: 'stale',
    });
    expect(result.candidate.status).toBe('rejected');
    expect(candidates[0]?.status).toBe('rejected');
  });
});
