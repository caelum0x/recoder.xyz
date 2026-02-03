// Types
export type {
  ChunkerFunction,
  Chunk,
  ChunkStore,
  ChunkWithEmbedding,
  DatabaseConfig,
  Document,
  DocumentLoader,
  EmbedderConfig,
  EmbedderFunction,
  EmbeddingCompleteCallback,
  EmbeddingMetrics,
  EmbeddingOptions,
  EmbeddingProfile,
  EmbeddingProfileId,
  IngestError,
  IngestProgress,
  IngestResult,
  QueryResult,
  QueryService,
} from "./types";

export { EMBEDDING_PROFILES } from "./types";

// Errors
export {
  ConfigurationError,
  DatabaseError,
  DocumentLoaderError,
  EmbeddingError,
  handleError,
  isErrorCategory,
  isErrorCode,
  OperationError,
  RagError,
  ValidationError,
} from "./errors";

// Chunker
export {
  createDefaultChunker,
  createLineChunker,
  DEFAULT_CHUNKER_CONFIG,
  type LineChunkerOptions,
} from "./line-chunker";

// Embedder
export {
  createAiSdkEmbedder,
  createEmbedderFromProfile,
  createGoogleEmbedder,
  createNotImplementedEmbedder,
  createOpenAIEmbedder,
  getApiKeyForProfile,
  type CreateEmbedderFromProfileOptions,
} from "./embedder";

// Database
export {
  clearPgVectorCache,
  EMBEDDING_COLUMNS,
  ensurePgVectorTypes,
  escapeIdentifier,
  PoolManager,
  vectorToSql,
  type NeonClient,
} from "./database";

// Column Mapping
export {
  buildColumnMapping,
  CHUNK_STORE_REQUIRED_COLUMNS,
  createChunkStoreColumnMapping,
  createQueryServiceColumnMapping,
  QUERY_SERVICE_REQUIRED_COLUMNS,
  validateColumnMapping,
  type ChunkStoreRequiredColumns,
  type ColumnMapping,
  type QueryServiceRequiredColumns,
} from "./column-mapping";

// Chunk Store
export {
  createPostgresChunkStore,
  mapMetadataToColumns,
} from "./chunk-store";

// Query Service
export { createPostgresQueryService } from "./query-service";

// Pipeline
export {
  createPipeline,
  type IngestFunction,
  type IngestPipelineOptions,
} from "./pipeline";

// Utils
export {
  createBatches,
  replaceNullCharacters,
  retryOperation,
  toSnakeCase,
} from "./utils";
