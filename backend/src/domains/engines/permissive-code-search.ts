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
  computeFileImpact,
  createRepoIndexer,
  createSemanticIndex,
  type FileImpactDirection,
  type FileImpactResult,
  type DependencyGraph,
  type EmbeddingPort,
  type VectorStorePort,
  type SemanticHit,
  repositoryRegistrationFromGraph,
} from '@recoder/recodergit';
import type { RecoderGitRepositoryNetwork } from './recodergit-repository-network.store.js';

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

/** MIT packaged graph for symbol, file, history, process, and repository impact. */
export type PermissiveImpactInput = {
  readonly repoRoot: string;
  readonly repoId?: string;
  readonly repoAliases?: readonly string[];
  /** Exact source revision used to validate a reusable installed-app snapshot. */
  readonly revision?: string;
  readonly symbol: string;
  readonly filePath?: string;
  readonly direction: FileImpactDirection;
  readonly maxDepth: number;
  readonly limit: number;
  readonly includeTests: boolean;
};

export type PermissiveImpactFallback = ((input: PermissiveImpactInput) => Promise<FileImpactResult | null>) & {
  /** Build/register the packaged graph when Conductor indexes a workspace. */
  indexRepo?(input: {
    readonly repoRoot: string;
    readonly repoId: string;
    readonly repoAliases?: readonly string[];
    readonly revision: string;
  }): Promise<DependencyGraph | null>;
};

export interface PermissiveImpactSnapshotStore {
  get(input: {
    readonly repoId: string;
    readonly repoAliases?: readonly string[];
    readonly repoRoot: string;
    readonly revision: string;
  }): Promise<DependencyGraph | null>;
  set(input: {
    readonly repoId: string;
    readonly repoRoot: string;
    readonly revision: string;
    readonly graph: DependencyGraph;
  }): Promise<void>;
}

/**
 * Build a lazily refreshed MIT graph. The process cache keeps one PR review from
 * rescanning. An exact repo/revision snapshot lets a restarted app reuse the same
 * graph, while canonical KV connects registered providers to consumer files.
 */
export function createPermissiveImpactFallback(deps: {
  readonly ttlMs?: number;
  readonly now?: () => number;
  readonly snapshotStore?: PermissiveImpactSnapshotStore;
  readonly repositoryNetwork?: RecoderGitRepositoryNetwork;
  /** Injectable graph builder keeps restart reuse directly provable. */
  readonly buildGraph?: (repoRoot: string) => Promise<DependencyGraph>;
} = {}): PermissiveImpactFallback {
  const ttlMs = deps.ttlMs ?? 30_000;
  const now = deps.now ?? Date.now;
  const indexer = createRepoIndexer();
  const buildGraph = deps.buildGraph ?? ((repoRoot: string) => indexer.indexDependencyGraph(repoRoot));
  const cache = new Map<string, { expiresAt: number; graph: Promise<DependencyGraph> }>();

  type GraphInput = {
    readonly repoRoot: string;
    readonly repoId?: string;
    readonly repoAliases?: readonly string[];
    readonly revision?: string;
  };

  async function registerGraph(input: GraphInput, graph: DependencyGraph): Promise<void> {
    const repoId = input.repoId?.trim();
    const revision = input.revision?.trim();
    if (!repoId || !revision || !deps.repositoryNetwork) return;
    try {
      await deps.repositoryNetwork.register(
        repositoryRegistrationFromGraph(repoId, revision, graph),
        input.repoAliases,
      );
    } catch {
      // A registry write cannot make single-repository impact unavailable.
    }
  }

  async function loadGraph(input: GraphInput): Promise<DependencyGraph> {
    const repoId = input.repoId?.trim() || null;
    const revision = input.revision?.trim() || null;
    const cacheKey = `${repoId ?? input.repoRoot}\0${revision ?? 'working-tree'}\0${input.repoRoot}`;
    let cached = cache.get(cacheKey);
    if (!cached || cached.expiresAt <= now()) {
      cached = {
        expiresAt: now() + ttlMs,
        graph: (async () => {
          if (repoId && revision && deps.snapshotStore) {
            try {
              const restored = await deps.snapshotStore.get({
                repoId,
                ...(input.repoAliases && input.repoAliases.length > 0
                  ? { repoAliases: input.repoAliases }
                  : {}),
                repoRoot: input.repoRoot,
                revision,
              });
              if (restored) {
                await registerGraph(input, restored);
                return restored;
              }
            } catch {
              // Persistence failure must not make on-disk impact unavailable.
            }
          }
          const graph = await buildGraph(input.repoRoot);
          if (repoId && revision && deps.snapshotStore) {
            try {
              await deps.snapshotStore.set({ repoId, repoRoot: input.repoRoot, revision, graph });
            } catch {
              // Keep the live graph; the next process can rebuild if KV is down.
            }
          }
          await registerGraph(input, graph);
          return graph;
        })(),
      };
      cache.set(cacheKey, cached);
    }
    return cached.graph;
  }

  const fallback = async (input: PermissiveImpactInput): Promise<FileImpactResult | null> => {
    const targetPath = normalizeRepoPath(input.filePath);
    if (!targetPath) return null;
    const repoId = input.repoId?.trim() || null;
    const cacheKey = `${repoId ?? input.repoRoot}\0${input.revision?.trim() || 'working-tree'}\0${input.repoRoot}`;
    try {
      const graph = await loadGraph(input);
      const result = computeFileImpact({
        graph,
        targetPath,
        symbol: input.symbol,
        direction: input.direction,
        maxDepth: input.maxDepth,
        limit: input.limit,
        includeTests: input.includeTests,
      });
      if (!result || !repoId || !deps.repositoryNetwork) return result;
      const repositoryImpact = await deps.repositoryNetwork.consumerImpact({
        providerRepoId: repoId,
        ...(input.repoAliases && input.repoAliases.length > 0
          ? { providerAliases: input.repoAliases }
          : {}),
        targetPath,
        limit: 100,
      }).catch(() => []);
      if (Array.isArray(repositoryImpact)) return result;
      const crossRepository = repositoryImpact.consumers;
      if (repositoryImpact.total === 0 && !repositoryImpact.partial) return result;
      return {
        ...result,
        impactedCount: result.impactedCount + repositoryImpact.total,
        risk: promoteRisk(result.risk, repositoryImpact.total, repositoryImpact.consumerRepositories),
        partial: result.partial || repositoryImpact.partial,
        summary: {
          ...result.summary,
          cross_repository_files: repositoryImpact.total,
          consumer_repositories: repositoryImpact.consumerRepositories,
        },
        crossRepository,
      };
    } catch {
      cache.delete(cacheKey);
      return null;
    }
  };
  return Object.assign(fallback, {
    async indexRepo(input: {
      readonly repoRoot: string;
      readonly repoId: string;
      readonly repoAliases?: readonly string[];
      readonly revision: string;
    }): Promise<DependencyGraph | null> {
      try {
        return await loadGraph(input);
      } catch {
        return null;
      }
    },
  });
}

function promoteRisk(
  current: FileImpactResult['risk'],
  crossRepositoryFiles: number,
  repositories: number,
): FileImpactResult['risk'] {
  const networkRisk = crossRepositoryFiles >= 20 || repositories >= 5
    ? 'CRITICAL'
    : crossRepositoryFiles >= 8 || repositories >= 3
      ? 'HIGH'
      : crossRepositoryFiles >= 3 || repositories >= 2
        ? 'MEDIUM'
        : 'LOW';
  const order: FileImpactResult['risk'][] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return order.indexOf(networkRisk) > order.indexOf(current) ? networkRisk : current;
}

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

function normalizeRepoPath(value: string | undefined): string | null {
  const normalized = value?.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return null;
  if (normalized.split('/').some((part) => part === '..' || part === '')) return null;
  return normalized;
}
