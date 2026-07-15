/**
 * retrieval-service — the `RetrievalPort` facade over the owned RAG engine
 * (`@recoder/retrieval::createRetrievalEngine`). It composes the shared
 * `VectorFoundation` (embedder + Qdrant + ColBERT) into the ingest/search
 * pipeline:
 *
 *   ingest(docs) → chunk → embed → ensureCollection → upsert(Qdrant)
 *   search(query, topK) → embed → Qdrant search → colbert rerank → passages
 *
 * DEGRADE CONTRACT: with no embedder OR no vector store configured, every result
 * is a truthful `status: 'not_configured'` (never throws, never fabricates). An
 * empty document ingests as `status: 'empty'`; a search over a configured-but-
 * empty store returns `status: 'ok'` with `passages: []`.
 */
import { createRetrievalEngine, type RetrievalEngine } from '@recoder/retrieval';
import type {
  IngestOpts,
  IngestResult,
  RetrievalPort,
  SearchOpts,
  SearchResult,
} from '../ports/retrieval.port.js';
import type { IngestDoc } from '../types.js';
import { ingestDocToChunkInput } from './chunker.js';
import type { VectorFoundation } from './vector-foundation.js';

export interface RetrievalServiceDeps {
  readonly foundation: VectorFoundation;
}

/** Build a RAG engine bound to a specific collection over the foundation ports. */
function engineFor(foundation: VectorFoundation, collection: string): RetrievalEngine {
  return createRetrievalEngine({
    embedder: foundation.embedder,
    store: foundation.store,
    reranker: foundation.reranker,
    collection,
  });
}

/**
 * Build the retrieval service. `ingest` maps each `IngestDoc` through the engine
 * (text wins over path) and returns one `IngestResult` per doc; `search` returns
 * the ranked passages with the reranker that actually ran.
 */
export function createRetrievalService(deps: RetrievalServiceDeps): RetrievalPort {
  const { foundation } = deps;
  const defaultCollection = foundation.retrievalCollection;

  return {
    configured(): boolean {
      return foundation.configured;
    },

    async ingest(docs: readonly IngestDoc[], opts?: IngestOpts): Promise<readonly IngestResult[]> {
      const collection = opts?.collection?.trim() || defaultCollection;
      const engine = engineFor(foundation, collection);
      const out: IngestResult[] = [];
      for (const doc of docs) {
        const input = ingestDocToChunkInput(doc);
        const result = await engine.ingest({
          ...input,
          ...(doc.docId ? { docId: doc.docId } : {}),
          ...(doc.source ? { source: doc.source } : {}),
          ...(doc.metadata ? { metadata: { ...doc.metadata } } : {}),
        });
        out.push(result);
      }
      return out;
    },

    async search(query: string, opts?: SearchOpts): Promise<SearchResult> {
      const collection = opts?.collection?.trim() || defaultCollection;
      const engine = engineFor(foundation, collection);
      const result = await engine.search(query, opts?.topK);
      return {
        status: result.status,
        query: result.query,
        passages: result.passages,
        reranker: result.reranker,
        ...(result.reason ? { reason: result.reason } : {}),
      };
    },
  };
}
