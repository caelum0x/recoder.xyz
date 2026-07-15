/**
 * vector-foundation — the shared vector seam the retrieval engine (and code-intel)
 * compose: an `EmbeddingPort` (BYOK / tensorzero / openai) + a `VectorStorePort`
 * (Qdrant REST) + a `RerankerPort` (ColBERT), all built from the injected
 * `MemoryConfig` (NO `process.env` here) and each degrade-safe on its own.
 *
 * `configured` is truthful: it is `true` only when BOTH an embedding provider is
 * resolvable AND the vector store has a URL — the exact precondition under which
 * retrieval ingest/search can do real work. Everything else degrades to
 * `not_configured` downstream rather than throwing or faking.
 */
import type { EmbeddingPort } from '../ports/embedding.port.js';
import type { VectorStorePort } from '../ports/vector-store.port.js';
import type { RerankerPort } from '../ports/reranker.port.js';
import type { MemoryConfig } from '../config.js';
import { createEmbeddingAdapter } from '../adapters/embedding.adapter.js';
import { createQdrantAdapter } from '../adapters/qdrant.adapter.js';
import { createColbertAdapter } from '../adapters/colbert.adapter.js';
import type { FetchLike } from '../vector-store.js';
import type { ColbertFetch } from '../adapters/colbert-sidecar.client.js';

export interface VectorFoundation {
  readonly embedder: EmbeddingPort;
  readonly store: VectorStorePort;
  readonly reranker: RerankerPort;
  /** True only when an embedding provider AND a vector store are both wired. */
  readonly configured: boolean;
  /** The retrieval collection name from config (`recoder_retrieval` default). */
  readonly retrievalCollection: string;
}

export interface VectorFoundationDeps {
  readonly config: MemoryConfig;
  /** Injectable fetch for the embedding + vector adapters (tests). */
  readonly fetchImpl?: FetchLike;
  /** Injectable fetch for the colbert sidecar (tests). */
  readonly colbertFetch?: ColbertFetch;
}

/**
 * Compose the shared vector foundation from config. Each port is independently
 * degrade-safe; `configured` reflects the AND of embedder + store readiness.
 */
export function createVectorFoundation(deps: VectorFoundationDeps): VectorFoundation {
  const { config } = deps;
  const embedder = createEmbeddingAdapter(config, deps.fetchImpl);
  const store = createQdrantAdapter(config, deps.fetchImpl);
  const { reranker } = createColbertAdapter(config, deps.colbertFetch);

  const embedderConfigured = (embedder.provider ?? 'none') !== 'none';
  const configured = embedderConfigured && store.configured;

  return {
    embedder,
    store,
    reranker,
    configured,
    retrievalCollection: config.retrievalCollection,
  };
}
