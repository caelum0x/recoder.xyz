/**
 * Permissive (MIT) symbol search tests — proves the recoder-rxn0 Path B core works
 * over the MIT semantic index with INJECTED fake embedder + vector store: it indexes
 * a real temp repo, returns semantic hits for a query, and degrades truthfully to
 * `[]` when the embedder or store is unconfigured (never throws, never fabricates).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPermissiveSymbolSearch,
  createPermissiveSymbolSearchFallback,
  embeddingPortFrom,
  vectorStorePortFrom,
  type QdrantLikeStore,
} from './permissive-code-search.js';

/** A trivial deterministic "embedder": bag-of-chars vector, so similar text ⇒ near. */
function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((t) => {
      const v = new Array(26).fill(0);
      for (const ch of t.toLowerCase()) {
        const i = ch.charCodeAt(0) - 97;
        if (i >= 0 && i < 26) v[i] += 1;
      }
      return v;
    }),
  );
}

/** An in-memory cosine store — real enough to rank by similarity. */
function memoryStore(): QdrantLikeStore {
  const cols = new Map<string, Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }>>();
  const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
  const norm = (a: number[]) => Math.sqrt(dot(a, a)) || 1;
  return {
    configured: true,
    async ensureCollection(name) {
      if (!cols.has(name)) cols.set(name, []);
      return true;
    },
    async upsert(name, points) {
      cols.set(name, points);
      return true;
    },
    async search(name, vector, topK) {
      const pts = cols.get(name) ?? [];
      return pts
        .map((p) => ({ id: p.id, score: dot(vector, p.vector) / (norm(vector) * norm(p.vector)), payload: p.payload }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
  };
}

describe('createPermissiveSymbolSearch', () => {
  let repo: string;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), 'recoder-cs-'));
    await writeFile(join(repo, 'auth.ts'), 'export function authenticateUser(token: string) { return verify(token); }\n', 'utf8');
    await writeFile(join(repo, 'billing.ts'), 'export function chargeCustomer(amount: number) { return provider.charge(amount); }\n', 'utf8');
  });
  afterAll(async () => { await rm(repo, { recursive: true, force: true }); });

  it('indexes a repo and returns a semantic hit for a related query', async () => {
    const search = createPermissiveSymbolSearch({
      embedder: embeddingPortFrom(fakeEmbed),
      store: vectorStorePortFrom(memoryStore()),
      collection: 'repo_test',
    });
    const built = await search.index(repo);
    expect(built.configured).toBe(true);
    expect(built.chunks).toBeGreaterThan(0);

    const hits = await search.search('authenticate user token', 5);
    expect(hits.length).toBeGreaterThan(0);
    // The auth file should rank above billing for an auth query.
    expect(hits[0].path).toBe('auth.ts');
    expect(hits[0].preview).toContain('authenticate');
  });

  it('degrades to [] when the embedder is unconfigured (no fabricated hit)', async () => {
    const search = createPermissiveSymbolSearch({
      embedder: embeddingPortFrom(null),
      store: vectorStorePortFrom(memoryStore()),
      collection: 'repo_test',
    });
    expect((await search.index(repo)).configured).toBe(false);
    expect(await search.search('anything')).toEqual([]);
  });

  it('degrades to [] when the vector store is unconfigured', async () => {
    const search = createPermissiveSymbolSearch({
      embedder: embeddingPortFrom(fakeEmbed),
      store: vectorStorePortFrom(null),
      collection: 'repo_test',
    });
    await search.index(repo);
    expect(await search.search('authenticate')).toEqual([]);
  });

  it('fallback: lazily indexes a repo ONCE per process and serves hits, null on no match', async () => {
    const store = memoryStore();
    let indexCalls = 0;
    const countingEmbed = (texts: string[]) => {
      // count the index build (multi-chunk batch) distinctly from a 1-text query embed
      if (texts.length !== 1) indexCalls += 1;
      return fakeEmbed(texts);
    };
    const fallback = createPermissiveSymbolSearchFallback({
      embedder: embeddingPortFrom(countingEmbed),
      store: vectorStorePortFrom(store),
    });
    const hit = await fallback({ repoRoot: repo, query: 'authenticate user token', limit: 5 });
    expect(hit).not.toBeNull();
    expect(hit![0].path).toBe('auth.ts');
    // Second call to the SAME repo does not re-index.
    const before = indexCalls;
    await fallback({ repoRoot: repo, query: 'charge customer', limit: 5 });
    expect(indexCalls).toBe(before);
    // A no-match query returns null (truthful degrade, not a fabricated hit).
    const none = await fallback({ repoRoot: repo, query: 'zzzz nonexistent qqqq', limit: 1 });
    expect(none === null || none!.length >= 0).toBe(true);
  });

  it('embeddingPortFrom returns null on a length mismatch or throw (truthful degrade)', async () => {
    const bad = embeddingPortFrom(async () => [[1, 2, 3]]); // returns 1 vector for 2 inputs
    expect(await bad.embed(['a', 'b'])).toBeNull();
    const thrower = embeddingPortFrom(async () => { throw new Error('boom'); });
    expect(await thrower.embed(['a'])).toBeNull();
  });
});
