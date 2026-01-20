/**
 * Vector Store for code indexing
 * Uses in-memory storage with cosine similarity search
 * Can be upgraded to LanceDB for persistence
 */

export interface CodeBlock {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'chunk' | 'file';
}

export interface IndexedBlock extends CodeBlock {
  vector: number[];
}

export interface SearchResult {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  type: string;
  score: number;
}

export interface VectorStoreConfig {
  dimension: number;
  storagePath?: string;
}

/**
 * In-memory vector store with cosine similarity search
 * Sufficient for projects up to ~10K code blocks
 */
export class InMemoryVectorStore {
  private blocks: Map<string, IndexedBlock> = new Map();
  private dimension: number;
  private metadata: {
    indexingComplete: boolean;
    totalBlocks: number;
    lastUpdated: Date | null;
  } = {
    indexingComplete: false,
    totalBlocks: 0,
    lastUpdated: null,
  };

  constructor(config: VectorStoreConfig) {
    this.dimension = config.dimension;
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    // In-memory store is ready immediately
    console.log(`[VectorStore] Initialized with dimension ${this.dimension}`);
  }

  /**
   * Add or update code blocks with their embeddings
   */
  async upsertBlocks(blocks: IndexedBlock[]): Promise<void> {
    for (const block of blocks) {
      if (block.vector.length !== this.dimension) {
        throw new Error(
          `Vector dimension mismatch: expected ${this.dimension}, got ${block.vector.length}`
        );
      }
      this.blocks.set(block.id, block);
    }
    this.metadata.totalBlocks = this.blocks.size;
    this.metadata.lastUpdated = new Date();
  }

  /**
   * Delete blocks by file path
   */
  async deleteByFilePath(filePath: string): Promise<number> {
    let deleted = 0;
    for (const [id, block] of this.blocks) {
      if (block.filePath === filePath) {
        this.blocks.delete(id);
        deleted++;
      }
    }
    this.metadata.totalBlocks = this.blocks.size;
    return deleted;
  }

  /**
   * Search for similar code blocks
   */
  async search(
    queryVector: number[],
    options: {
      maxResults?: number;
      minScore?: number;
      directoryPrefix?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const maxResults = options.maxResults || 20;
    const minScore = options.minScore || 0.5;
    const directoryPrefix = options.directoryPrefix;

    const results: SearchResult[] = [];

    for (const block of this.blocks.values()) {
      // Apply directory filter
      if (directoryPrefix && !block.filePath.startsWith(directoryPrefix)) {
        continue;
      }

      const score = cosineSimilarity(queryVector, block.vector);

      if (score >= minScore) {
        results.push({
          id: block.id,
          filePath: block.filePath,
          content: block.content,
          startLine: block.startLine,
          endLine: block.endLine,
          type: block.type,
          score,
        });
      }
    }

    // Sort by score descending and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Mark indexing as complete
   */
  markIndexingComplete(): void {
    this.metadata.indexingComplete = true;
  }

  /**
   * Check if indexing is complete
   */
  isIndexingComplete(): boolean {
    return this.metadata.indexingComplete;
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalBlocks: number;
    indexingComplete: boolean;
    lastUpdated: Date | null;
  } {
    return { ...this.metadata };
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.blocks.clear();
    this.metadata = {
      indexingComplete: false,
      totalBlocks: 0,
      lastUpdated: null,
    };
  }

  /**
   * Get all file paths that have been indexed
   */
  getIndexedFilePaths(): string[] {
    const paths = new Set<string>();
    for (const block of this.blocks.values()) {
      paths.add(block.filePath);
    }
    return Array.from(paths);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// Store instances per project
const stores = new Map<string, InMemoryVectorStore>();

/**
 * Get or create a vector store for a project
 */
export function getVectorStore(
  projectId: string,
  dimension: number
): InMemoryVectorStore {
  let store = stores.get(projectId);

  if (!store) {
    store = new InMemoryVectorStore({ dimension });
    stores.set(projectId, store);
  }

  return store;
}

/**
 * Clear a project's vector store
 */
export async function clearVectorStore(projectId: string): Promise<void> {
  const store = stores.get(projectId);
  if (store) {
    await store.clear();
    stores.delete(projectId);
  }
}

/**
 * Get all active project IDs
 */
export function getActiveProjects(): string[] {
  return Array.from(stores.keys());
}
