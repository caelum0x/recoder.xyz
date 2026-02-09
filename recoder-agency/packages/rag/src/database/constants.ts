/**
 * Fixed column names for embedding-related data
 * These are standardized across all implementations
 */
export const EMBEDDING_COLUMNS = {
	VECTOR: "embedding",
	PROFILE_ID: "embedding_profile_id",
	DIMENSIONS: "embedding_dimensions",
} as const;
