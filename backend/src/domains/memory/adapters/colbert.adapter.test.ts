/**
 * colbert.adapter — the REAL MaxSim rerank path into retrieval (GAP-AUDIT Wave 8).
 *
 * The py sidecar's `/rerank` returns `{ results: [{ index, score }] }` sorted
 * best-first (late-interaction MaxSim). These tests prove the domain adapter:
 *  - reorders candidates by ColBERT order AND carries the real MaxSim score onto
 *    each candidate (so `RetrievalEngine` passages reflect late-interaction
 *    relevance, not just vector similarity), and
 *  - degrades truthfully: no URL / non-2xx / malformed body → identity order with
 *    the candidates' original vector score preserved (never a fabricated rank).
 * The sidecar fetch is injected — no network is touched.
 */
import { describe, it, expect } from 'vitest';
import type { RerankCandidate } from '@recoder/retrieval';
import type { MemoryConfig } from '../config.js';
import { memoryConfigSchema } from '../config.js';
import type { ColbertFetch, ColbertHttpResponse } from './colbert-sidecar.client.js';
import { createColbertAdapter } from './colbert.adapter.js';

function config(colbertRerankUrl: string | null): MemoryConfig {
  return memoryConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    qdrantUrl: null,
    qdrantApiKeyPresent: false,
    qdrantApiKey: null,
    mem0Collection: 'recoder_mem0',
    retrievalCollection: 'recoder_retrieval',
    colbertRerankUrl,
    mem0SidecarUrl: null,
    embedTensorzeroUrl: null,
    embedTensorzeroApiKeyPresent: false,
    embedTensorzeroApiKey: null,
    embedOpenaiApiKeyPresent: false,
    embedOpenaiApiKey: null,
    embedOpenaiBaseUrl: null,
    embedEndpoint: null,
    embedModel: 'text-embedding-3-small',
    dedupeThreshold: 0.9,
    recallLimit: 8,
    candidateTtlDays: 30,
  });
}

/** A ColbertFetch that returns a canned JSON body with the given HTTP status. */
function fetchWith(body: unknown, ok = true, status = 200): ColbertFetch {
  return async (): Promise<ColbertHttpResponse> => ({ ok, status, json: async () => body });
}

const candidates: RerankCandidate[] = [
  { id: 'a', text: 'alpha passage', score: 0.9 },
  { id: 'b', text: 'beta passage', score: 0.8 },
  { id: 'c', text: 'gamma passage', score: 0.7 },
];

describe('colbert.adapter reranker (real MaxSim into retrieval)', () => {
  it('reorders by ColBERT order and carries the real MaxSim score onto each candidate', async () => {
    // Sidecar ranks index 2 (gamma) best, then 0 (alpha), then 1 (beta).
    const body = { results: [{ index: 2, score: 42.5 }, { index: 0, score: 30.1 }, { index: 1, score: 10.0 }] };
    const { reranker } = createColbertAdapter(config('http://127.0.0.1:8893'), fetchWith(body));

    const out = await reranker.rerank('q', candidates);
    expect(out.map((c) => c.id)).toEqual(['c', 'a', 'b']); // ColBERT order
    // Scores are the REAL MaxSim, not the original vector scores (0.7/0.9/0.8).
    expect(out.map((c) => c.score)).toEqual([42.5, 30.1, 10.0]);
    // Candidate objects are new (immutable) — the input is untouched.
    expect(candidates[2].score).toBe(0.7);
  });

  it('rerankPassages surfaces available:true with the aligned MaxSim scores', async () => {
    const body = { results: [{ index: 1, score: 5 }, { index: 0, score: 3 }] };
    const adapter = createColbertAdapter(config('http://127.0.0.1:8893'), fetchWith(body));
    const result = await adapter.rerankPassages('q', ['first', 'second']);
    expect(result.available).toBe(true);
    expect(result.order).toEqual([1, 0]);
    expect(result.passages).toEqual(['second', 'first']);
    expect(result.scores).toEqual([5, 3]);
  });

  it('degrades to identity (vector scores preserved) when no URL is configured', async () => {
    const { reranker } = createColbertAdapter(config(null));
    expect(reranker.kind).toBe('identity');
    const out = await reranker.rerank('q', candidates);
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((c) => c.score)).toEqual([0.9, 0.8, 0.7]); // untouched vector scores
  });

  it('degrades to identity on a non-2xx sidecar response (no fabricated rank)', async () => {
    const { reranker } = createColbertAdapter(config('http://127.0.0.1:8893'), fetchWith({}, false, 503));
    const out = await reranker.rerank('q', candidates);
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((c) => c.score)).toEqual([0.9, 0.8, 0.7]);
  });

  it('degrades to identity on a malformed body (wrong length / missing index)', async () => {
    const { reranker } = createColbertAdapter(
      config('http://127.0.0.1:8893'),
      fetchWith({ results: [{ index: 0, score: 1 }] }), // length 1 != 3
    );
    const out = await reranker.rerank('q', candidates);
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('reorders on an order-only body but keeps vector scores when scores are absent', async () => {
    const body = { results: [{ index: 2 }, { index: 0 }, { index: 1 }] }; // no score fields
    const { reranker } = createColbertAdapter(config('http://127.0.0.1:8893'), fetchWith(body));
    const out = await reranker.rerank('q', candidates);
    expect(out.map((c) => c.id)).toEqual(['c', 'a', 'b']); // still reordered
    expect(out.map((c) => c.score)).toEqual([0.7, 0.9, 0.8]); // original vector scores kept
  });
});
