/**
 * store — the `VectorStorePort` shape the retrieval engine consumes. Like the
 * embedder, it is INJECTED: the concrete Qdrant-REST store lives in the backend's
 * shared vector foundation (`vector-store.ts`, `createVectorStore`). This module
 * re-declares the structural contract so the engine stays runtime-agnostic and
 * unit-testable with an in-memory fake (no network).
 *
 * DEGRADE CONTRACT (mirrors the foundation): when the store is not configured
 * (`configured === false`) every method is a truthful no-op — `ensureCollection`
 * / `upsert` return `false`, `search` returns `[]`. Nothing throws.
 */

export type VectorDistance = "Cosine" | "Dot" | "Euclid";

export interface VectorPoint {
	id: string | number;
	vector: number[];
	payload?: Record<string, unknown>;
}

export interface VectorMatch {
	id: string | number;
	score: number;
	payload?: Record<string, unknown>;
}

export interface VectorStorePort {
	/** True when a backing store is wired; false ⇒ every method is a no-op. */
	readonly configured: boolean;
	/** Idempotently ensure a collection of `dim` exists. No-op ⇒ false. */
	ensureCollection(
		name: string,
		dim: number,
		distance?: VectorDistance,
	): Promise<boolean>;
	/** Upsert points. No-op / failure ⇒ false. */
	upsert(name: string, points: VectorPoint[]): Promise<boolean>;
	/** Nearest-neighbour search. No-op / failure ⇒ []. */
	search(name: string, vector: number[], topK: number): Promise<VectorMatch[]>;
}
