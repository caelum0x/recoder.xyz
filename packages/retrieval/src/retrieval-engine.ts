/**
 * retrieval-engine — the owned Retrieval/RAG engine (RECODER-ENGINES E2). It
 * composes the injected ports into the RAG pipeline:
 *
 *   ingest(text|path) → chunk → embed → ensureCollection → upsert(Qdrant)
 *   search(query,topK) → embed → Qdrant search → colbert rerank → passages
 *
 * INJECTABLE BY CONSTRUCTION: the embedder, vector store, reranker, and chunker
 * are all passed in, so unit tests drive it with fakes and touch no network. The
 * backend wires the shared foundation (`vector-store.ts`) + a ColBERT reranker.
 *
 * DEGRADE-SAFE (the hard rule): with no embedder OR no vector store configured,
 * both operations return a truthful `status: 'not_configured'` (never throw, never
 * fabricate). An empty document ingests as `status: 'empty'`. A search over a
 * configured-but-empty store returns `status: 'ok'` with `passages: []`.
 */
import { chunkDocument, type Chunk, type ChunkInput, type ChunkOptions } from "./chunk.js";
import type { EmbeddingPort } from "./embed.js";
import { createIdentityReranker, type RerankCandidate, type RerankerPort } from "./rerank.js";
import type { VectorMatch, VectorPoint, VectorStorePort } from "./store.js";

/** Default Qdrant collection the engine ingests into / searches. */
export const DEFAULT_COLLECTION = "recoder_retrieval";
/** Over-fetch factor before reranking so ColBERT can reorder a wider pool. */
const RERANK_OVERFETCH = 4;

export interface IngestInput extends ChunkInput {
	/** Logical document id (grouping key stored in each chunk's payload). */
	docId?: string;
	/** Human-readable source label (filename, URL, title). */
	source?: string;
	/** Extra payload merged into every chunk point. */
	metadata?: Record<string, unknown>;
}

export type IngestStatus = "ingested" | "empty" | "not_configured";

export interface IngestResult {
	status: IngestStatus;
	collection: string;
	docId: string;
	/** Number of chunks produced from the document. */
	chunks: number;
	/** Number of chunk vectors upserted into the store. */
	upserted: number;
	/** Truthful reason when degraded (not_configured) or empty. */
	reason?: string;
}

export type SearchStatus = "ok" | "not_configured";

export interface RetrievalPassage {
	id: string | number;
	text: string;
	score: number;
	source?: string;
	docId?: string;
	chunkIndex?: number;
	payload?: Record<string, unknown>;
}

export interface SearchResult {
	status: SearchStatus;
	query: string;
	passages: RetrievalPassage[];
	/** Which reranker actually ran ('colbert' | 'identity'). */
	reranker: RerankerPort["kind"];
	reason?: string;
}

export interface RetrievalEngine {
	ingest(input: IngestInput): Promise<IngestResult>;
	search(query: string, topK?: number): Promise<SearchResult>;
}

export interface RetrievalEngineDeps {
	/** Embeds text into vectors. `embed → null` ⇒ engine degrades truthfully. */
	embedder: EmbeddingPort;
	/** Vector store. `configured === false` ⇒ engine degrades truthfully. */
	store: VectorStorePort;
	/** Reranker. Defaults to identity order (no ColBERT). */
	reranker?: RerankerPort;
	/** Qdrant collection name. Defaults to {@link DEFAULT_COLLECTION}. */
	collection?: string;
	/** Chunk sizing options. */
	chunkOptions?: ChunkOptions;
	/** Injectable id generator for chunk points (defaults to `crypto.randomUUID`). */
	generateId?: () => string;
}

const NOT_CONFIGURED_REASON =
	"retrieval not configured (no embedder and/or vector store available)";

export function createRetrievalEngine(deps: RetrievalEngineDeps): RetrievalEngine {
	const { embedder, store } = deps;
	const reranker = deps.reranker ?? createIdentityReranker();
	const collection = deps.collection?.trim() || DEFAULT_COLLECTION;
	const generateId = deps.generateId ?? defaultId;

	async function ingest(input: IngestInput): Promise<IngestResult> {
		const docId = input.docId?.trim() || `doc_${generateId()}`;
		const base: Omit<IngestResult, "status" | "reason"> = {
			collection,
			docId,
			chunks: 0,
			upserted: 0,
		};

		// The store is a truthful no-op when unconfigured — refuse before doing work.
		if (!store.configured) {
			return { ...base, status: "not_configured", reason: NOT_CONFIGURED_REASON };
		}

		const chunks = await chunkDocument(input, deps.chunkOptions);
		if (chunks.length === 0) {
			return { ...base, status: "empty", reason: "document produced no chunks" };
		}

		const vectors = await embedder.embed(chunks.map((c) => c.text));
		// `null` ⇒ no embedding provider (or a failure) ⇒ degrade truthfully.
		if (vectors === null || vectors.length !== chunks.length) {
			return {
				...base,
				status: "not_configured",
				chunks: chunks.length,
				reason: NOT_CONFIGURED_REASON,
			};
		}

		const dim = vectors[0]?.length ?? 0;
		if (dim === 0) {
			return {
				...base,
				status: "not_configured",
				chunks: chunks.length,
				reason: NOT_CONFIGURED_REASON,
			};
		}

		await store.ensureCollection(collection, dim);
		const points = buildPoints(chunks, vectors, {
			docId,
			source: input.source,
			metadata: input.metadata,
			generateId,
		});
		const ok = await store.upsert(collection, points);

		return {
			...base,
			status: "ingested",
			chunks: chunks.length,
			upserted: ok ? points.length : 0,
			reason: ok ? undefined : "vector store upsert did not confirm",
		};
	}

	async function search(query: string, topK = 8): Promise<SearchResult> {
		const limit = Number.isFinite(topK) && topK > 0 ? Math.floor(topK) : 8;
		const empty: SearchResult = {
			status: "ok",
			query,
			passages: [],
			reranker: reranker.kind,
		};

		if (typeof query !== "string" || query.trim().length === 0) {
			return empty;
		}
		if (!store.configured) {
			return { ...empty, status: "not_configured", reason: NOT_CONFIGURED_REASON };
		}

		const vectors = await embedder.embed([query]);
		if (vectors === null || vectors.length === 0 || (vectors[0]?.length ?? 0) === 0) {
			return { ...empty, status: "not_configured", reason: NOT_CONFIGURED_REASON };
		}

		const matches = await store.search(collection, vectors[0], limit * RERANK_OVERFETCH);
		if (matches.length === 0) {
			return empty;
		}

		const candidates = matches.map(matchToCandidate);
		const reranked = await reranker.rerank(query, candidates);
		const passages = reranked.slice(0, limit).map(candidateToPassage);

		return { status: "ok", query, passages, reranker: reranker.kind };
	}

	return { ingest, search };
}

function buildPoints(
	chunks: Chunk[],
	vectors: number[][],
	opts: {
		docId: string;
		source?: string;
		metadata?: Record<string, unknown>;
		generateId: () => string;
	},
): VectorPoint[] {
	return chunks.map((chunk, i) => ({
		// Qdrant point ids must be uint or UUID — generate a UUID and keep the
		// logical (docId, chunkIndex) in the payload.
		id: opts.generateId(),
		vector: vectors[i],
		payload: {
			...(opts.metadata ?? {}),
			text: chunk.text,
			docId: opts.docId,
			chunkIndex: chunk.index,
			...(opts.source ? { source: opts.source } : {}),
		},
	}));
}

function matchToCandidate(match: VectorMatch): RerankCandidate {
	const payload = match.payload ?? {};
	const text = typeof payload.text === "string" ? payload.text : "";
	return { id: match.id, text, score: match.score, payload };
}

function candidateToPassage(candidate: RerankCandidate): RetrievalPassage {
	const payload = candidate.payload ?? {};
	return {
		id: candidate.id,
		text: candidate.text,
		score: candidate.score ?? 0,
		source: typeof payload.source === "string" ? payload.source : undefined,
		docId: typeof payload.docId === "string" ? payload.docId : undefined,
		chunkIndex:
			typeof payload.chunkIndex === "number" ? payload.chunkIndex : undefined,
		payload,
	};
}

/** Default point-id generator (crypto.randomUUID with a timestamp fallback). */
function defaultId(): string {
	try {
		const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
		if (c && typeof c.randomUUID === "function") {
			return c.randomUUID();
		}
	} catch {
		// fall through
	}
	return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
