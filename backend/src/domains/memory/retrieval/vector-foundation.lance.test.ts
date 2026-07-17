/**
 * vector-foundation embedded-lance tests — the adoption seam this wave shipped:
 *   - `QDRANT_URL` set → the store stays Qdrant (lance never engages),
 *   - `QDRANT_URL` absent + `lanceDataDir` set → the EMBEDDED lance store backs
 *     the same `VectorStorePort`, and the whole retrieval facade works over it
 *     (ingest → search roundtrip with an injected embedder),
 *   - the bootstrap-injected `embedFallback` makes the foundation `configured`
 *     when no HTTP embed provider is set,
 *   - neither Qdrant nor lance → truthful `not_configured`, probe carries why.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryConfigSchema, type MemoryConfig } from '../config.js';
import type { EmbeddingPort } from '../ports/embedding.port.js';
import type { LanceConnection, LanceModule, LanceRow, LanceTable } from '../adapters/lance-napi.client.js';
import { createVectorFoundation } from './vector-foundation.js';
import { createRetrievalService } from './retrieval-service.js';

function configWith(overrides: Partial<MemoryConfig>): MemoryConfig {
  return memoryConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    qdrantUrl: null,
    qdrantApiKeyPresent: false,
    qdrantApiKey: null,
    lanceDataDir: null,
    lanceNativeDir: null,
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
    ...overrides,
  });
}

/** Deterministic 3-dim embedder standing in for the inference-domain seam. */
const fakeEmbedFallback: EmbeddingPort = {
  provider: 'inference-napi',
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => [t.length % 7, t.includes('lance') ? 1 : 0, 1]);
  },
};

/** Minimal in-memory lance module (L2 distance) for the embedded path. */
function fakeLanceModule(): { module: LanceModule; uris: string[] } {
  const tables = new Map<string, LanceRow[]>();
  const uris: string[] = [];
  const table = (name: string): LanceTable => ({
    async add(rows) {
      tables.set(name, [...(tables.get(name) ?? []), ...rows]);
    },
    async delete(predicate) {
      const inner = predicate.replace(/^id_json IN \(/, '').replace(/\)$/, '');
      const ids = new Set(inner.split(', ').map((q) => q.slice(1, -1).replace(/''/g, "'")));
      tables.set(name, (tables.get(name) ?? []).filter((r) => !ids.has(r.id_json)));
    },
    vectorSearch(vector) {
      let capped = 0;
      const q = {
        limit(n: number) {
          capped = n;
          return q;
        },
        async toArray() {
          const dist = (v: number[]) =>
            Math.sqrt(v.reduce((sum, x, i) => sum + (x - (vector[i] ?? 0)) ** 2, 0));
          const rows = (tables.get(name) ?? [])
            .map((r) => ({ ...r, _distance: dist(r.vector) }))
            .sort((a, b) => a._distance - b._distance);
          return capped > 0 ? rows.slice(0, capped) : rows;
        },
      };
      return q;
    },
  });
  const connection: LanceConnection = {
    async tableNames() {
      return [...tables.keys()];
    },
    async openTable(name) {
      if (!tables.has(name)) throw new Error('missing table');
      return table(name);
    },
    async createTable(name, data) {
      tables.set(name, [...data]);
      return table(name);
    },
  };
  return {
    uris,
    module: {
      async connect(uri) {
        uris.push(uri);
        return connection;
      },
    },
  };
}

describe('vector-foundation embedded lance adoption', () => {
  it('keeps Qdrant as the store when QDRANT_URL is set', async () => {
    const foundation = createVectorFoundation({
      config: configWith({ qdrantUrl: 'http://localhost:6333' }),
    });
    expect(foundation.storeBackend).toBe('qdrant');
    await expect(foundation.probeStore()).resolves.toEqual({ available: true, backend: 'qdrant' });
  });

  it('serves the full retrieval roundtrip over the embedded lance store on a temp dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lance-foundation-'));
    const lance = fakeLanceModule();
    const foundation = createVectorFoundation({
      config: configWith({ lanceDataDir: dir }),
      embedFallback: fakeEmbedFallback,
      lanceLoader: async () => lance.module,
    });

    expect(foundation.storeBackend).toBe('lance');
    expect(foundation.embedder.provider).toBe('inference-napi');
    expect(foundation.configured).toBe(true);
    await expect(foundation.probeStore()).resolves.toEqual({ available: true, backend: 'lance' });

    const service = createRetrievalService({ foundation });
    const [ingested] = await service.ingest([
      { text: 'lance is the embedded vector store', docId: 'd1', source: 'unit' },
    ]);
    expect(ingested?.status).toBe('ingested');
    expect(ingested?.upserted).toBeGreaterThan(0);

    const result = await service.search('embedded lance', { topK: 3 });
    expect(result.status).toBe('ok');
    expect(result.passages.length).toBeGreaterThan(0);
    expect(lance.uris).toEqual([dir]); // the store really lives under the temp dir
  });

  it('degrades truthfully when neither Qdrant nor a lance surface is available', async () => {
    const foundation = createVectorFoundation({
      config: configWith({ lanceDataDir: '/tmp/lance-none' }),
      embedFallback: fakeEmbedFallback,
      lanceLoader: async () => null,
    });

    const probe = await foundation.probeStore();
    expect(probe.available).toBe(false);
    expect(probe.backend).toBe('lance');
    expect(probe.reason).toMatch(/lance napi addon/);
    // After the truthful failed load the live `configured` view flips false…
    expect(foundation.configured).toBe(false);

    // …and the retrieval facade reports not_configured instead of faking.
    const service = createRetrievalService({ foundation });
    const result = await service.search('anything', { topK: 3 });
    expect(result.status).toBe('not_configured');
    expect(result.passages).toEqual([]);
  });

  it('stays a truthful no-op with no lance data dir at all (fresh checkout)', async () => {
    const foundation = createVectorFoundation({ config: configWith({}) });
    expect(foundation.storeBackend).toBe('lance');
    expect(foundation.configured).toBe(false);
    const probe = await foundation.probeStore();
    expect(probe.available).toBe(false);
    expect(probe.reason).toMatch(/no lance data dir/);
  });
});
