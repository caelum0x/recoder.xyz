/**
 * @recoder/retrieval — the owned Retrieval / RAG engine (RECODER-ENGINES E2).
 * Ingest → chunk → embed → store (Qdrant) → ColBERT rerank → passages, with every
 * port injected and every path degrade-safe.
 */
export {
	chunkDocument,
	chunkText,
	type Chunk,
	type ChunkInput,
	type ChunkOptions,
} from "./chunk.js";
export type { EmbeddingPort } from "./embed.js";
export type {
	VectorDistance,
	VectorMatch,
	VectorPoint,
	VectorStorePort,
} from "./store.js";
export {
	createColbertReranker,
	createIdentityReranker,
	type ColbertRerankerOptions,
	type RerankCandidate,
	type RerankerPort,
	type RerankFetch,
	type RerankHttpResponse,
} from "./rerank.js";
export {
	createRetrievalEngine,
	DEFAULT_COLLECTION,
	type IngestInput,
	type IngestResult,
	type IngestStatus,
	type RetrievalEngine,
	type RetrievalEngineDeps,
	type RetrievalPassage,
	type SearchResult,
	type SearchStatus,
} from "./retrieval-engine.js";
