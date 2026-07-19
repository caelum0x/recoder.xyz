/**
 * colbert-search.client tests — the FIRST-STAGE ColBERT retriever HTTP client.
 * Proves it searches the built per-collection index and builds indexes, and that
 * every degrade path (no URL, non-2xx 404/503, malformed body) is truthful and
 * never fabricates a hit. Fetch is injected — no network is touched.
 */
import { describe, it, expect } from 'vitest';
import { memoryConfigSchema, type MemoryConfig } from '../config.js';
import type { ColbertFetch, ColbertHttpResponse } from './colbert-sidecar.client.js';
import { createColbertSearchClient } from './colbert-search.client.js';

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

/** A ColbertFetch capturing the URL + returning a canned body/status. */
function fetchWith(body: unknown, ok = true, status = 200): { fetch: ColbertFetch; calls: string[] } {
  const calls: string[] = [];
  const fetch: ColbertFetch = async (url): Promise<ColbertHttpResponse> => {
    calls.push(url);
    return { ok, status, json: async () => body };
  };
  return { fetch, calls };
}

describe('createColbertSearchClient.search', () => {
  it('is not configured and degrades truthfully when no URL is set', async () => {
    const client = createColbertSearchClient(config(null));
    expect(client.configured()).toBe(false);
    const result = await client.search('repo_x', 'query', 5);
    expect(result.available).toBe(false);
    expect(result.hits).toEqual([]);
    expect(result.reason).toBe('COLBERT_RERANK_URL not set');
  });

  it('searches the per-collection index and parses best-first hits', async () => {
    const body = {
      query: 'q',
      topk: [
        { text: 'first hit', pid: 4, rank: 1, score: 30.0 },
        { text: 'second hit', pid: 9, rank: 2, score: 12.5 },
      ],
    };
    const { fetch, calls } = fetchWith(body);
    const client = createColbertSearchClient(config('http://127.0.0.1:8893'), fetch);
    expect(client.configured()).toBe(true);

    const result = await client.search('repo_x', 'find secrets', 5);
    expect(result.available).toBe(true);
    expect(result.hits.map((h) => h.text)).toEqual(['first hit', 'second hit']);
    expect(result.hits[0]?.score).toBe(30.0);
    expect(result.hits[0]?.pid).toBe(4);
    // Hits the real per-collection search endpoint with the encoded name.
    expect(calls[0]).toBe('http://127.0.0.1:8893/collections/repo_x/search');
  });

  it('degrades to unavailable on a 404 (index not built) — no fabricated hits', async () => {
    const { fetch } = fetchWith({ error: 'collection not built' }, false, 404);
    const client = createColbertSearchClient(config('http://127.0.0.1:8893'), fetch);
    const result = await client.search('repo_x', 'q', 5);
    expect(result.available).toBe(false);
    expect(result.hits).toEqual([]);
    expect(result.reason).toBe('colbert daemon HTTP 404');
  });

  it('degrades to unavailable on a 503 (torch/colbert absent)', async () => {
    const { fetch } = fetchWith({ error: 'unavailable' }, false, 503);
    const client = createColbertSearchClient(config('http://127.0.0.1:8893'), fetch);
    const result = await client.search('repo_x', 'q', 5);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('colbert daemon HTTP 503');
  });

  it('drops malformed rows but keeps the valid hits (never trusts junk)', async () => {
    const body = { topk: [{ text: 'good', score: 5 }, { text: 'no score' }, { score: 3 }] };
    const { fetch } = fetchWith(body);
    const client = createColbertSearchClient(config('http://127.0.0.1:8893'), fetch);
    const result = await client.search('repo_x', 'q', 5);
    expect(result.available).toBe(true);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.text).toBe('good');
  });
});

describe('createColbertSearchClient.ensureIndex', () => {
  it('builds a per-collection index from passages', async () => {
    const { fetch, calls } = fetchWith({ name: 'repo_x', created: true });
    const client = createColbertSearchClient(config('http://127.0.0.1:8893'), fetch);
    const result = await client.ensureIndex('repo_x', ['a passage', 'another passage'], { overwrite: true });
    expect(result.built).toBe(true);
    expect(result.documents).toBe(2);
    expect(calls[0]).toBe('http://127.0.0.1:8893/collections');
  });

  it('degrades truthfully when no URL is set (never blocks a run)', async () => {
    const client = createColbertSearchClient(config(null));
    const result = await client.ensureIndex('repo_x', ['a passage']);
    expect(result.built).toBe(false);
    expect(result.reason).toBe('COLBERT_RERANK_URL not set');
  });

  it('skips truthfully when there are no passages to index', async () => {
    const { fetch } = fetchWith({});
    const client = createColbertSearchClient(config('http://127.0.0.1:8893'), fetch);
    const result = await client.ensureIndex('repo_x', ['   ', '']);
    expect(result.built).toBe(false);
    expect(result.reason).toBe('no passages to index');
  });
});
