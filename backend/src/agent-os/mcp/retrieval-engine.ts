/**
 * retrieval-engine — backend's concrete binding for the `recoder.retrieval`
 * MCP server. It composes the OWNED `@recoder/retrieval` engine over the SHARED
 * vector foundation (`vector-store.ts`: `createEmbeddingPort` + `createVectorStore`,
 * both BYOK + Qdrant, both degrade-safe) plus a ColBERT reranker (env
 * `COLBERT_RERANK_URL`, identity order when unset), then registers the package's
 * real `retrieval.ingest` / `retrieval.search` handlers behind the interop gate.
 *
 * Nothing here fakes success. With no embeddings provider and/or no `QDRANT_URL`,
 * the shared ports report unconfigured and the engine returns a truthful
 * `status: 'not_configured'` — the desktop boots and the tools stay callable with
 * zero external services present.
 */
import { registerRetrievalMcpTools as registerRetrievalToolHandlers } from '@recoder/agent-mcp';
import { createColbertReranker, createRetrievalEngine } from '@recoder/retrieval';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { RerankFetch } from '@recoder/retrieval';
import {
  createEmbeddingPort,
  createVectorStore,
  type FetchLike,
  type VectorEnv,
} from './vector-store.js';

export type RetrievalEngineDeps = {
  /** Injectable fetch (defaults to the global `fetch`). */
  fetch?: FetchLike;
  /** Env subset read by the vector foundation + reranker. Defaults to process.env. */
  env?: VectorEnv & { COLBERT_RERANK_URL?: string };
  /** Override the Qdrant collection the engine ingests into / searches. */
  collection?: string;
};

/**
 * Register the REAL retrieval handlers on the router. The embedder + vector store
 * come from the shared foundation so E1 (code-intelligence semantic) and E2
 * (retrieval) share one Qdrant/embeddings seam; the reranker is the ColBERT HTTP
 * client (degrade-safe to identity order).
 */
export function registerRetrievalMcpTools(
  router: McpToolRouter,
  deps: RetrievalEngineDeps = {},
): void {
  const doFetch: FetchLike =
    deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const env = deps.env ?? (process.env as VectorEnv & { COLBERT_RERANK_URL?: string });

  const embedder = createEmbeddingPort({ fetch: doFetch, env });
  const store = createVectorStore({ fetch: doFetch, env });
  const reranker = createColbertReranker({
    url: env.COLBERT_RERANK_URL,
    // The reranker's RerankFetch is structurally satisfied by the same fetch.
    fetchImpl: doFetch as unknown as RerankFetch,
  });

  const engine = createRetrievalEngine({
    embedder,
    store,
    reranker,
    collection: deps.collection,
  });

  registerRetrievalToolHandlers(router, engine);
}

export { retrievalMcpServer } from '@recoder/agent-mcp';
