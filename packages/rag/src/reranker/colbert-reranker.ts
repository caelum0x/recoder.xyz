import { preserveOrder } from "./noop-reranker";
import type {
	RerankCandidate,
	RerankedCandidate,
	RerankerPort,
} from "./types";

/** Environment variable holding the ColBERT rerank HTTP endpoint URL. */
export const COLBERT_RERANK_URL_ENV = "COLBERT_RERANK_URL";

/** Default request timeout (ms). Kept short so reranking never stalls search. */
const DEFAULT_TIMEOUT_MS = 1500;

export interface ColbertRerankerOptions {
	/**
	 * Full URL of the ColBERT `/rerank` endpoint. When omitted, falls back to
	 * `process.env.COLBERT_RERANK_URL`. When neither is set, the reranker is
	 * disabled and behaves as a no-op (identity order).
	 */
	url?: string;
	/** Request timeout in milliseconds. Defaults to 1500ms. */
	timeoutMs?: number;
	/** Injectable fetch for testing. Defaults to global `fetch`. */
	fetchImpl?: typeof fetch;
	/** Optional log sink for degraded paths. Defaults to a silent no-op. */
	onDegrade?: (reason: string, error?: unknown) => void;
}

/** Shape of a single scored passage in the ColBERT `/rerank` response. */
interface ColbertScoredPassage {
	index: number;
	score: number;
}

/** Expected JSON body returned by the ColBERT `/rerank` endpoint. */
interface ColbertRerankResponse {
	results: ColbertScoredPassage[];
}

function isValidResponse(
	body: unknown,
	candidateCount: number,
): body is ColbertRerankResponse {
	if (typeof body !== "object" || body === null) return false;
	const results = (body as { results?: unknown }).results;
	if (!Array.isArray(results)) return false;
	return results.every((entry) => {
		if (typeof entry !== "object" || entry === null) return false;
		const { index, score } = entry as Record<string, unknown>;
		return (
			typeof index === "number" &&
			Number.isInteger(index) &&
			index >= 0 &&
			index < candidateCount &&
			typeof score === "number" &&
			Number.isFinite(score)
		);
	});
}

/**
 * Reranker backed by a ColBERT late-interaction HTTP service.
 *
 * It POSTs `{ query, passages }` to `COLBERT_RERANK_URL` and reorders the
 * candidates by the returned late-interaction scores. Every failure mode —
 * missing URL, network error, timeout, non-2xx, or malformed body — degrades
 * to preserving the original order. It never throws and never blocks search.
 *
 * This intentionally talks to ColBERT over HTTP rather than importing torch /
 * faiss in-process, keeping the Node runtime light.
 */
export function createColbertReranker(
	options: ColbertRerankerOptions = {},
): RerankerPort {
	const url = options.url ?? process.env[COLBERT_RERANK_URL_ENV];
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const onDegrade = options.onDegrade ?? (() => {});

	const enabled = Boolean(url) && typeof fetchImpl === "function";

	async function rerank(
		query: string,
		candidates: RerankCandidate[],
	): Promise<RerankedCandidate[]> {
		if (!enabled || candidates.length === 0) {
			return preserveOrder(candidates);
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetchImpl(url as string, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					query,
					passages: candidates.map((candidate) => candidate.text),
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				onDegrade(`rerank service returned HTTP ${response.status}`);
				return preserveOrder(candidates);
			}

			const body: unknown = await response.json();
			if (!isValidResponse(body, candidates.length)) {
				onDegrade("rerank service returned malformed response");
				return preserveOrder(candidates);
			}

			return applyScores(candidates, body.results);
		} catch (error) {
			onDegrade("rerank service unreachable", error);
			return preserveOrder(candidates);
		} finally {
			clearTimeout(timer);
		}
	}

	return { rerank };
}

/**
 * Apply ColBERT scores to candidates and sort descending by score. Candidates
 * the service did not score retain their original score and sink below scored
 * ones while keeping a stable relative order.
 */
function applyScores(
	candidates: RerankCandidate[],
	results: ColbertScoredPassage[],
): RerankedCandidate[] {
	const scoreByIndex = new Map<number, number>();
	for (const { index, score } of results) {
		scoreByIndex.set(index, score);
	}

	const reranked: RerankedCandidate[] = candidates.map(
		(candidate, originalIndex) => ({
			...candidate,
			originalIndex,
			rerankScore: scoreByIndex.get(originalIndex),
		}),
	);

	return reranked.sort((a, b) => {
		const aScored = a.rerankScore !== undefined;
		const bScored = b.rerankScore !== undefined;
		if (aScored && bScored) {
			return (b.rerankScore as number) - (a.rerankScore as number);
		}
		if (aScored) return -1;
		if (bScored) return 1;
		// Both unscored: keep original retrieval order.
		return a.originalIndex - b.originalIndex;
	});
}
