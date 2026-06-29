import {
	COLBERT_RERANK_URL_ENV,
	createColbertReranker,
} from "./colbert-reranker";
import { createNoopReranker } from "./noop-reranker";
import type { RerankerPort } from "./types";

export type {
	RerankCandidate,
	RerankedCandidate,
	RerankerPort,
} from "./types";
export { createNoopReranker } from "./noop-reranker";
export {
	COLBERT_RERANK_URL_ENV,
	createColbertReranker,
	type ColbertRerankerOptions,
} from "./colbert-reranker";
export { rerankResults } from "./rerank-results";

/**
 * Resolve the default reranker from the environment.
 *
 * When `COLBERT_RERANK_URL` is set, returns a degrade-safe ColBERT-backed
 * reranker. Otherwise returns the no-op reranker so callers can always call
 * `rerank` unconditionally without branching on configuration.
 */
export function createRerankerFromEnv(
	options: Parameters<typeof createColbertReranker>[0] = {},
): RerankerPort {
	const url = options.url ?? process.env[COLBERT_RERANK_URL_ENV];
	return url ? createColbertReranker(options) : createNoopReranker();
}
