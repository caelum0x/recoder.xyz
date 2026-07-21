/**
 * mem0 write→read LOOP-CLOSURE regression-lock (fusion C5).
 *
 * Pins the LANDED behavior so a future refactor cannot silently reopen the loop:
 * a governed promotion (`memory-lifecycle.accept` on an `allow` verdict) fires
 * `mem0.add`, and `recall.recall` reads that exact fact back — through ONE shared
 * in-memory `Mem0Port` fake, the only state the two services share.
 *
 * CRITIC-FIX (scope framing): mem0 filters a search by its IDENTITY dimensions
 * (`user_id` / `agent_id` / `run_id`) ONLY. `metadata.scope` is NEVER a search
 * filter. The governed write is `userId`-scoped, so:
 *  - a read at the SAME userId returns the write (loop closes);
 *  - a read at a DIFFERENT userId does NOT (tenant isolation by identity);
 *  - a read whose `query.scope` differs from the written `metadata.scope` STILL
 *    returns it (metadata.scope is inert to the filter).
 *
 * The fake honors agentId/runId too (the other identity filters), documenting the
 * full contract even though the current promotion write sets only `userId`.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { GateVerdict, GovernanceEffect } from '../../governance/types.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { Mem0Port, Mem0Scope } from '../ports/mem0.port.js';
import type { MemoryConfig } from '../config.js';
import type { PassageReranker } from './rank.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import { createMemoryLifecycle } from '../lifecycle/memory-lifecycle.js';
import { createRecallService } from './recall-fusion.js';

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

const baseConfig = {
  dedupeThreshold: 0.9,
  recallLimit: 8,
  mem0Collection: 'recoder_mem0',
} as unknown as MemoryConfig;

/** Identity reranker (colbert sidecar down) — preserves fused order. */
const identityReranker: PassageReranker = {
  async rerankPassages(_q, passages) {
    return { available: false, order: passages.map((_p, i) => i) };
  },
};

function verdict(effect: GovernanceEffect): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'medium',
    reason: `test ${effect}`,
    degraded: false,
    engine: 'ts',
    createdAt: '2026-07-21T00:00:00Z',
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

/**
 * ONE shared in-memory mem0 fake. `add` distils the turns into a record keyed by
 * the identity scope; `search` filters by user/agent/run ONLY — metadata.scope is
 * deliberately ignored (it is NOT a mem0 search filter).
 */
function sharedMem0(): { port: Mem0Port; size: () => number } {
  interface Entry {
    id: string;
    userId: string;
    agentId?: string;
    runId?: string;
    memory: string;
    metadata?: Readonly<Record<string, unknown>>;
  }
  const store: Entry[] = [];
  let seq = 0;
  const port: Mem0Port = {
    async add(messages, scope: Mem0Scope) {
      store.push({
        id: `mem0_${++seq}`,
        userId: scope.userId,
        ...(scope.agentId ? { agentId: scope.agentId } : {}),
        ...(scope.runId ? { runId: scope.runId } : {}),
        memory: messages.map(m => m.content).join(' — '),
        ...(scope.metadata ? { metadata: scope.metadata } : {}),
      });
      return { ok: true };
    },
    async search(_query, scope: Mem0Scope) {
      // Identity-scoped ONLY. `scope.metadata` (carrying query.scope) is inert here.
      return store
        .filter(e => e.userId === scope.userId)
        .filter(e => !scope.agentId || e.agentId === scope.agentId)
        .filter(e => !scope.runId || e.runId === scope.runId)
        .map(e => ({ id: e.id, memory: e.memory }));
    },
    async health() {
      return { available: true, mode: 'oss' };
    },
  };
  return { port, size: () => store.length };
}

function candidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    candidateId: 'c1',
    scope: 'repo',
    title: 'server capacity',
    body: 'the box is 16GB no GPU',
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy: 'agent:1',
    proposedAt: '2026-07-21T00:00:00Z',
    ...overrides,
  };
}

/** A store-of-record repo seeded with a candidate (the lifecycle write side). */
function lifecycleRepo(seed: MemoryCandidate = candidate()): MemoryRepository {
  const items: MemoryItem[] = [];
  const candidates: MemoryCandidate[] = [seed];
  return {
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
}

/**
 * An EMPTY store-of-record repo for the recall read side. Because it has no items
 * / candidates, the ONLY source that can surface the promoted fact is mem0 — so a
 * `mem0` provenance on the recalled memory proves recall read what promotion wrote.
 */
function emptyRepo(): MemoryRepository {
  return {
    async listItems() {
      return [];
    },
    async getItem() {
      return null;
    },
    async upsertItem(_u, i) {
      return i;
    },
    async listCandidates() {
      return [];
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
}

function recallOver(mem0: Mem0Port) {
  return createRecallService({
    mem0,
    beads: fakeIssueGraph(), // bd down → contributes nothing (degrade-truthful)
    repository: emptyRepo(),
    reranker: identityReranker,
    config: baseConfig,
    logger: silentLogger,
  });
}

describe('mem0 write→read loop closure (governed promotion → recall)', () => {
  it('recall reads back the fact a governed ALLOW promotion wrote into mem0', async () => {
    const mem0 = sharedMem0();
    const lifecycle = createMemoryLifecycle({
      repository: lifecycleRepo(),
      gate: fakeGate('allow'),
      beads: fakeIssueGraph(),
      mem0: mem0.port,
      logger: silentLogger,
      newId: () => 'mi_1',
    });

    const accepted = await lifecycle.accept({
      userId: 'u1',
      candidateId: 'c1',
      principal,
    });
    expect(accepted.promoted).toBe(true);
    expect(mem0.size()).toBe(1); // the ALLOW verdict fired mem0.add exactly once

    // Same userId → the loop closes: the promoted fact returns with mem0 provenance.
    const result = await recallOver(mem0.port).recall({
      query: 'how much memory does the box have',
      userId: 'u1',
    });
    const mem0Mem = result.memories.find(m => m.provenance.source === 'mem0');
    expect(mem0Mem).toBeDefined();
    expect(mem0Mem?.body).toContain('the box is 16GB no GPU');
    expect(result.sources.find(s => s.source === 'mem0')?.available).toBe(true);
  });

  it('does NOT surface the fact to a different userId (tenant isolation by identity)', async () => {
    const mem0 = sharedMem0();
    const lifecycle = createMemoryLifecycle({
      repository: lifecycleRepo(),
      gate: fakeGate('allow'),
      beads: fakeIssueGraph(),
      mem0: mem0.port,
      logger: silentLogger,
      newId: () => 'mi_1',
    });
    await lifecycle.accept({ userId: 'u1', candidateId: 'c1', principal });

    // A different tenant recalls: mem0 filters by user_id, so nothing crosses over.
    const result = await recallOver(mem0.port).recall({
      query: 'how much memory does the box have',
      userId: 'u2',
    });
    expect(result.memories.some(m => m.provenance.source === 'mem0')).toBe(false);
    expect(result.memories).toHaveLength(0);
  });

  it('still surfaces the fact when the read scope differs from the written metadata.scope (scope is not a mem0 filter)', async () => {
    const mem0 = sharedMem0();
    const lifecycle = createMemoryLifecycle({
      repository: lifecycleRepo(candidate({ scope: 'repo' })), // metadata.scope = 'repo'
      gate: fakeGate('allow'),
      beads: fakeIssueGraph(),
      mem0: mem0.port,
      logger: silentLogger,
      newId: () => 'mi_1',
    });
    await lifecycle.accept({ userId: 'u1', candidateId: 'c1', principal });

    // Recall at a DIFFERENT scope ('global'): mem0 keys on userId only, so the
    // 'repo'-scoped write still returns. metadata.scope never narrows the read.
    const result = await recallOver(mem0.port).recall({
      query: 'how much memory does the box have',
      userId: 'u1',
      scope: 'global',
    });
    const mem0Mem = result.memories.find(m => m.provenance.source === 'mem0');
    expect(mem0Mem).toBeDefined();
    expect(mem0Mem?.body).toContain('the box is 16GB no GPU');
  });

  it('writes nothing to mem0 on a denied promotion — recall stays empty (no fact to read back)', async () => {
    const mem0 = sharedMem0();
    const lifecycle = createMemoryLifecycle({
      repository: lifecycleRepo(),
      gate: fakeGate('deny'),
      beads: fakeIssueGraph(),
      mem0: mem0.port,
      logger: silentLogger,
    });

    const denied = await lifecycle.accept({ userId: 'u1', candidateId: 'c1', principal });
    expect(denied.promoted).toBe(false);
    expect(mem0.size()).toBe(0);

    const result = await recallOver(mem0.port).recall({
      query: 'how much memory does the box have',
      userId: 'u1',
    });
    expect(result.memories.some(m => m.provenance.source === 'mem0')).toBe(false);
  });
});
