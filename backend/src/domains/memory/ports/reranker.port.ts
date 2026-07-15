/**
 * `RerankerPort` — the late-interaction rerank seam (ColBERT), re-exported from
 * `@recoder/retrieval`. The colbert adapter wraps the py `/rerank` service and
 * degrades to identity order when `COLBERT_RERANK_URL` is unset or on any
 * failure. Recall fusion (a later phase) calls this to reorder fused candidates.
 *
 * `RerankResult` is the domain-local convenience shape used by call sites that
 * want the reordered passages + the original-index permutation (mirrors the
 * legacy `conductor/colbert-rerank.ts` return), independent of the candidate
 * object form the package port reranks.
 */
export type { RerankerPort, RerankCandidate } from '@recoder/retrieval';

/** Reorder outcome for a plain-string passage list (identity order on degrade). */
export interface RerankResult {
  /** True when the rerank service was actually reached and returned an order. */
  readonly available: boolean;
  /** Passages in rerank order (best first). Original order on any failure. */
  readonly passages: readonly string[];
  /** Original indices in rerank order; `order[0]` is the best passage's index. */
  readonly order: readonly number[];
  /** Why the rerank was skipped/failed (only set when `available` is false). */
  readonly reason?: string;
}
