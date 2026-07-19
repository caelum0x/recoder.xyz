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
  RetrievalCandidateSource,
  RetrievalPort,
  SearchOpts,
  SearchResult,
} from '../ports/retrieval.port.js';
import type { ColbertSearchPort } from '../ports/colbert-search.port.js';
import type { IngestDoc } from '../types.js';
import { ingestDocToChunkInput } from './chunker.js';
import { fuseRetrievalCandidates } from './retrieval-fusion.js';
import type { VectorFoundation } from './vector-foundation.js';

export interface RetrievalServiceDeps {
  readonly foundation: VectorFoundation;
  /**
   * OPTIONAL FIRST-STAGE ColBERT retriever. When present + configured, its
   * late-interaction index hits are UNIONed with the Qdrant top-K before the
   * final rerank, so passages Qdrant misses can still enter results. Absent /
   * unconfigured → Qdrant-only (degrade-truthful, never blocks a search).
   */
  readonly colbertSearch?: ColbertSearchPort;
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
  const { foundation, colbertSearch } = deps;
  const defaultCollection = foundation.retrievalCollection;

  /**
   * Union the Qdrant-derived search with the ColBERT first-stage index hits.
   * Runs both generators in parallel, folds ColBERT's net-new candidates into the
   * pool, and reranks the union so a late-interaction-only hit can win a slot. On
   * ANY ColBERT degrade (unconfigured, unbuilt index, torch absent) the Qdrant
   * result passes through untouched — truthful, never blocking.
   */
  async function fuseWithColbert(
    query: string,
    collection: string,
    topK: number,
    qdrant: SearchResult,
  ): Promise<SearchResult> {
    const qdrantStat: RetrievalCandidateSource = {
      source: 'qdrant',
      available: true,
      contributed: qdrant.passages.length,
    };
    if (!colbertSearch || !colbertSearch.configured()) {
      return {
        ...qdrant,
        sources: [
          qdrantStat,
          { source: 'colbert', available: false, contributed: 0, reason: 'colbert search not configured' },
        ],
      };
    }
    const colbert = await colbertSearch.search(collection, query, topK);
    if (!colbert.available || colbert.hits.length === 0) {
      return {
        ...qdrant,
        sources: [
          qdrantStat,
          {
            source: 'colbert',
            available: colbert.available,
            contributed: 0,
            ...(colbert.reason ? { reason: colbert.reason } : {}),
          },
        ],
      };
    }
    const fused = await fuseRetrievalCandidates({
      query,
      topK,
      qdrantPassages: qdrant.passages,
      colbertHits: colbert.hits,
      reranker: foundation.reranker,
    });
    return {
      status: 'ok',
      query,
      passages: fused.passages,
      reranker: foundation.reranker.kind,
      sources: [
        qdrantStat,
        { source: 'colbert', available: true, contributed: fused.colbertContributed },
      ],
    };
  }

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
      const topK = opts?.topK ?? 8;
      const result = await engine.search(query, topK);
      const qdrant: SearchResult = {
        status: result.status,
        query: result.query,
        passages: result.passages,
        reranker: result.reranker,
        ...(result.reason ? { reason: result.reason } : {}),
      };
      // Only fuse a real search (a not_configured Qdrant stays truthfully as-is).
      if (qdrant.status !== 'ok') return qdrant;
      return fuseWithColbert(query, collection, topK, qdrant);
    },
  };
}
