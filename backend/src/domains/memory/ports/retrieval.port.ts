/**
 * `RetrievalPort` — the RAG ingest/search facade other domains (brain, pal, rag,
 * code-intel) consume for document retrieval. The concrete impl
 * (`retrieval/retrieval-service.ts`) composes the shared vector foundation +
 * ColBERT rerank via `@recoder/retrieval`.
 *
 * DEGRADE CONTRACT: with no embedder OR no vector store configured, both
 * operations return a truthful `status: 'not_configured'` — never throw, never
 * fabricate passages.
 */
import type { IngestDoc } from '../types.js';

/** Outcome status of an ingest call. */
export type IngestStatus = 'ingested' | 'empty' | 'not_configured';

/** Outcome of ingesting one document. */
export interface IngestResult {
  readonly status: IngestStatus;
  readonly collection: string;
  readonly docId: string;
  /** Number of chunks produced from the document. */
  readonly chunks: number;
  /** Number of chunk vectors upserted into the store. */
  readonly upserted: number;
  /** Truthful reason when degraded/empty. */
  readonly reason?: string;
}

/** Outcome status of a search call. */
export type SearchStatus = 'ok' | 'not_configured';

/** A single ranked passage returned by search. */
export interface RetrievalPassage {
  readonly id: string | number;
  readonly text: string;
  readonly score: number;
  readonly source?: string;
  readonly docId?: string;
  readonly chunkIndex?: number;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** Which first-stage candidate generator this stat describes. */
export type RetrievalCandidateSourceName = 'qdrant' | 'colbert';

/**
 * Truthful per-generator stats for one search. `qdrant` is the single-vector
 * top-K; `colbert` is the late-interaction PLAID index. `contributed` counts the
 * DISTINCT passages that generator added to the union (colbert's is net-new over
 * qdrant), and `available:false` + a reason means the generator was skipped
 * (degrade-truthful — never a fabricated hit).
 */
export interface RetrievalCandidateSource {
  readonly source: RetrievalCandidateSourceName;
  readonly available: boolean;
  readonly contributed: number;
  readonly reason?: string;
}

/** Outcome of a retrieval search. */
export interface SearchResult {
  readonly status: SearchStatus;
  readonly query: string;
  readonly passages: readonly RetrievalPassage[];
  /** Which reranker actually ran (`colbert` | `identity`). */
  readonly reranker: 'colbert' | 'identity';
  /** Per-generator candidate stats (qdrant + colbert), when a search ran. */
  readonly sources?: readonly RetrievalCandidateSource[];
  readonly reason?: string;
}

/** Options for a search call. */
export interface SearchOpts {
  readonly topK?: number;
  readonly collection?: string;
}

/** Options for an ingest call. */
export interface IngestOpts {
  readonly collection?: string;
}

/** The RAG facade port. */
export interface RetrievalPort {
  ingest(docs: readonly IngestDoc[], opts?: IngestOpts): Promise<readonly IngestResult[]>;
  search(query: string, opts?: SearchOpts): Promise<SearchResult>;
  /** True when both an embedder and a vector store are configured. */
  configured(): boolean;
}
