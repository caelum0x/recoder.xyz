/**
 * retrieval-fusion — the pure UNION → rerank → topK step that promotes ColBERT
 * from a rerank-only stage to a FIRST-STAGE candidate generator alongside Qdrant.
 *
 * Today the RAG engine can only rerank what Qdrant's single-vector top-K returned,
 * so a passage Qdrant misses can NEVER be reranked in. This helper unions the
 * Qdrant passages with the ColBERT late-interaction index hits, dedupes by passage
 * text, then reranks the whole pool by MaxSim so a ColBERT-only hit competes on
 * equal footing with a Qdrant hit — and can win a slot Qdrant would have dropped.
 *
 * PURE + degrade-safe: no I/O here (the caller supplies both candidate sets and
 * the reranker). When ColBERT contributes nothing the result is exactly the Qdrant
 * order (identity fusion). The reranker itself degrades to identity order, so the
 * pre-sort by score keeps the output sensible even with no live ColBERT rerank.
 */
import type { RerankCandidate, RerankerPort } from '@recoder/retrieval';
import type { RetrievalPassage } from '../ports/retrieval.port.js';
import type { ColbertSearchHit } from '../ports/colbert-search.port.js';

/** Normalize passage text into a dedupe key (collapse whitespace, casefold). */
function passageKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Map a ColBERT index hit into the shared `RetrievalPassage` shape. */
function hitToPassage(hit: ColbertSearchHit): RetrievalPassage {
  return {
    id: hit.pid ?? `colbert:${passageKey(hit.text).slice(0, 32)}`,
    text: hit.text,
    score: hit.score,
    source: 'colbert',
    payload: { source: 'colbert', ...(hit.pid !== undefined ? { pid: hit.pid } : {}) },
  };
}

/** Map a passage into a rerank candidate (text is what MaxSim scores). */
function passageToCandidate(passage: RetrievalPassage): RerankCandidate {
  return {
    id: passage.id,
    text: passage.text,
    score: passage.score,
    ...(passage.payload ? { payload: { ...passage.payload } } : {}),
  };
}

export interface RetrievalFusionInput {
  readonly query: string;
  readonly topK: number;
  /** Qdrant-derived passages (already reranked by the RAG engine). */
  readonly qdrantPassages: readonly RetrievalPassage[];
  /** ColBERT late-interaction index hits (the new first-stage candidates). */
  readonly colbertHits: readonly ColbertSearchHit[];
  /** The reranker that scores the union (colbert when up, identity on degrade). */
  readonly reranker: RerankerPort;
}

export interface RetrievalFusionResult {
  /** The fused, reranked, deduped passages (best-first, ≤ topK). */
  readonly passages: readonly RetrievalPassage[];
  /** How many DISTINCT passages ColBERT added that Qdrant did not already have. */
  readonly colbertContributed: number;
}

/**
 * Union the two candidate sets (dedupe by normalized text, Qdrant wins the payload
 * on a tie), rerank the pool, and take the best `topK`. Reports how many net-new
 * passages ColBERT contributed so the caller can surface truthful source stats.
 */
export async function fuseRetrievalCandidates(
  input: RetrievalFusionInput,
): Promise<RetrievalFusionResult> {
  const { query, topK, qdrantPassages, colbertHits, reranker } = input;
  const limit = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : 8;

  const byKey = new Map<string, RetrievalPassage>();
  for (const passage of qdrantPassages) {
    byKey.set(passageKey(passage.text), passage);
  }
  let colbertContributed = 0;
  for (const hit of colbertHits) {
    const key = passageKey(hit.text);
    if (!key || byKey.has(key)) continue; // Qdrant already had this passage.
    byKey.set(key, hitToPassage(hit));
    colbertContributed += 1;
  }

  const union = [...byKey.values()];
  // Pre-sort by score so the identity-reranker degrade path stays sensible.
  union.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const reranked = await reranker.rerank(query, union.map(passageToCandidate));
  const passages = reranked.slice(0, limit).map<RetrievalPassage>((candidate) => {
    const payload = candidate.payload ?? {};
    return {
      id: candidate.id,
      text: candidate.text,
      score: candidate.score ?? 0,
      source: typeof payload.source === 'string' ? payload.source : undefined,
      docId: typeof payload.docId === 'string' ? payload.docId : undefined,
      chunkIndex: typeof payload.chunkIndex === 'number' ? payload.chunkIndex : undefined,
      payload,
    };
  });

  return { passages, colbertContributed };
}
