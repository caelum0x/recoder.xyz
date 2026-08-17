/**
 * `createPermissiveSymbolSearch` — a PERMISSIVE (MIT `@recoder/recodergit`) symbol
 * search that composes the package's `createSemanticIndex` over the backend's own
 * embedding + vector infrastructure, so `symbol_search` WORKS in the shipped DMG
 * without the PolyForm `@recoder/recodergit-engine` (recoder-rxn0 Path B).
 *
 * It backs the ONE code-intel op the MIT library can serve well — semantic symbol
 * search — over an injected embedder + vector store. The richer scope-resolved
 * `definition` / `call_graph` / `find_references` remain the heavy engine's domain
 * and degrade truthfully upstream when the engine is absent.
 *
 * DEGRADE CONTRACT (inherited from the MIT semantic-index): no embedder / no store
 * ⇒ indexing is a no-op and search returns `[]`. Nothing here throws or fabricates
 * a hit. Both ports are INJECTED, so this is unit-tested with in-memory fakes and
 * touches no network; production passes the inference embed gateway + Qdrant.
 */
import { createHash } from 'node:crypto';
import {
  createSemanticIndex,
  type EmbeddingPort,
  type VectorStorePort,
  type SemanticHit,
} from '@recoder/recodergit';

/** A permissive symbol-search hit — a `path` + line window + score + preview. */
export interface PermissiveSymbolHit {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly score: number;
  readonly preview: string;
}

export interface PermissiveSymbolSearch {
  /** Build/refresh the per-repo semantic index (no-op + truthful when unconfigured). */
  index(repoRoot: string): Promise<{ configured: boolean; chunks: number }>;
  /** Semantic search over the indexed repo. `[]` when unconfigured or on any fault. */
  search(query: string, topK?: number): Promise<PermissiveSymbolHit[]>;
}

export interface PermissiveSymbolSearchDeps {
  readonly embedder: EmbeddingPort;
  readonly store: VectorStorePort;
  /** Per-repo collection name (caller derives it deterministically from the repo id). */
  readonly collection: string;
}

function toHit(h: SemanticHit): PermissiveSymbolHit {
  return {
    path: h.path,
    startLine: h.startLine,
    endLine: h.endLine,
    score: h.score,
    preview: h.preview,
  };
}

/**
 * Compose a permissive symbol search over the MIT semantic index. The embedder +
 * store are the SAME shared ports the memory domain already runs (inference embed +
 * Qdrant); adapters that bridge them live at the call site.
 */
export function createPermissiveSymbolSearch(
  deps: PermissiveSymbolSearchDeps,
): PermissiveSymbolSearch {
  const index = createSemanticIndex({
    embedder: deps.embedder,
    store: deps.store,
    collection: deps.collection,
  });

  return {
    async index(repoRoot: string) {
      const result = await index.indexRepo(repoRoot);
      return { configured: result.configured, chunks: result.chunks };
    },
    async search(query: string, topK?: number) {
      const hits = await index.semanticSearch(query, topK);
      return hits.map(toHit);
    },
  };
}

/**
 * The `recodergit-service` fallback shape — the exact seam `RecoderGitServiceDeps
 * .fallbackSymbolSearch` expects, so bootstrap can wire this straight in.
 */
export type PermissiveSymbolSearchFallback = (input: {
  readonly repoRoot: string;
  readonly query: string;
  readonly limit: number;
}) => Promise<readonly PermissiveSymbolHit[] | null>;

/**
 * Build the recodergit-service fallback: a per-repo permissive symbol search that
 * LAZILY indexes each repo once per process (keyed by a stable collection derived
 * from the repo root) and then serves semantic searches. Returns `null` on no hits
 * so the service keeps its truthful 'unavailable' degrade. The embedder + store are
 * the SAME shared ports the memory domain runs (inference embed + Qdrant).
 */
export function createPermissiveSymbolSearchFallback(deps: {
  readonly embedder: EmbeddingPort;
  readonly store: VectorStorePort;
  /** Override the per-repo collection derivation (default: `code_<sha256(root)[:16]>`). */
  readonly collectionFor?: (repoRoot: string) => string;
}): PermissiveSymbolSearchFallback {
  const indexed = new Set<string>();
  const collectionFor =
    deps.collectionFor ?? ((root: string) => `code_${createHash('sha256').update(root).digest('hex').slice(0, 16)}`);
  return async ({ repoRoot, query, limit }) => {
    const collection = collectionFor(repoRoot);
    const search = createPermissiveSymbolSearch({ embedder: deps.embedder, store: deps.store, collection });
    if (!indexed.has(collection)) {
      const built = await search.index(repoRoot);
      // Only mark indexed when a real build happened (embedder+store configured);
      // else retry next call rather than caching an empty index.
      if (built.configured) indexed.add(collection);
    }
    const hits = await search.search(query, limit);
    return hits.length > 0 ? hits : null;
  };
}

/**
 * Adapt a backend `embed(texts) → number[][]` function to the MIT
 * {@link EmbeddingPort}. A thrown/absent embedder degrades to `null` so the whole
 * index build no-ops truthfully (never a fabricated vector).
 */
export function embeddingPortFrom(
  embed: ((texts: string[]) => Promise<number[][] | null>) | null,
  provider?: string,
): EmbeddingPort {
  return {
    ...(provider ? { provider } : {}),
    async embed(texts: string[]): Promise<number[][] | null> {
      if (!embed || texts.length === 0) return null;
      try {
        const vectors = await embed(texts);
        return Array.isArray(vectors) && vectors.length === texts.length ? vectors : null;
      } catch {
        return null;
      }
    },
  };
}

/** The minimal Qdrant-like vector store the adapter bridges (matches the memory adapter). */
export interface QdrantLikeStore {
  readonly configured?: boolean;
  ensureCollection(name: string, dim: number): Promise<boolean>;
  upsert(name: string, points: Array<{ id: string | number; vector: number[]; payload?: Record<string, unknown> }>): Promise<boolean>;
  search(name: string, vector: number[], topK: number): Promise<Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>>;
}

/**
 * Adapt a backend Qdrant-like store to the MIT {@link VectorStorePort}. When the
 * store is unconfigured every method no-ops truthfully (search ⇒ `[]`), so the
 * whole search degrades to empty rather than throwing.
 */
export function vectorStorePortFrom(store: QdrantLikeStore | null): VectorStorePort {
  const configured = store != null && store.configured !== false;
  return {
    configured,
    async ensureCollection(name, dim) {
      if (!store || !configured) return false;
      try {
        return await store.ensureCollection(name, dim);
      } catch {
        return false;
      }
    },
    async upsert(name, points) {
      if (!store || !configured) return false;
      try {
        return await store.upsert(name, points);
      } catch {
        return false;
      }
    },
    async search(name, vector, topK) {
      if (!store || !configured) return [];
      try {
        return await store.search(name, vector, topK);
      } catch {
        return [];
      }
    },
  };
}
