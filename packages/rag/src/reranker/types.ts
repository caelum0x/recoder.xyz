/**
 * Reranker port: an OPTIONAL second-stage reranking of already-retrieved
 * candidates. Implementations MUST be degrade-safe: if the backing service is
 * unconfigured or unreachable, they MUST return the input order unchanged and
 * never throw. Reranking is a quality enhancement, not a correctness
 * requirement — it must never block or break search.
 */

/** A candidate passage to be reranked, paired with its original score. */
export interface RerankCandidate {
	/** The passage text the reranker scores against the query. */
	text: string;
	/** Original retrieval score (e.g. vector similarity). Used for fallback. */
	score: number;
}

/** A reranked candidate carrying the late-interaction score when available. */
export interface RerankedCandidate extends RerankCandidate {
	/**
	 * Index of this candidate in the original input array. Lets callers re-map
	 * reranked text back to their richer result objects without string matching.
	 */
	originalIndex: number;
	/**
	 * Late-interaction (or other reranker) score assigned by the service.
	 * `undefined` when the original order was preserved (fallback path).
	 */
	rerankScore?: number;
}

export interface RerankerPort {
	/**
	 * Reorder `candidates` for the given `query` by reranker score.
	 *
	 * Contract:
	 * - MUST NOT throw. On any error or when disabled, return the candidates in
	 *   their original order (each with its `originalIndex`, no `rerankScore`).
	 * - SHOULD return the same set of candidates it received (no add/drop).
	 * - MAY be a no-op (identity reorder) when unconfigured.
	 */
	rerank(
		query: string,
		candidates: RerankCandidate[],
	): Promise<RerankedCandidate[]>;
}
