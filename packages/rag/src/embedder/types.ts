/**
 * Provider-specific metadata attached to embedding results.
 * Matches the AI SDK v5 `ProviderMetadata` shape; the workspace catalog still
 * pins `ai` v3 which does not export the type, so it is declared locally.
 */
export type ProviderMetadata = Record<string, Record<string, unknown>>;

/**
 * Metrics collected after embedding completion
 */
export interface EmbeddingMetrics {
	texts: string[];
	embeddings: number[][];
	model: string;
	provider: "openai" | "google" | "cohere";
	dimensions: number;
	usage?: { tokens: number; imageTokens?: number };
	operation: "embed" | "embedMany";
	startTime: Date;
	endTime: Date;
	transport?: "gateway" | "provider";
	providerMetadata?: ProviderMetadata;
}

/**
 * Callback function invoked when embedding is complete
 */
export type EmbeddingCompleteCallback = (
	metrics: EmbeddingMetrics,
) => void | Promise<void>;

/**
 * Options for embedding operations
 */
export interface EmbeddingOptions {
	/**
	 * Additional HTTP headers to be sent with the request
	 */
	headers?: Record<string, string>;
}

/**
 * Function type for embedding operations
 */
export type EmbedderFunction = {
	/**
	 * Convert text to an embedding vector
	 * @param text The text to embed
	 * @param options Optional configuration for the embedding request
	 * @returns The embedding vector
	 */
	embed(text: string, options?: EmbeddingOptions): Promise<number[]>;

	/**
	 * Embed multiple texts at once
	 * @param texts The array of texts to embed
	 * @param options Optional configuration for the embedding request
	 * @returns The array of embedding vectors
	 */
	embedMany(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;

	/**
	 * Optional callback invoked after embedding completion
	 */
	embeddingComplete?: EmbeddingCompleteCallback;
};
