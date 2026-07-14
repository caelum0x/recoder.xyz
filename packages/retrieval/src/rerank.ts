/**
 * rerank — the late-interaction reranking seam. `createColbertReranker` POSTs the
 * query + candidate passages to a ColBERT `/rerank` HTTP service (env
 * `COLBERT_RERANK_URL`, see `backend/engines/py/colbert/rerank_server.py`) and reorders candidates
 * by the returned scores. When no URL is configured, or on ANY failure (network,
 * timeout, non-2xx, malformed body), it degrades to identity order — the reranker
 * never throws and never blocks search.
 *
 * Talks to ColBERT over HTTP rather than importing torch/faiss in-process, keeping
 * the Node runtime light. Fetch is injectable so unit tests touch no network.
 */

export interface RerankCandidate {
	id: string | number;
	text: string;
	/** Retrieval score carried from the vector search (used for stable ties). */
	score?: number;
	payload?: Record<string, unknown>;
}

export interface RerankerPort {
	/** Which reranker is wired — surfaced for truthful health. */
	readonly kind: "colbert" | "identity";
	/**
	 * Reorder `candidates` for `query`. Returns a new array (immutable) in the
	 * reranked order; degrades to the input order on any failure.
	 */
	rerank(
		query: string,
		candidates: RerankCandidate[],
	): Promise<RerankCandidate[]>;
}

/** Minimal fetch shape so tests can supply a fake without building a Response. */
export interface RerankHttpResponse {
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
}
export type RerankFetch = (
	url: string,
	init: {
		method: string;
		headers: Record<string, string>;
		body: string;
		signal?: AbortSignal;
	},
) => Promise<RerankHttpResponse>;

export interface ColbertRerankerOptions {
	/** ColBERT `/rerank` endpoint. Falls back to `process.env.COLBERT_RERANK_URL`. */
	url?: string;
	/** Injectable fetch. Defaults to the global `fetch`. */
	fetchImpl?: RerankFetch;
	/** Request timeout (ms). Default 1500 — reranking must not stall search. */
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;

/** Identity reranker: preserves the incoming (immutable copy) order. */
export function createIdentityReranker(): RerankerPort {
	return {
		kind: "identity",
		async rerank(_query, candidates) {
			return [...candidates];
		},
	};
}

/**
 * ColBERT-backed reranker. Degrades to identity order when no URL is configured
 * or on any request/parse failure.
 */
export function createColbertReranker(
	options: ColbertRerankerOptions = {},
): RerankerPort {
	const url =
		options.url ??
		(typeof process !== "undefined"
			? process.env?.COLBERT_RERANK_URL
			: undefined);
	const fetchImpl =
		options.fetchImpl ??
		(typeof fetch === "function" ? (fetch as unknown as RerankFetch) : undefined);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const enabled = Boolean(url) && typeof fetchImpl === "function";

	if (!enabled) {
		return createIdentityReranker();
	}

	return {
		kind: "colbert",
		async rerank(query, candidates) {
			if (candidates.length === 0) {
				return [];
			}
			try {
				const res = await (fetchImpl as RerankFetch)(url as string, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						query,
						passages: candidates.map((c) => c.text),
					}),
					signal: timeoutSignal(timeoutMs),
				});
				if (!res.ok) {
					return [...candidates];
				}
				const scored = parseScores(await res.json(), candidates.length);
				if (!scored) {
					return [...candidates];
				}
				return applyScores(candidates, scored);
			} catch {
				return [...candidates];
			}
		},
	};
}

/** Parse the `{ results: [{ index, score }] }` body into an index→score map. */
function parseScores(
	body: unknown,
	candidateCount: number,
): Map<number, number> | null {
	const results = (body as { results?: unknown })?.results;
	if (!Array.isArray(results)) {
		return null;
	}
	const scores = new Map<number, number>();
	for (const entry of results) {
		const index = (entry as { index?: unknown })?.index;
		const score = (entry as { score?: unknown })?.score;
		if (
			typeof index !== "number" ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= candidateCount ||
			typeof score !== "number" ||
			!Number.isFinite(score)
		) {
			return null;
		}
		scores.set(index, score);
	}
	return scores;
}

/** Sort candidates by ColBERT score desc; unscored sink below, keeping order. */
function applyScores(
	candidates: RerankCandidate[],
	scores: Map<number, number>,
): RerankCandidate[] {
	const withOrder = candidates.map((candidate, originalIndex) => ({
		candidate,
		originalIndex,
		rerankScore: scores.get(originalIndex),
	}));
	withOrder.sort((a, b) => {
		const aScored = a.rerankScore !== undefined;
		const bScored = b.rerankScore !== undefined;
		if (aScored && bScored) {
			return (b.rerankScore as number) - (a.rerankScore as number);
		}
		if (aScored) return -1;
		if (bScored) return 1;
		return a.originalIndex - b.originalIndex;
	});
	return withOrder.map((row) => row.candidate);
}

/** Best-effort abort signal; absent in some runtimes, so guard it. */
function timeoutSignal(ms: number): AbortSignal | undefined {
	try {
		const ctor = (AbortSignal as unknown as {
			timeout?: (n: number) => AbortSignal;
		}).timeout;
		return typeof ctor === "function" ? ctor(ms) : undefined;
	} catch {
		return undefined;
	}
}
