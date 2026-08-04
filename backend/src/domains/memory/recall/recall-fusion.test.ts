/**
 * recall/recall-fusion tests (TDD) — the union → rerank → dedupe → provenance
 * pipeline and its truth invariants under partial-source degradation.
 */
import { describe, it, expect } from 'vitest';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import { createRecallService, type RecallServiceDeps } from './recall-fusion.js';
import type { Mem0Port } from '../ports/mem0.port.js';
import type { IssueGraphService } from '../ports/issue-graph.port.js';
import { fakeIssueGraph } from '../__fixtures__/issue-graph.fixture.js';
import type { MemoryRepository } from '../ports/memory-repository.port.js';
import type { ColbertSearchPort, ColbertSearchHit } from '../ports/colbert-search.port.js';
import type { PassageReranker } from './rank.js';
import type { MemoryConfig } from '../config.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } } as unknown as RecallServiceDeps['logger'];

const baseConfig = { dedupeThreshold: 0.9, recallLimit: 8 } as unknown as MemoryConfig;

/** A mem0 port that returns fixed results and reports itself available. */
function fakeMem0(results: { id: string; memory: string; score?: number }[], available = true): Mem0Port {
  return {
    async search() {
      return results;
    },
    async add() {
      return { ok: true };
    },
    async health() {
      return available ? { available: true, mode: 'oss' } : { available: false, mode: 'none', reason: 'no provider' };
    },
  };
}

/** An issue-graph facet with a fixed availability + recall set. */
function fakeBeads(entries: { id: string; title: string; body: string }[], available = true): IssueGraphService {
  return fakeIssueGraph({
    health: async () =>
      available ? { available: true } : { available: false, reason: 'bd binary/DB unavailable' },
    recallMemories: async () =>
      available ? entries.map((e) => ({ ...e, status: 'open', labels: ['memory'] })) : [],
  });
}

function candidate(id: string, title: string, body: string, scope = 'repo'): MemoryCandidate {
  return {
    candidateId: id,
    scope: scope as MemoryCandidate['scope'],
    title,
    body,
    status: 'candidate_created',
    evidence: { taskId: 't1', artifactId: 'a1' },
    proposedBy: 'agent:1',
    proposedAt: '2026-07-15T00:00:00Z',
  };
}

function item(id: string, title: string, body: string, scope = 'repo'): MemoryItem {
  return {
    memoryId: id,
    scope: scope as MemoryItem['scope'],
    title,
    body,
    status: 'active',
    evidence: { taskId: 't1', artifactId: 'a1' },
    createdAt: '2026-07-15T00:00:00Z',
    acceptedBy: 'human:1',
  };
}

/** A repository stub exposing only the recall-read methods. */
function fakeRepo(over: { candidates?: MemoryCandidate[]; items?: MemoryItem[] } = {}): MemoryRepository {
  return {
    async listItems() {
      return over.items ?? [];
    },
    async getItem() {
      return null;
    },
    async upsertItem(_u, i) {
      return i;
    },
    async listCandidates() {
      return over.candidates ?? [];
    },
    async getCandidate() {
      return null;
    },
    async upsertCandidate(_u, c) {
      return c;
    },
    async addRelation() {
      throw new Error('not used');
    },
    async listRelations() {
      return [];
    },
    async deleteRelation() {
      return false;
    },
  };
}

/** A colbert search port that returns fixed hits and reports itself configured. */
function fakeColbertSearch(hits: ColbertSearchHit[], available = true, configured = true): ColbertSearchPort {
  return {
    configured: () => configured,
    async search() {
      return available ? { available: true, hits } : { available: false, hits: [], reason: 'index not built' };
    },
    async ensureIndex(collection, passages) {
      return { built: true, collection, documents: passages.length };
    },
  };
}

/** Identity reranker (sidecar down). */
const identityReranker: PassageReranker = {
  async rerankPassages(_q, passages) {
    return { available: false, order: passages.map((_p, i) => i) };
  },
};

/** A reranker that reverses order (proves rerank drives ordering, not score). */
function reversingReranker(): PassageReranker {
  return {
    async rerankPassages(_q, passages) {
      return { available: true, order: passages.map((_p, i) => passages.length - 1 - i) };
    },
  };
}

function deps(over: Partial<RecallServiceDeps>): RecallServiceDeps {
  return {
    mem0: fakeMem0([]),
    beads: fakeBeads([], false),
    repository: fakeRepo(),
    reranker: identityReranker,
    config: baseConfig,
    logger: silentLogger,
    ...over,
  };
}

describe('createRecallService.recall', () => {
  it('fuses mem0 ∪ beads ∪ candidates ∪ items with truthful provenance', async () => {
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([{ id: 'm1', memory: 'prefers pm2 deploy', score: 0.8 }]),
        beads: fakeBeads([{ id: 'bd-1', title: 'nginx', body: 'nginx config lives in conf.d' }]),
        repository: fakeRepo({
          candidates: [candidate('c1', 'qdrant', 'qdrant runs on the box')],
          items: [item('i1', 'postgres', 'postgres 17 is the database')],
        }),
      }),
    );

    const result = await svc.recall({ query: 'deploy pm2 nginx qdrant postgres', userId: 'u1' });

    const bySource = new Map(result.memories.map((m) => [m.provenance.source, m]));
    expect(bySource.get('mem0')?.provenance.ref).toBe('m1');
    expect(bySource.get('beads')?.provenance.ref).toBe('bd-1');
    expect(bySource.get('candidates')?.provenance.ref).toBe('c1');
    expect(bySource.get('items')?.provenance.ref).toBe('i1');
    // The four legacy sources reported available; colbert is truthfully down when
    // no search port is wired (degrade-truthful, contributes zero).
    const avail = new Map(result.sources.map((s) => [s.source, s.available]));
    expect(avail.get('mem0')).toBe(true);
    expect(avail.get('beads')).toBe(true);
    expect(avail.get('candidates')).toBe(true);
    expect(avail.get('items')).toBe(true);
    expect(avail.get('colbert')).toBe(false);
    // ColBERT is down but the query overlaps the pool → the BM25-ish lexical
    // fallback ranks, and the degrade is carried truthfully in rerankerReason.
    expect(result.reranker).toBe('lexical');
    expect(result.rerankerReason).toContain('colbert reranker unavailable');
  });

  it('adds the colbert late-interaction source: its hits enter the fused recall', async () => {
    const svc = createRecallService(
      deps({
        // All legacy sources empty — only colbert can contribute.
        colbertSearch: fakeColbertSearch([
          { text: 'the ci runner uses buildkite on the box', score: 22.5, pid: 7, rank: 1 },
          { text: 'secrets live in the vault sidecar', score: 18.0, pid: 3, rank: 2 },
        ]),
      }),
    );

    const result = await svc.recall({ query: 'ci runner secrets', userId: 'u1' });

    const colbert = result.sources.find((s) => s.source === 'colbert');
    expect(colbert?.available).toBe(true);
    // The colbert-only hits are present in the fused recall with colbert provenance.
    const colbertMems = result.memories.filter((m) => m.provenance.source === 'colbert');
    expect(colbertMems.length).toBe(2);
    expect(colbertMems.map((m) => m.body)).toContain('the ci runner uses buildkite on the box');
    // Truthful relative confidence: the top hit normalizes to 1, the next is lower.
    const top = colbertMems.find((m) => m.body.startsWith('the ci runner'));
    expect(top?.provenance.score).toBeCloseTo(1, 5);
  });

  it('reports colbert down truthfully when its index is not built (zero fabricated memories)', async () => {
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([{ id: 'm1', memory: 'a real memory about deploys', score: 0.7 }]),
        colbertSearch: fakeColbertSearch([], false), // configured but index missing
      }),
    );

    const result = await svc.recall({ query: 'deploys', userId: 'u1' });
    const colbert = result.sources.find((s) => s.source === 'colbert');
    expect(colbert?.available).toBe(false);
    expect(colbert?.reason).toBe('index not built');
    expect(result.memories.some((m) => m.provenance.source === 'colbert')).toBe(false);
    // The other source still contributed.
    expect(result.memories.some((m) => m.provenance.source === 'mem0')).toBe(true);
  });

  it('reports a down source truthfully and contributes ZERO memories from it', async () => {
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([], false), // unconfigured
        beads: fakeBeads([], false), // bd missing
        repository: fakeRepo({ items: [item('i1', 'db', 'postgres is the database')] }),
      }),
    );

    const result = await svc.recall({ query: 'database postgres', userId: 'u1' });

    const mem0 = result.sources.find((s) => s.source === 'mem0');
    const beads = result.sources.find((s) => s.source === 'beads');
    expect(mem0?.available).toBe(false);
    expect(mem0?.reason).toBeTruthy();
    expect(beads?.available).toBe(false);
    // Only the item survived; nothing fabricated for the down sources.
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]?.provenance.source).toBe('items');
  });

  it('honors ColBERT rerank order over source score', async () => {
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([
          { id: 'm1', memory: 'alpha fact about deploys', score: 0.95 },
          { id: 'm2', memory: 'zeta fact about deploys', score: 0.1 },
        ]),
        reranker: reversingReranker(),
      }),
    );

    const result = await svc.recall({ query: 'deploys', userId: 'u1' });
    expect(result.reranker).toBe('colbert');
    // score-desc would put m1 first; the reversing reranker flips it.
    expect(result.memories[0]?.provenance.ref).toBe('m2');
    expect(result.memories[1]?.provenance.ref).toBe('m1');
  });

  it('dedupes the same fact arriving from two sources', async () => {
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([{ id: 'm1', memory: 'the database is postgres 17 on hetzner', score: 0.9 }]),
        repository: fakeRepo({ items: [item('i1', 'db', 'the database is postgres 17 on hetzner')] }),
        config: { dedupeThreshold: 0.8, recallLimit: 8 } as unknown as MemoryConfig,
      }),
    );

    const result = await svc.recall({ query: 'database postgres hetzner', userId: 'u1' });
    expect(result.memories).toHaveLength(1);
  });

  it('applies the recall limit after fusion', async () => {
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([
          { id: 'm1', memory: 'fact one about the topic', score: 0.9 },
          { id: 'm2', memory: 'different fact two topic', score: 0.8 },
          { id: 'm3', memory: 'another distinct fact topic', score: 0.7 },
        ]),
      }),
    );

    const result = await svc.recall({ query: 'topic', userId: 'u1', limit: 2 });
    expect(result.memories).toHaveLength(2);
  });

  it('fails fast on an empty query (no source calls, identity reranker)', async () => {
    const svc = createRecallService(deps({ mem0: fakeMem0([{ id: 'm1', memory: 'x' }]) }));
    const result = await svc.recall({ query: '   ', userId: 'u1' });
    expect(result.memories).toHaveLength(0);
    expect(result.sources.every((s) => !s.available)).toBe(true);
  });

  it('degrades that source only when a gather throws', async () => {
    const throwingRepo = fakeRepo();
    (throwingRepo as { listCandidates: () => Promise<never> }).listCandidates = async () => {
      throw new Error('pool down');
    };
    const svc = createRecallService(
      deps({
        mem0: fakeMem0([{ id: 'm1', memory: 'a usable memory about x', score: 0.7 }]),
        repository: throwingRepo,
      }),
    );

    const result = await svc.recall({ query: 'usable memory x', userId: 'u1' });
    const candidates = result.sources.find((s) => s.source === 'candidates');
    expect(candidates?.available).toBe(false);
    expect(candidates?.reason).toContain('pool down');
    // mem0 still contributed.
    expect(result.memories.some((m) => m.provenance.source === 'mem0')).toBe(true);
  });

  it('ranks a repo-matched lesson above a generic one AND preserves the degrade marker', async () => {
    const svc = createRecallService(
      deps({
        repository: fakeRepo({
          candidates: [
            candidate('generic', 'note', 'a generic lesson about deploys'),
            candidate('repo', 'note', 'On repoX, the deploys lesson kept pm2 restart'),
          ],
        }),
        // identityReranker (colbert down) but the query overlaps the pool → the
        // lexical fallback ranks and the degrade is carried in rerankerReason.
      }),
    );

    const result = await svc.recall({ query: 'deploys lesson', userId: 'u1', repoRef: '/srv/repoX' });

    // Cross-RUN scope boost lifts the repo-matched lesson to the top, tagged why.
    expect(result.memories[0]?.provenance.ref).toBe('repo');
    expect(result.memories[0]?.provenance.signals).toContain('repo-match');
    // The degrade-truthful rerank marker survives the boost (never clobbered).
    expect(result.reranker).toBe('lexical');
    expect(result.rerankerReason).toContain('colbert reranker unavailable');
  });

  it('applies a recency boost using the injected clock (fresh lesson outranks stale)', async () => {
    const now = Date.parse('2026-08-04T00:00:00Z');
    const freshCand: MemoryCandidate = {
      ...candidate('fresh', 'note', 'the deploys lesson swapfile cap'),
      proposedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // 1 day old
    };
    const staleCand: MemoryCandidate = {
      ...candidate('stale', 'note', 'the deploys lesson old pm2 note'),
      proposedAt: new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days old
    };
    const svc = createRecallService(
      deps({ repository: fakeRepo({ candidates: [staleCand, freshCand] }), clock: () => now }),
    );

    const result = await svc.recall({ query: 'deploys lesson', userId: 'u1' });

    expect(result.memories[0]?.provenance.ref).toBe('fresh');
    expect(result.memories[0]?.provenance.signals).toContain('recency');
  });
});
