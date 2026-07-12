/**
 * vector-store — the shared embedding + Qdrant adapter. Every test drives it with
 * a FAKE fetch + injected env, so nothing here touches a network, a daemon, or a
 * key. The emphasis is the degrade contract (RECODER-ENGINES §18): no provider ⇒
 * embed null; no QDRANT_URL ⇒ vector store no-ops truthfully; any error ⇒ safe
 * fallback, never a throw and never a fabricated result.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  cosineSimilarity,
  createEmbeddingPort,
  createVectorStore,
  type FetchLike,
  type HttpRequestInit,
  type HttpResponseLike,
  type VectorEnv,
} from './vector-store';

/** Build a fake HttpResponseLike. */
function res(ok: boolean, status: number, body: unknown = {}): HttpResponseLike {
  return { ok, status, json: async () => body };
}

/** A fetch spy that records calls and returns a queued/looked-up response. */
function fakeFetch(handler: (url: string, init?: HttpRequestInit) => HttpResponseLike): {
  fetch: FetchLike;
  calls: Array<{ url: string; init?: HttpRequestInit }>;
} {
  const calls: Array<{ url: string; init?: HttpRequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetch, calls };
}

const throwingFetch: FetchLike = async () => {
  throw new Error('network down');
};

// ── EmbeddingPort ────────────────────────────────────────────────────────────

describe('EmbeddingPort', () => {
  it('returns null (degrade) when no provider is configured', async () => {
    const port = createEmbeddingPort({ fetch: throwingFetch, env: {} });
    expect(port.provider).toBe('none');
    expect(await port.embed(['hello'])).toBeNull();
  });

  it('returns [] for empty input without hitting the network', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, {}));
    const port = createEmbeddingPort({ fetch, env: { OPENAI_API_KEY: 'sk-test' } });
    expect(await port.embed([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('embeds via the gateway (TENSORZERO_URL) with the OpenAI-compatible shape', async () => {
    const { fetch, calls } = fakeFetch(() =>
      res(true, 200, {
        data: [
          { index: 1, embedding: [0.4, 0.5] },
          { index: 0, embedding: [0.1, 0.2] },
        ],
      }),
    );
    const env: VectorEnv = { TENSORZERO_URL: 'http://127.0.0.1:3000/', EMBED_MODEL: 'my-embed' };
    const port = createEmbeddingPort({ fetch, env });
    expect(port.provider).toBe('tensorzero');
    const out = await port.embed(['a', 'b']);
    // Reordered by `index` so ordering is provider-independent.
    expect(out).toEqual([
      [0.1, 0.2],
      [0.4, 0.5],
    ]);
    expect(calls[0].url).toBe('http://127.0.0.1:3000/openai/v1/embeddings');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ model: 'my-embed', input: ['a', 'b'] });
    // No hardcoded key: tensorzero without TENSORZERO_API_KEY sends no auth header.
    expect(calls[0].init?.headers?.authorization).toBeUndefined();
  });

  it('prefers the gateway over OPENAI_API_KEY and sends a bearer when the gateway key is set', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, { data: [{ index: 0, embedding: [1] }] }));
    const env: VectorEnv = {
      TENSORZERO_URL: 'http://gw',
      TENSORZERO_API_KEY: 'gw-key',
      OPENAI_API_KEY: 'sk-should-be-ignored',
    };
    const port = createEmbeddingPort({ fetch, env });
    await port.embed(['x']);
    expect(calls[0].url).toBe('http://gw/openai/v1/embeddings');
    expect(calls[0].init?.headers?.authorization).toBe('Bearer gw-key');
  });

  it('falls back to the direct OpenAI endpoint + bearer when only OPENAI_API_KEY is set', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, { data: [{ index: 0, embedding: [1, 2, 3] }] }));
    const port = createEmbeddingPort({ fetch, env: { OPENAI_API_KEY: 'sk-live' } });
    expect(port.provider).toBe('openai');
    expect(await port.embed(['q'])).toEqual([[1, 2, 3]]);
    expect(calls[0].url).toBe('https://api.openai.com/v1/embeddings');
    expect(calls[0].init?.headers?.authorization).toBe('Bearer sk-live');
  });

  it('honours OPENAI_BASE_URL and an explicit EMBED_ENDPOINT override', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, { data: [{ index: 0, embedding: [0] }] }));
    const port = createEmbeddingPort({
      fetch,
      env: { OPENAI_API_KEY: 'sk', EMBED_ENDPOINT: 'https://proxy.example/embed' },
    });
    await port.embed(['q']);
    expect(calls[0].url).toBe('https://proxy.example/embed');
  });

  it('degrades to null on a non-2xx response', async () => {
    const { fetch } = fakeFetch(() => res(false, 500, { error: 'boom' }));
    const port = createEmbeddingPort({ fetch, env: { OPENAI_API_KEY: 'sk' } });
    expect(await port.embed(['q'])).toBeNull();
  });

  it('degrades to null when the network throws', async () => {
    const port = createEmbeddingPort({ fetch: throwingFetch, env: { OPENAI_API_KEY: 'sk' } });
    expect(await port.embed(['q'])).toBeNull();
  });

  it('degrades to null on a malformed / count-mismatched response', async () => {
    const { fetch } = fakeFetch(() => res(true, 200, { data: [{ embedding: [1] }] }));
    const port = createEmbeddingPort({ fetch, env: { OPENAI_API_KEY: 'sk' } });
    // Two inputs, one vector back ⇒ truthful null rather than a wrong-length result.
    expect(await port.embed(['a', 'b'])).toBeNull();
  });

  it('degrades to null when an embedding row is not a numeric vector', async () => {
    const { fetch } = fakeFetch(() => res(true, 200, { data: [{ index: 0, embedding: ['nope'] }] }));
    const port = createEmbeddingPort({ fetch, env: { OPENAI_API_KEY: 'sk' } });
    expect(await port.embed(['a'])).toBeNull();
  });
});

// ── VectorStorePort ──────────────────────────────────────────────────────────

describe('VectorStorePort (no QDRANT_URL ⇒ truthful no-op)', () => {
  it('reports not configured and no-ops every method without touching the network', async () => {
    const fetch = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>();
    const store = createVectorStore({ fetch: fetch as unknown as FetchLike, env: {} });
    expect(store.configured).toBe(false);
    expect(await store.ensureCollection('c', 3)).toBe(false);
    expect(await store.upsert('c', [{ id: 1, vector: [1, 2, 3] }])).toBe(false);
    expect(await store.search('c', [1, 2, 3], 5)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('VectorStorePort (Qdrant REST via fake fetch)', () => {
  const env: VectorEnv = { QDRANT_URL: 'http://qdrant:6333/', QDRANT_API_KEY: 'qk' };

  it('ensureCollection short-circuits when the collection already exists', async () => {
    const { fetch, calls } = fakeFetch((_url, init) => {
      if (init?.method === 'GET') return res(true, 200, { result: { status: 'green' } });
      return res(true, 200, {});
    });
    const store = createVectorStore({ fetch, env });
    expect(store.configured).toBe(true);
    expect(await store.ensureCollection('docs', 1536)).toBe(true);
    // Only the existence GET — no PUT create.
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].init?.headers?.['api-key']).toBe('qk');
  });

  it('ensureCollection creates the collection with size + distance when absent', async () => {
    const { fetch, calls } = fakeFetch((_url, init) => {
      if (init?.method === 'GET') return res(false, 404, {});
      return res(true, 200, { result: true });
    });
    const store = createVectorStore({ fetch, env });
    expect(await store.ensureCollection('docs', 8, 'Dot')).toBe(true);
    const put = calls.find((c) => c.init?.method === 'PUT');
    expect(put?.url).toBe('http://qdrant:6333/collections/docs');
    expect(JSON.parse(put?.init?.body as string)).toEqual({ vectors: { size: 8, distance: 'Dot' } });
  });

  it('upsert PUTs points with wait=true and reports success', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, { result: { status: 'completed' } }));
    const store = createVectorStore({ fetch, env });
    const ok = await store.upsert('docs', [{ id: 'p1', vector: [0.1, 0.2], payload: { path: 'a.ts' } }]);
    expect(ok).toBe(true);
    expect(calls[0].url).toBe('http://qdrant:6333/collections/docs/points?wait=true');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      points: [{ id: 'p1', vector: [0.1, 0.2], payload: { path: 'a.ts' } }],
    });
  });

  it('upsert with no points is a no-op success (no request issued)', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, {}));
    const store = createVectorStore({ fetch, env });
    expect(await store.upsert('docs', [])).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('search POSTs the query vector and maps matches (id/score/payload)', async () => {
    const { fetch, calls } = fakeFetch(() =>
      res(true, 200, {
        result: [
          { id: 'p2', score: 0.91, payload: { path: 'b.ts' } },
          { id: 7, score: 0.42 },
          { id: 'bad' }, // dropped: no numeric score
        ],
      }),
    );
    const store = createVectorStore({ fetch, env });
    const matches = await store.search('docs', [0.1, 0.2], 3);
    expect(matches).toEqual([
      { id: 'p2', score: 0.91, payload: { path: 'b.ts' } },
      { id: 7, score: 0.42, payload: undefined },
    ]);
    expect(calls[0].url).toBe('http://qdrant:6333/collections/docs/points/search');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      vector: [0.1, 0.2],
      limit: 3,
      with_payload: true,
    });
  });

  it('search returns [] on an empty query vector without a request', async () => {
    const { fetch, calls } = fakeFetch(() => res(true, 200, { result: [] }));
    const store = createVectorStore({ fetch, env });
    expect(await store.search('docs', [], 5)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('search degrades to [] on a non-2xx response', async () => {
    const { fetch } = fakeFetch(() => res(false, 503, {}));
    const store = createVectorStore({ fetch, env });
    expect(await store.search('docs', [1], 5)).toEqual([]);
  });

  it('every method degrades safely when the network throws', async () => {
    const store = createVectorStore({ fetch: throwingFetch, env });
    expect(await store.ensureCollection('docs', 4)).toBe(false);
    expect(await store.upsert('docs', [{ id: 1, vector: [1] }])).toBe(false);
    expect(await store.search('docs', [1], 5)).toEqual([]);
  });
});

// ── cosineSimilarity ─────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('is 1 for identical direction and ~0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it('returns 0 for a length mismatch, empty, or zero-norm input (never NaN)', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
