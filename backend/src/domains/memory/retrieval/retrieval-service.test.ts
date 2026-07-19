/**
 * retrieval-service degrade-matrix tests — the DEGRADE CONTRACT (retrieval.port.ts):
 * with no embedder AND/OR no vector store configured, every operation returns a
 * truthful `not_configured` (never throws, never fabricates passages).
 *
 * These build the real `VectorFoundation` from an unconfigured `MemoryConfig`
 * (no Qdrant URL, no embedder key, no ColBERT, no mem0) — the exact fresh-checkout
 * state — and assert the facade stays honest rather than faking success.
 */
import { describe, it, expect } from 'vitest';
import { memoryConfigSchema, type MemoryConfig } from '../config.js';
import type { FetchLike } from '../vector-store.js';
import type { ColbertSearchHit, ColbertSearchPort } from '../ports/colbert-search.port.js';
import { createVectorFoundation } from './vector-foundation.js';
import { createRetrievalService } from './retrieval-service.js';

/** An unconfigured memory slice: no vector store, no embedder, no rerank, no mem0. */
function bareConfig(): MemoryConfig {
  return memoryConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    qdrantUrl: null,
    qdrantApiKeyPresent: false,
    qdrantApiKey: null,
    mem0Collection: 'recoder_mem0',
    retrievalCollection: 'recoder_retrieval',
    colbertRerankUrl: null,
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

function bareService() {
  const foundation = createVectorFoundation({ config: bareConfig() });
  return { foundation, service: createRetrievalService({ foundation }) };
}

describe('retrieval-service degrade matrix (no qdrant / no embedder / no colbert / no mem0)', () => {
  it('reports not configured when neither embedder nor vector store is wired', () => {
    const { foundation, service } = bareService();
    expect(foundation.configured).toBe(false);
    expect(service.configured()).toBe(false);
  });

  it('search over an unconfigured stack returns a truthful not_configured (no fabricated passages)', async () => {
    const { service } = bareService();
    const result = await service.search('anything', { topK: 5 });
    expect(result.status).toBe('not_configured');
    expect(result.passages).toEqual([]);
    expect(result.query).toBe('anything');
    expect(typeof result.reranker).toBe('string');
  });

  it('ingest over an unconfigured stack returns not_configured per doc (never throws)', async () => {
    const { service } = bareService();
    const results = await service.ingest([{ text: 'hello world', docId: 'd1', source: 'unit' }]);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('not_configured');
    expect(results[0]?.upserted).toBe(0);
  });

  it('does not throw on an empty ingest batch', async () => {
    const { service } = bareService();
    await expect(service.ingest([])).resolves.toEqual([]);
  });
});

/** A configured slice: Qdrant + an OpenAI-shaped embedder, no live colbert rerank. */
function configuredConfig(): MemoryConfig {
  return memoryConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    qdrantUrl: 'http://qdrant.local',
    qdrantApiKeyPresent: false,
    qdrantApiKey: null,
    mem0Collection: 'recoder_mem0',
    retrievalCollection: 'recoder_retrieval',
    colbertRerankUrl: null, // foundation reranker = identity; union pre-sorts by score
    mem0SidecarUrl: null,
    embedTensorzeroUrl: null,
    embedTensorzeroApiKeyPresent: false,
    embedTensorzeroApiKey: null,
    embedOpenaiApiKeyPresent: true,
    embedOpenaiApiKey: 'sk-test',
    embedOpenaiBaseUrl: 'http://embed.local',
    embedEndpoint: null,
    embedModel: 'text-embedding-3-small',
    dedupeThreshold: 0.9,
    recallLimit: 8,
    candidateTtlDays: 30,
  });
}

/** Fake fetch: embeddings return a vector; Qdrant search returns one match. */
function stackFetch(qdrantMatchText: string): FetchLike {
  return (async (url: string, init?: { method?: string }) => {
    if (url.includes('embed')) {
      return { ok: true, status: 200, json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] }) };
    }
    if (url.includes('/points/search')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: [{ id: 'q1', score: 0.5, payload: { text: qdrantMatchText, source: 'qdrant' } }] }),
      };
    }
    // ensureCollection GET / any other → ok.
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as FetchLike;
}

/** A colbert search port returning fixed index hits. */
function fakeColbertSearch(hits: ColbertSearchHit[], configured = true): ColbertSearchPort {
  return {
    configured: () => configured,
    async search() {
      return { available: true, hits };
    },
    async ensureIndex(collection, passages) {
      return { built: true, collection, documents: passages.length };
    },
  };
}

describe('retrieval-service ColBERT first-stage union (fusion fires in the flow)', () => {
  it('unions a ColBERT-only index hit into the Qdrant results', async () => {
    const foundation = createVectorFoundation({
      config: configuredConfig(),
      fetchImpl: stackFetch('qdrant passage about deploys'),
    });
    expect(foundation.configured).toBe(true);

    const service = createRetrievalService({
      foundation,
      colbertSearch: fakeColbertSearch([
        { text: 'colbert-only passage about vault secrets', score: 40.0, pid: 5 },
      ]),
    });

    const result = await service.search('vault secrets', { topK: 5 });
    expect(result.status).toBe('ok');
    const texts = result.passages.map((p) => p.text);
    // The Qdrant hit AND the colbert-only hit are both present — colbert added a
    // candidate the single-vector top-K missed.
    expect(texts).toContain('qdrant passage about deploys');
    expect(texts).toContain('colbert-only passage about vault secrets');
    // Truthful source stats: colbert contributed exactly one net-new passage.
    const colbertStat = result.sources?.find((s) => s.source === 'colbert');
    expect(colbertStat?.available).toBe(true);
    expect(colbertStat?.contributed).toBe(1);
  });

  it('degrades to Qdrant-only when the colbert search is not configured', async () => {
    const foundation = createVectorFoundation({
      config: configuredConfig(),
      fetchImpl: stackFetch('qdrant passage about deploys'),
    });
    const service = createRetrievalService({
      foundation,
      colbertSearch: fakeColbertSearch([], false), // configured() === false
    });

    const result = await service.search('deploys', { topK: 5 });
    expect(result.status).toBe('ok');
    expect(result.passages.map((p) => p.text)).toEqual(['qdrant passage about deploys']);
    const colbertStat = result.sources?.find((s) => s.source === 'colbert');
    expect(colbertStat?.available).toBe(false);
    expect(colbertStat?.reason).toBe('colbert search not configured');
  });
});
