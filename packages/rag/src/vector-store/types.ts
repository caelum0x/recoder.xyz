import type { ChunkWithEmbedding } from "../chunk-store/types";
import type { QueryResult } from "../query-service/types";

/**
 * A single embedded record persisted in a vector store.
 *
 * `documentKey` groups records that originate from the same logical document so
 * they can be deleted/replaced together. `metadata` is opaque to the store and
 * is round-tripped on search.
 */
export interface VectorRecord<
	TMetadata extends Record<string, unknown> = Record<string, never>,
> {
	documentKey: string;
	chunk: ChunkWithEmbedding;
	metadata: TMetadata;
}

/**
 * Degrade-safe vector store port.
 *
 * Implementations persist embeddings and serve vector similarity search. The
 * port is intentionally backend-agnostic so a Lance/LanceDB adapter and the
 * existing in-memory fallback can be swapped without touching callers.
 *
 * All implementations MUST be safe to construct without a configured backend:
 * if the backend is unavailable, construction should still succeed and
 * `isReady()` should report `false` with a truthful `skipReason()`.
 */
export interface VectorStore<
	TMetadata extends Record<string, unknown> = Record<string, never>,
> {
	/**
	 * Stable identifier of the active backend, e.g. "lance" or "memory".
	 */
	readonly backend: string;

	/**
	 * Whether the store is provisioned and usable for reads/writes.
	 *
	 * Returns `false` when the configured backend (e.g. the Lance SDK / service)
	 * is not available. Callers should branch on this instead of catching
	 * construction errors.
	 */
	isReady(): Promise<boolean>;

	/**
	 * Human-readable reason the configured backend was not used, or `null` when
	 * the store is ready. Never leaks secrets.
	 */
	skipReason(): Promise<string | null>;

	/**
	 * Upsert embedded chunks for a document. Replaces any existing records for
	 * the same `documentKey`.
	 */
	upsert(records: VectorRecord<TMetadata>[]): Promise<void>;

	/**
	 * Delete every record associated with the given document keys.
	 */
	delete(documentKeys: string[]): Promise<void>;

	/**
	 * Vector similarity search over a pre-computed query embedding.
	 *
	 * @param queryEmbedding the query vector (same dimensionality as stored vectors)
	 * @param limit maximum number of results
	 * @param similarityThreshold optional minimum cosine similarity in [0, 1]
	 */
	search(
		queryEmbedding: number[],
		limit?: number,
		similarityThreshold?: number,
	): Promise<QueryResult<TMetadata>[]>;
}
