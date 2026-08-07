/**
 * recall/cross-tenant-isolation — the SECURITY invariant of shared team memory
 * (thesis §7): memory compounds WITHIN a tenant, and NEVER crosses tenants.
 *
 * This wires the REAL recall fusion over the REAL candidate repository (the
 * owner-scope filter under test) against a shared agent-os candidate store that
 * holds two tenants' harvested lessons. It proves user A's lesson never surfaces
 * for user B — the `WHERE proposedBy = userId` guard in the recall path holds.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import { createRecallService } from './recall-fusion.js';
import { createMemoryRepository } from '../adapters/candidate-repository.adapter.js';
import type { MemoryCandidateItemStore } from '../ports/memory-repository.port.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { Mem0Port } from '../ports/mem0.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import type { PassageReranker } from './rank.js';
import type { MemoryConfig } from '../config.js';

const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; },
} as unknown as Parameters<typeof createRecallService>[0]['logger'];

const config = { dedupeThreshold: 0.9, recallLimit: 8, mem0Collection: 'c' } as unknown as MemoryConfig;

/** mem0 + beads both DOWN — only the candidate store can contribute. */
const downMem0: Mem0Port = {
  async search() { return []; },
  async add() { return { ok: true }; },
  async health() { return { available: false, mode: 'none', reason: 'off' }; },
};
const downBeads = fakeIssueGraph({
  health: async () => ({ available: false, reason: 'off' }),
  recallMemories: async () => [],
});
const identityReranker: PassageReranker = {
  async rerankPassages(_q, passages) { return { available: false, order: passages.map((_p, i) => i) }; },
};

/** A stub persistence executor — recall never touches relations, so it stays unavailable. */
const noQuery = { isAvailable: () => false } as unknown as QueryExecutor;

function candidate(id: string, proposedBy: string, body: string): MemoryCandidate {
  return {
    candidateId: id,
    scope: 'repo',
    title: id,
    body,
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy,
    proposedAt: '2026-07-01T00:00:00Z',
  };
}

/** A durable, accepted MemoryItem owned by `acceptedBy`. */
function item(memoryId: string, acceptedBy: string, body: string): MemoryItem {
  return {
    memoryId,
    scope: 'repo',
    title: memoryId,
    body,
    status: 'active',
    evidence: { taskId: 't1', artifactId: 'a1' },
    createdAt: '2026-07-01T00:00:00Z',
    acceptedBy,
  } as MemoryItem;
}

/** A shared, GLOBAL agent-os store holding BOTH tenants' harvested lessons. */
function sharedStore(candidates: MemoryCandidate[], items: MemoryItem[] = []): MemoryCandidateItemStore {
  return {
    listMemoryItems() { return items; },
    upsertMemoryItem(m) { return m; },
    listMemoryCandidates() { return candidates; },
    upsertMemoryCandidate(c) { return c; },
  };
}

describe('recall cross-tenant isolation', () => {
  const store = sharedStore([
    candidate('userA-lesson', 'userA', 'On repoX, always parameterize the auth query'),
    candidate('userB-lesson', 'userB', 'On repoX, always parameterize the auth query'),
  ]);
  const repository = createMemoryRepository({ query: noQuery, store });
  const recall = createRecallService({
    mem0: downMem0,
    beads: downBeads,
    repository,
    reranker: identityReranker,
    config,
    logger: silentLogger,
  });

  it("never surfaces user A's harvested lesson for user B (owner-scope gate holds)", async () => {
    const forB = await recall.recall({ query: 'parameterize auth query repoX', userId: 'userB' });

    const refs = forB.memories.map((m) => m.provenance.ref);
    expect(refs).toContain('userB-lesson');
    expect(refs).not.toContain('userA-lesson');
    // Every surfaced candidate is user B's own.
    expect(forB.memories.every((m) => m.provenance.source !== 'candidates' || m.provenance.ref === 'userB-lesson')).toBe(true);
  });

  it("symmetrically never surfaces user B's lesson for user A", async () => {
    const forA = await recall.recall({ query: 'parameterize auth query repoX', userId: 'userA' });
    const refs = forA.memories.map((m) => m.provenance.ref);
    expect(refs).toContain('userA-lesson');
    expect(refs).not.toContain('userB-lesson');
  });
});

describe('recall cross-tenant isolation — durable ITEMS (recoder-7lxx)', () => {
  const store = sharedStore(
    [],
    [
      item('userA-item', 'userA', 'On repoX, always parameterize the auth query'),
      item('userB-item', 'userB', 'On repoX, always parameterize the auth query'),
    ]
  );
  const repository = createMemoryRepository({ query: noQuery, store });
  const recall = createRecallService({
    mem0: downMem0,
    beads: downBeads,
    repository,
    reranker: identityReranker,
    config,
    logger: silentLogger,
  });

  it("never surfaces user A's durable memory item for user B", async () => {
    const forB = await recall.recall({ query: 'parameterize auth query repoX', userId: 'userB' });
    const refs = forB.memories.map((m) => m.provenance.ref);
    expect(refs).toContain('userB-item');
    expect(refs).not.toContain('userA-item'); // owner-scoped — no cross-tenant item leak
    expect(forB.memories.every((m) => m.provenance.source !== 'items' || m.provenance.ref === 'userB-item')).toBe(true);
  });
});
