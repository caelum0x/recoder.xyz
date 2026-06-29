import type { QueryResult } from "../query-service/types";
import type { VectorRecord, VectorStore } from "./types";

/**
 * Cosine similarity in [-1, 1]. Returns 0 for zero-length vectors or mismatched
 * dimensions rather than throwing, so a single bad record cannot poison a query.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length === 0 || a.length !== b.length) return 0;

	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		dot += av * bv;
		normA += av * av;
		normB += bv * bv;
	}

	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory implementation of the {@link VectorStore} port.
 *
 * This is the degrade-safe fallback used when no Lance backend is configured or
 * the Lance SDK/service is not provisioned. It is always ready and keeps all
 * records in a process-local map keyed by `documentKey`.
 *
 * It is intentionally simple (linear scan). It is meant for small corpora,
 * tests, and as a safe default — not as a replacement for a real vector index.
 */
export class MemoryVectorStore<
	TMetadata extends Record<string, unknown> = Record<string, never>,
> implements VectorStore<TMetadata>
{
	readonly backend = "memory";

	readonly #byDocument = new Map<string, VectorRecord<TMetadata>[]>();

	async isReady(): Promise<boolean> {
		return true;
	}

	async skipReason(): Promise<string | null> {
		return null;
	}

	async upsert(records: VectorRecord<TMetadata>[]): Promise<void> {
		const grouped = new Map<string, VectorRecord<TMetadata>[]>();
		for (const record of records) {
			const existing = grouped.get(record.documentKey);
			if (existing) {
				existing.push(record);
			} else {
				grouped.set(record.documentKey, [record]);
			}
		}

		for (const [documentKey, docRecords] of grouped) {
			// Replace semantics: a re-ingested document overwrites prior chunks.
			this.#byDocument.set(documentKey, docRecords);
		}
	}

	async delete(documentKeys: string[]): Promise<void> {
		for (const key of documentKeys) {
			this.#byDocument.delete(key);
		}
	}

	async search(
		queryEmbedding: number[],
		limit = 10,
		similarityThreshold?: number,
	): Promise<QueryResult<TMetadata>[]> {
		const scored: QueryResult<TMetadata>[] = [];

		for (const docRecords of this.#byDocument.values()) {
			for (const record of docRecords) {
				const raw = cosineSimilarity(queryEmbedding, record.chunk.embedding);
				// Normalize cosine [-1, 1] -> [0, 1] to match the threshold contract.
				const similarity = (raw + 1) / 2;
				if (
					similarityThreshold !== undefined &&
					similarity < similarityThreshold
				) {
					continue;
				}
				scored.push({
					chunk: { content: record.chunk.content, index: record.chunk.index },
					similarity,
					metadata: record.metadata,
				});
			}
		}

		scored.sort((a, b) => b.similarity - a.similarity);
		return scored.slice(0, Math.max(0, limit));
	}

	/** Number of distinct documents currently stored. Test/diagnostic helper. */
	documentCount(): number {
		return this.#byDocument.size;
	}
}
