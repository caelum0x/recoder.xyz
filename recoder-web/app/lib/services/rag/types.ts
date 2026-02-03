/**
 * Embedding profile configuration
 */
export interface EmbeddingProfile {
  id: EmbeddingProfileId;
  provider: "openai" | "google" | "cohere";
  model: string;
  dimensions: number;
}

/**
 * Embedding profile IDs
 */
export type EmbeddingProfileId =
  | "openai-text-embedding-3-small"
  | "openai-text-embedding-3-large"
  | "google-gemini-embedding-001";

/**
 * Registry of embedding profiles
 */
export const EMBEDDING_PROFILES: Record<EmbeddingProfileId, EmbeddingProfile> = {
  "openai-text-embedding-3-small": {
    id: "openai-text-embedding-3-small",
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
  "openai-text-embedding-3-large": {
    id: "openai-text-embedding-3-large",
    provider: "openai",
    model: "text-embedding-3-large",
    dimensions: 3072,
  },
  "google-gemini-embedding-001": {
    id: "google-gemini-embedding-001",
    provider: "google",
    model: "gemini-embedding-001",
    dimensions: 768,
  },
};

/**
 * Function type for chunking text into smaller pieces
 */
export type ChunkerFunction = (text: string) => string[];

/**
 * Document interface
 */
export interface Document<
  TMetadata extends Record<string, unknown> = Record<string, never>
> {
  content: string;
  metadata: TMetadata;
}

/**
 * Document loader interface
 */
export interface DocumentLoader<
  TMetadata extends Record<string, unknown> = Record<string, never>
> {
  /**
   * Load metadata for all documents (lightweight operation)
   */
  loadMetadata(): AsyncIterable<TMetadata>;

  /**
   * Load a specific document by its metadata
   */
  loadDocument(metadata: TMetadata): Promise<Document<TMetadata> | null>;
}

/**
 * Chunk interface
 */
export interface Chunk {
  content: string;
  index: number;
}

/**
 * Chunk with embedding vector
 */
export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

/**
 * Chunk store interface
 */
export interface ChunkStore<
  TMetadata extends Record<string, unknown> = Record<string, never>
> {
  /**
   * Insert chunks into the chunk store
   */
  insert(
    documentKey: string,
    chunks: ChunkWithEmbedding[],
    metadata: TMetadata
  ): Promise<void>;

  /**
   * Delete chunks associated with a document key
   */
  delete(documentKey: string): Promise<void>;

  /**
   * Delete chunks associated with multiple document keys
   */
  deleteBatch(documentKeys: string[]): Promise<void>;

  /**
   * Get document versions for differential ingestion
   */
  getDocumentVersions(): Promise<
    Array<{
      documentKey: string;
      version: string;
      metadataVersion?: string;
    }>
  >;

  /**
   * Update metadata only without re-embedding
   */
  updateMetadata(documentKey: string, metadata: TMetadata): Promise<void>;
}

/**
 * Query result interface
 */
export interface QueryResult<
  TMetadata extends Record<string, unknown> = Record<string, never>
> {
  chunk: Chunk;
  similarity: number;
  metadata: TMetadata;
  additional?: Record<string, unknown>;
}

/**
 * Query service interface
 */
export interface QueryService<
  TContext,
  TMetadata extends Record<string, unknown> = Record<string, never>
> {
  /**
   * Vector similarity search
   */
  search(
    query: string,
    context: TContext,
    limit?: number,
    similarityThreshold?: number,
    embeddingComplete?: EmbeddingCompleteCallback,
    headers?: Record<string, string>
  ): Promise<QueryResult<TMetadata>[]>;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  connectionString: string;
  poolConfig?: {
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
}

/**
 * Ingest progress
 */
export interface IngestProgress {
  currentDocument?: string;
  processedDocuments: number;
}

/**
 * Ingest error
 */
export interface IngestError {
  document: string;
  error: Error;
  willRetry: boolean;
  attemptNumber: number;
}

/**
 * Ingest result
 */
export interface IngestResult {
  totalDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  metadataOnlyUpdates: number;
  errors: Array<{ document: string; error: Error }>;
}

/**
 * Embedding metrics
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
  providerMetadata?: Record<string, unknown>;
}

/**
 * Callback function invoked when embedding is complete
 */
export type EmbeddingCompleteCallback = (
  metrics: EmbeddingMetrics
) => void | Promise<void>;

/**
 * Options for embedding operations
 */
export interface EmbeddingOptions {
  headers?: Record<string, string>;
}

/**
 * Embedder function interface
 */
export interface EmbedderFunction {
  embed(text: string, options?: EmbeddingOptions): Promise<number[]>;
  embedMany(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;
  embeddingComplete?: EmbeddingCompleteCallback;
}

/**
 * Embedder configuration
 */
export interface EmbedderConfig {
  apiKey: string;
  profile: EmbeddingProfile;
  maxRetries?: number;
  embeddingComplete?: EmbeddingCompleteCallback;
  transport?: "gateway" | "provider";
  headers?: Record<string, string>;
}
