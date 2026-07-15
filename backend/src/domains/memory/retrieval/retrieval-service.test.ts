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
