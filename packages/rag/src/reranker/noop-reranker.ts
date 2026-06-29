import type {
	RerankCandidate,
	RerankedCandidate,
	RerankerPort,
} from "./types";

/**
 * Identity reranker: preserves the input order. Used as the degrade-safe
 * default when no rerank service is configured, and as the fallback any other
 * implementation returns when its backing service is unavailable.
 */
export function createNoopReranker(): RerankerPort {
	return {
		async rerank(
			_query: string,
			candidates: RerankCandidate[],
		): Promise<RerankedCandidate[]> {
			return candidates.map((candidate, originalIndex) => ({
				...candidate,
				originalIndex,
			}));
		},
	};
}

/** Shared helper: map candidates to their original order without scores. */
export function preserveOrder(
	candidates: RerankCandidate[],
): RerankedCandidate[] {
	return candidates.map((candidate, originalIndex) => ({
		...candidate,
		originalIndex,
	}));
}
