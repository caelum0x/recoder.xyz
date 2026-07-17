/**
 * vector-foundation — the shared vector seam the retrieval engine (and code-intel)
 * compose: an `EmbeddingPort` (BYOK / tensorzero / openai, with an OPTIONAL
 * bootstrap-injected inference fallback) + a `VectorStorePort` (Qdrant REST when
 * `QDRANT_URL` is set, else the EMBEDDED Lance napi store) + a `RerankerPort`
 * (ColBERT), all built from the injected `MemoryConfig` (NO `process.env` here)
 * and each degrade-safe on its own.
 *
 * `configured` is truthful AND live: it is `true` only when an embedding
 * provider is resolvable AND the vector store currently reports `configured` —
 * the embedded Lance store flips its flag to `false` after a truthful failed
 * load, so `configured` is a getter, not a snapshot. Everything else degrades to
 * `not_configured` downstream rather than throwing or faking.
 */
import type { EmbeddingPort } from '../ports/embedding.port.js';
import type { VectorStorePort } from '../ports/vector-store.port.js';
import type { RerankerPort } from '../ports/reranker.port.js';
import type { MemoryConfig } from '../config.js';
import { createEmbeddingAdapter } from '../adapters/embedding.adapter.js';
import { createQdrantAdapter } from '../adapters/qdrant.adapter.js';
import { createLanceAdapter, type LanceVectorStore } from '../adapters/lance.adapter.js';
import { withEmbeddingFallback } from '../adapters/embedding-fallback.adapter.js';
import { createColbertAdapter } from '../adapters/colbert.adapter.js';
import type { LanceModuleLoader } from '../adapters/lance-napi.client.js';
import type { FetchLike } from '../vector-store.js';
import type { ColbertFetch } from '../adapters/colbert-sidecar.client.js';

/** Which concrete store backs the `VectorStorePort` seam. */
export type VectorStoreBackend = 'qdrant' | 'lance';

/** Truthful async store readiness (for health rollup — never a faked up). */
export interface VectorStoreReadiness {
  readonly available: boolean;
  readonly backend: VectorStoreBackend;
  readonly reason?: string;
}

export interface VectorFoundation {
  readonly embedder: EmbeddingPort;
  readonly store: VectorStorePort;
  readonly reranker: RerankerPort;
  /** True only when an embedding provider AND a vector store are both wired. */
  readonly configured: boolean;
  /** Which store implementation is serving (`qdrant` wins when its URL is set). */
  readonly storeBackend: VectorStoreBackend;
  /** The retrieval collection name from config (`recoder_retrieval` default). */
  readonly retrievalCollection: string;
  /** Force a truthful readiness probe (lance attempts its napi/SDK load). */
  probeStore(): Promise<VectorStoreReadiness>;
}

export interface VectorFoundationDeps {
  readonly config: MemoryConfig;
  /** Injectable fetch for the embedding + vector adapters (tests). */
  readonly fetchImpl?: FetchLike;
  /** Injectable fetch for the colbert sidecar (tests). */
  readonly colbertFetch?: ColbertFetch;
  /**
   * OPTIONAL inference-domain embed seam (bootstrap-injected, already shaped as
   * the domain `EmbeddingPort`). Used when the HTTP providers are unconfigured
   * or fail — never imported cross-domain here.
   */
  readonly embedFallback?: EmbeddingPort;
  /** Test seam for the embedded lance module loader. */
  readonly lanceLoader?: LanceModuleLoader;
}

/**
 * Compose the shared vector foundation from config. Each port is independently
 * degrade-safe; `configured` reflects the AND of embedder + store readiness.
 */
export function createVectorFoundation(deps: VectorFoundationDeps): VectorFoundation {
  const { config } = deps;
  const embedder = withEmbeddingFallback(
    createEmbeddingAdapter(config, deps.fetchImpl),
    deps.embedFallback ?? null,
  );
  const { reranker } = createColbertAdapter(config, deps.colbertFetch);

  // Qdrant when its URL is wired; otherwise the embedded (no-server) Lance store.
  const useQdrant = Boolean(config.qdrantUrl);
  const lance: LanceVectorStore | null = useQdrant ? null : createLanceAdapter(config, deps.lanceLoader);
  const store: VectorStorePort = lance ?? createQdrantAdapter(config, deps.fetchImpl);

  const embedderConfigured = (embedder.provider ?? 'none') !== 'none';

  return {
    embedder,
    store,
    reranker,
    // Live view: the lance store truthfully flips `configured` after a failed load.
    get configured(): boolean {
      return embedderConfigured && store.configured;
    },
    storeBackend: useQdrant ? 'qdrant' : 'lance',
    retrievalCollection: config.retrievalCollection,

    async probeStore(): Promise<VectorStoreReadiness> {
      if (lance) {
        const status = await lance.probe();
        return {
          available: status.available,
          backend: 'lance',
          ...(status.reason ? { reason: status.reason } : {}),
        };
      }
      return store.configured
        ? { available: true, backend: 'qdrant' }
        : { available: false, backend: 'qdrant', reason: 'QDRANT_URL not set' };
    },
  };
}
