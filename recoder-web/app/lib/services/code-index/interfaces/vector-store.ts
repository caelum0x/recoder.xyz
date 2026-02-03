/**
 * Vector Store Interfaces
 * Defines the contract for vector database implementations
 */

export interface PointStruct {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface Payload {
  filePath: string;
  codeChunk: string;
  startLine: number;
  endLine: number;
  language?: string;
  identifier?: string;
  type?: string;
  [key: string]: unknown;
}

export interface VectorStoreSearchResult {
  id: string | number;
  score: number;
  payload?: Payload | null;
}

export interface IVectorStore {
  /**
   * Initializes the vector store
   * @returns Promise resolving to boolean indicating if a new collection was created
   */
  initialize(): Promise<boolean>;

  /**
   * Upserts points into the vector store
   * @param points Array of points to upsert
   */
  upsertPoints(points: PointStruct[]): Promise<void>;

  /**
   * Searches for similar vectors
   * @param queryVector Vector to search for
   * @param directoryPrefix Optional directory prefix to filter results
   * @param minScore Optional minimum score threshold
   * @param maxResults Optional maximum number of results to return
   * @returns Promise resolving to search results
   */
  search(
    queryVector: number[],
    directoryPrefix?: string,
    minScore?: number,
    maxResults?: number
  ): Promise<VectorStoreSearchResult[]>;

  /**
   * Deletes points by file path
   * @param filePath Path of the file to delete points for
   */
  deletePointsByFilePath(filePath: string): Promise<void>;

  /**
   * Deletes points by multiple file paths
   * @param filePaths Array of file paths to delete points for
   */
  deletePointsByMultipleFilePaths(filePaths: string[]): Promise<void>;

  /**
   * Clears all points from the collection
   */
  clearCollection(): Promise<void>;

  /**
   * Deletes the entire collection
   */
  deleteCollection(): Promise<void>;

  /**
   * Checks if the collection exists
   */
  collectionExists(): Promise<boolean>;

  /**
   * Checks if the collection has indexed data
   */
  hasIndexedData(): Promise<boolean>;

  /**
   * Marks indexing as complete
   */
  markIndexingComplete(): Promise<void>;

  /**
   * Marks indexing as incomplete
   */
  markIndexingIncomplete(): Promise<void>;

  /**
   * Gets all points in the collection (for export/backup)
   */
  getAllPoints?(): Promise<PointStruct[]>;

  /**
   * Gets the count of points in the collection
   */
  getPointCount?(): Promise<number>;
}

export interface VectorStoreConfig {
  type: 'memory' | 'indexeddb' | 'qdrant' | 'lancedb';
  dimensions: number;
  collectionName?: string;
  url?: string;
  apiKey?: string;
}
