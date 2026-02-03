import type { ChunkStore, ChunkerFunction, Document, DocumentLoader, EmbedderFunction, EmbeddingCompleteCallback, EmbeddingProfileId, IngestError, IngestProgress, IngestResult } from "./types";
import { EMBEDDING_PROFILES } from "./types";
import { createDefaultChunker } from "./line-chunker";
import { createEmbedderFromProfile, getApiKeyForProfile } from "./embedder";
import { ConfigurationError, OperationError, RagError } from "./errors";
import { createBatches, retryOperation } from "./utils";

// Type helper to extract metadata type from ChunkStore
type InferChunkMetadata<T> = T extends ChunkStore<infer M> ? M : never;

export interface IngestPipelineOptions<
  TDocMetadata extends Record<string, unknown>,
  TStore extends ChunkStore<Record<string, unknown>>
> {
  // Required configuration
  documentLoader: DocumentLoader<TDocMetadata>;
  chunkStore: TStore;
  documentKey: (metadata: TDocMetadata) => string;
  documentVersion: (metadata: TDocMetadata) => string;
  metadataTransform: (metadata: TDocMetadata) => InferChunkMetadata<TStore>;

  // Optional processors
  metadataVersion?: (metadata: TDocMetadata) => string;
  chunker?: ChunkerFunction;
  embeddingProfileId: EmbeddingProfileId;
  embeddingComplete?: EmbeddingCompleteCallback;

  // Optional settings
  maxBatchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  parallelLimit?: number;
  onProgress?: (progress: IngestProgress) => void;
  onError?: (error: IngestError) => void;

  // Optional headers for API requests
  headers?: Record<string, string>;
}

const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_PARALLEL_LIMIT = 15;

export type IngestFunction = () => Promise<IngestResult>;

/**
 * Version tracker for differential ingestion
 */
interface UpdateRequirement {
  needsEmbedding: boolean;
  needsMetadataUpdate: boolean;
}

function createVersionTracker(
  existingVersions: Map<string, { version: string; metadataVersion?: string }>
) {
  const seenDocuments = new Set<string>();

  return {
    checkUpdateRequirement(
      docKey: string,
      newVersion: string,
      newMetadataVersion?: string
    ): UpdateRequirement {
      const existingDoc = existingVersions.get(docKey);

      if (!existingDoc) {
        // New document needs embedding
        return {
          needsEmbedding: true,
          needsMetadataUpdate: false,
        };
      }

      const contentChanged = existingDoc.version !== newVersion;
      const metadataChanged =
        !!newMetadataVersion &&
        existingDoc.metadataVersion !== newMetadataVersion;

      return {
        needsEmbedding: contentChanged,
        needsMetadataUpdate: !contentChanged && metadataChanged,
      };
    },
    getVersion(docKey: string) {
      return existingVersions.get(docKey);
    },
    trackSeen(docKey: string): void {
      seenDocuments.add(docKey);
    },
    getOrphaned(): string[] {
      return Array.from(existingVersions.keys()).filter(
        (key) => !seenDocuments.has(key)
      );
    },
  };
}

/**
 * Create chunks with embeddings from document content
 */
async function embedContent(
  content: string,
  chunker: ChunkerFunction,
  embedder: EmbedderFunction,
  maxBatchSize: number
): Promise<Array<{ content: string; index: number; embedding: number[] }>> {
  if (maxBatchSize <= 0) {
    throw OperationError.invalidOperation(
      "embedContent",
      "maxBatchSize must be a positive number",
      undefined,
      { maxBatchSize }
    );
  }

  const chunkTexts = chunker(content);
  const chunks: Array<{ content: string; index: number; embedding: number[] }> = [];

  for (let i = 0; i < chunkTexts.length; i += maxBatchSize) {
    const batch = chunkTexts.slice(i, i + maxBatchSize);
    const embeddings = await embedder.embedMany(batch);

    if (embeddings.length !== batch.length) {
      throw OperationError.invalidOperation(
        "embedMany",
        `returned ${embeddings.length} embeddings for ${batch.length} chunks`,
        undefined,
        { batchSize: batch.length, embeddingsLength: embeddings.length }
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

/**
 * Create an ingest pipeline function with the given options
 */
export function createPipeline<
  TDocMetadata extends Record<string, unknown>,
  TStore extends ChunkStore<Record<string, unknown>>
>(options: IngestPipelineOptions<TDocMetadata, TStore>): IngestFunction {
  // Extract and set defaults for all options
  const {
    documentLoader,
    chunkStore,
    documentKey,
    documentVersion,
    metadataVersion,
    metadataTransform,
    chunker = createDefaultChunker(),
    embeddingComplete,
    maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    parallelLimit = DEFAULT_PARALLEL_LIMIT,
    onProgress = () => {},
    onError = () => {},
  } = options;

  const profile = EMBEDDING_PROFILES[options.embeddingProfileId];
  if (!profile) {
    throw new ConfigurationError(
      `Invalid embedding profile ID: ${options.embeddingProfileId}`
    );
  }

  const apiKey = getApiKeyForProfile(profile);
  if (!apiKey) {
    throw new ConfigurationError(
      `No API key found for embedding profile ${options.embeddingProfileId}`
    );
  }

  const resolvedEmbedder = createEmbedderFromProfile(
    options.embeddingProfileId,
    apiKey,
    {
      embeddingComplete,
      transport: "provider",
      headers: options.headers,
    }
  );

  /**
   * Process a single document
   */
  async function processDocument(
    document: Document<TDocMetadata>
  ): Promise<void> {
    let docKey: string;
    let targetMetadata: InferChunkMetadata<TStore>;
    try {
      docKey = documentKey(document.metadata);
      targetMetadata = metadataTransform(document.metadata);
    } catch (error) {
      throw OperationError.invalidOperation(
        "processDocument",
        "Failed to process document metadata",
        error instanceof Error ? error : new Error(String(error))
      );
    }

    await retryOperation(
      async () => {
        const chunks = await embedContent(
          document.content,
          chunker,
          resolvedEmbedder as EmbedderFunction,
          maxBatchSize
        );
        await chunkStore.insert(docKey, chunks, targetMetadata);
      },
      {
        maxRetries,
        retryDelay,
        onError,
        context: docKey,
      }
    );
  }

  /**
   * Filter and prepare documents for processing
   */
  async function* prepareDocuments(
    versionTracker: ReturnType<typeof createVersionTracker>,
    result: IngestResult
  ): AsyncGenerator<{
    metadata: TDocMetadata;
    docKey: string;
  }> {
    for await (const metadata of documentLoader.loadMetadata()) {
      let docKey: string;
      let newVersion: string;
      let newMetadataVersion: string | undefined;
      try {
        docKey = documentKey(metadata);
        newVersion = documentVersion(metadata);
        newMetadataVersion = metadataVersion?.(metadata);
      } catch (error) {
        result.failedDocuments++;
        result.errors.push({
          document: "<unknown>",
          error: error instanceof Error ? error : new Error(String(error)),
        });
        continue;
      }
      versionTracker.trackSeen(docKey);

      const { needsEmbedding, needsMetadataUpdate } =
        versionTracker.checkUpdateRequirement(
          docKey,
          newVersion,
          newMetadataVersion
        );

      if (needsEmbedding) {
        yield { metadata, docKey };
      } else if (needsMetadataUpdate) {
        // Metadata only changed - update metadata without re-embedding
        try {
          const targetMetadata = metadataTransform(metadata);
          await chunkStore.updateMetadata(docKey, targetMetadata);
          result.metadataOnlyUpdates++;
        } catch (error) {
          result.failedDocuments++;
          result.errors.push({
            document: docKey,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }
  }

  /**
   * Process a batch of documents
   */
  async function processBatch(
    batch: Array<{ metadata: TDocMetadata; docKey: string }>,
    result: IngestResult,
    progress: IngestProgress
  ): Promise<void> {
    await Promise.all(
      batch.map(async ({ metadata, docKey }) => {
        const document = await documentLoader.loadDocument(metadata);
        if (!document) {
          return;
        }

        result.totalDocuments++;
        progress.currentDocument = docKey;

        try {
          await processDocument(document);
          result.successfulDocuments++;
        } catch (error) {
          result.failedDocuments++;
          result.errors.push({
            document: docKey,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }

        progress.processedDocuments++;
        onProgress?.(progress);
      })
    );
  }

  /**
   * The main ingest function
   */
  return async function ingest(): Promise<IngestResult> {
    const result: IngestResult = {
      totalDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
      metadataOnlyUpdates: 0,
      errors: [],
    };

    const progress: IngestProgress = {
      processedDocuments: 0,
      currentDocument: undefined,
    };

    try {
      // Initialize version tracking
      const existingDocs = await chunkStore.getDocumentVersions();
      const existingVersions = new Map(
        existingDocs.map((doc) => [
          doc.documentKey,
          {
            version: doc.version,
            metadataVersion: doc.metadataVersion,
          },
        ])
      );
      const versionTracker = createVersionTracker(existingVersions);

      // Process documents in batches
      const documentsToProcess = prepareDocuments(versionTracker, result);
      for await (const batch of createBatches(
        documentsToProcess,
        parallelLimit
      )) {
        await processBatch(batch, result, progress);
      }

      // Handle orphaned documents
      const orphanedKeys = versionTracker.getOrphaned();
      if (orphanedKeys.length > 0) {
        try {
          await chunkStore.deleteBatch(orphanedKeys);
          const deletedCount = orphanedKeys.length;

          progress.processedDocuments += deletedCount;
          onProgress?.(progress);
        } catch (error) {
          result.errors.push({
            document: `batch-delete: ${orphanedKeys.join(", ")}`,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    } catch (error) {
      if (error instanceof RagError) {
        throw error;
      }

      throw OperationError.invalidOperation(
        "ingestion pipeline",
        "Failed to complete ingestion pipeline",
        error instanceof Error ? error : new Error(String(error))
      );
    }

    return result;
  };
}
