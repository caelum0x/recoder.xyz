import type { ChunkWithEmbedding } from "../chunk-store/types";
import type { ChunkerFunction } from "../chunker/types";
import type { EmbedderFunction } from "../embedder/types";
import { OperationError } from "../errors";

/**
 * Create chunks with embeddings from document content
 */
export async function embedContent(
	content: string,
	chunker: ChunkerFunction,
	embedder: EmbedderFunction,
	maxBatchSize: number,
): Promise<ChunkWithEmbedding[]> {
	if (maxBatchSize <= 0) {
		throw OperationError.invalidOperation(
			"embedContent",
			"maxBatchSize must be a positive number",
			undefined,
			{ maxBatchSize },
		);
	}

	const chunkTexts = chunker(content);
	const chunks: ChunkWithEmbedding[] = [];

	for (let i = 0; i < chunkTexts.length; i += maxBatchSize) {
		const batch = chunkTexts.slice(i, i + maxBatchSize);
		const embeddings = await embedder.embedMany(batch);

		if (embeddings.length !== batch.length) {
			throw OperationError.invalidOperation(
				"embedMany",
				`returned ${embeddings.length} embeddings for ${batch.length} chunks`,
				undefined,
				{ batchSize: batch.length, embeddingsLength: embeddings.length },
			);
		}

		for (let j = 0; j < batch.length; j++) {
			chunks.push({
				content: batch[j],
				index: i + j,
				embedding: embeddings[j],
			});
		}
	}

	return chunks;
}
