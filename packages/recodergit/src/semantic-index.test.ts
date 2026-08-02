/**
 * semantic-index — driven entirely by in-memory fakes: no network, no Qdrant, no
 * embeddings provider. The emphasis is the degrade contract: no embedder ⇒ index
 * is a truthful no-op and search returns []; a wired fake round-trips real hits.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkFile,
  createSemanticIndex,
  type EmbeddingPort,
  type VectorMatch,
  type VectorPoint,
  type VectorStorePort,
} from './semantic-index';

/** Cosine similarity for the fake store's ranking. */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * A tiny deterministic "embedder": a bag-of-words vector over a fixed vocabulary,
 * so semantically-similar text lands near each other with no network.
 */
const VOCAB = ['auth', 'login', 'token', 'billing', 'invoice', 'payment', 'render', 'button'];
function fakeVector(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCAB.map((w) => (lower.split(w).length - 1));
}

function fakeEmbedder(): EmbeddingPort {
  return {
    provider: 'fake',
    async embed(texts: string[]): Promise<number[][] | null> {
      return texts.map(fakeVector);
    },
  };
}

/** An embedder that is not configured — always degrades to null. */
function nullEmbedder(): EmbeddingPort {
  return { provider: 'none', async embed() { return null; } };
}

/** An in-memory vector store with cosine search — mirrors the Qdrant contract. */
function fakeStore(): VectorStorePort & { points: Map<string | number, VectorPoint> } {
  const points = new Map<string | number, VectorPoint>();
  return {
    points,
    configured: true,
    async ensureCollection() {
      return true;
    },
    async upsert(_name: string, pts: VectorPoint[]) {
      for (const p of pts) points.set(p.id, p);
      return true;
    },
    async search(_name: string, vector: number[], topK: number): Promise<VectorMatch[]> {
      return [...points.values()]
        .map((p) => ({ id: p.id, score: cosine(vector, p.vector), payload: p.payload }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
  };
}

/** A store that is not configured — every method no-ops truthfully. */
function unconfiguredStore(): VectorStorePort {
  return {
    configured: false,
    async ensureCollection() {
      return false;
    },
    async upsert() {
      return false;
    },
    async search() {
      return [];
    },
  };
}

describe('chunkFile', () => {
  it('splits content into 1-based line windows and drops whitespace-only windows', () => {
    const content = ['a', 'b', 'c', 'd', 'e'].join('\n');
    const chunks = chunkFile('src/x.ts', content, 2);
    assert.deepEqual(chunks, [
      { path: 'src/x.ts', startLine: 1, endLine: 2, text: 'a\nb' },
      { path: 'src/x.ts', startLine: 3, endLine: 4, text: 'c\nd' },
      { path: 'src/x.ts', startLine: 5, endLine: 5, text: 'e' },
    ]);
  });

  it('returns no chunks for empty or whitespace-only content', () => {
    assert.deepEqual(chunkFile('src/x.ts', ''), []);
    assert.deepEqual(chunkFile('src/x.ts', '   \n\n  \n', 2), []);
  });
});

describe('createSemanticIndex round-trip (fake ports)', () => {
  const files = [
    { path: 'src/auth.ts', content: 'export function login(token) { return auth(token); }' },
    { path: 'src/billing.ts', content: 'export function invoice(payment) { return billing(payment); }' },
    { path: 'src/ui.ts', content: 'export const Button = () => render(button);' },
  ];

  it('indexes files then returns the nearest hit for a query', async () => {
    const store = fakeStore();
    const index = createSemanticIndex({ embedder: fakeEmbedder(), store, collection: 'repo-x', chunkLines: 40 });

    const result = await index.indexFiles(files);
    assert.equal(result.configured, true);
    assert.equal(result.upserted, true);
    assert.equal(result.chunks, 3);
    assert.equal(result.dim, VOCAB.length);
    assert.equal(store.points.size, 3);

    const hits = await index.semanticSearch('login with an auth token', 2);
    assert.ok(hits.length > 0);
    assert.equal(hits[0].path, 'src/auth.ts');
    assert.equal(hits[0].startLine, 1);
    assert.ok(hits[0].score > 0);
    assert.ok(hits[0].preview.includes('login'));
  });

  it('ranks a billing query onto the billing file', async () => {
    const store = fakeStore();
    const index = createSemanticIndex({ embedder: fakeEmbedder(), store, collection: 'repo-x' });
    await index.indexFiles(files);
    const hits = await index.semanticSearch('invoice payment billing', 1);
    assert.equal(hits[0].path, 'src/billing.ts');
  });
});

describe('degrade-safe contract', () => {
  it('no embedder configured ⇒ index is a truthful no-op and search returns []', async () => {
    const store = fakeStore();
    const index = createSemanticIndex({ embedder: nullEmbedder(), store, collection: 'repo-x' });

    const result = await index.indexFiles([
      { path: 'src/auth.ts', content: 'login token auth' },
    ]);
    assert.equal(result.configured, false);
    assert.equal(result.upserted, false);
    assert.equal(store.points.size, 0);

    assert.deepEqual(await index.semanticSearch('login'), []);
  });

  it('unconfigured store ⇒ search returns [] even with a working embedder', async () => {
    const index = createSemanticIndex({ embedder: fakeEmbedder(), store: unconfiguredStore(), collection: 'repo-x' });
    await index.indexFiles([{ path: 'src/auth.ts', content: 'login token auth' }]);
    assert.deepEqual(await index.semanticSearch('login'), []);
  });

  it('empty query ⇒ []', async () => {
    const index = createSemanticIndex({ embedder: fakeEmbedder(), store: fakeStore(), collection: 'repo-x' });
    assert.deepEqual(await index.semanticSearch('   '), []);
  });

  it('a throwing embedder never propagates — search returns []', async () => {
    const throwing: EmbeddingPort = {
      async embed() {
        throw new Error('boom');
      },
    };
    const index = createSemanticIndex({ embedder: throwing, store: fakeStore(), collection: 'repo-x' });
    assert.deepEqual(await index.semanticSearch('login'), []);
    const result = await index.indexFiles([{ path: 'a.ts', content: 'login' }]);
    assert.equal(result.configured, false);
  });

  it('no source files ⇒ truthful empty build', async () => {
    const index = createSemanticIndex({ embedder: fakeEmbedder(), store: fakeStore(), collection: 'repo-x' });
    const result = await index.indexFiles([]);
    assert.equal(result.configured, false);
    assert.equal(result.files, 0);
    assert.equal(result.chunks, 0);
    assert.equal(result.upserted, false);
    assert.equal(result.dim, 0);
  });
});
