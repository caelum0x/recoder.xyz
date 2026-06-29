import type { QueryResult } from "../query-service/types";
import type { RerankerPort } from "./types";

/**
 * Rerank a list of {@link QueryResult}s using a {@link RerankerPort}.
 *
 * This is the product-facing entry point that bridges the generic reranker port
 * to the RAG query-service result shape. It feeds each result's chunk content
 * and similarity to the reranker, then reorders the original result objects by
 * the reranker's output — preserving every field (chunk, metadata, additional).
 *
 * Degrade-safe by construction: a well-behaved {@link RerankerPort} returns the
 * original order on failure, and any unexpected reranker error is caught here so
 * search results are returned unchanged rather than lost.
 *
 * @param reranker the reranker port (e.g. ColBERT-backed or no-op)
 * @param query the user query
 * @param results the first-stage retrieval results to reorder
 */
export async function rerankResults<
	TMetadata extends Record<string, unknown> = Record<string, never>,
>(
	reranker: RerankerPort,
	query: string,
	results: QueryResult<TMetadata>[],
): Promise<QueryResult<TMetadata>[]> {
	if (results.length <= 1) {
		return results;
	}

	try {
		const reranked = await reranker.rerank(
			query,
			results.map((result) => ({
				text: result.chunk.content,
				score: result.similarity,
			})),
		);

		// Map reranked candidates back to their original result objects by index.
		// Guard against malformed indices so we never drop or duplicate results.
		const seen = new Set<number>();
		const reordered: QueryResult<TMetadata>[] = [];
		for (const candidate of reranked) {
			const original = results[candidate.originalIndex];
			if (original === undefined || seen.has(candidate.originalIndex)) {
				continue;
			}
			seen.add(candidate.originalIndex);
			reordered.push(
				candidate.rerankScore === undefined
					? original
					: {
							...original,
							additional: {
								...original.additional,
								rerankScore: candidate.rerankScore,
							},
						},
			);
		}

		// If anything was lost (defensive), fall back to the original order.
		return reordered.length === results.length ? reordered : results;
	} catch {
		return results;
	}
}
