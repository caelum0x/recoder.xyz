/**
 * Search Interfaces
 * Types for hybrid search functionality
 */

import type { VectorStoreSearchResult } from './vector-store';

export interface SearchOptions {
  query: string;
  directoryPrefix?: string;
  minScore?: number;
  maxResults?: number;
  semanticWeight?: number;
  bm25Weight?: number;
  includeContent?: boolean;
  language?: string;
}

export interface SearchResult extends VectorStoreSearchResult {
  highlights?: string[];
  bm25Score?: number;
  semanticScore?: number;
  combinedScore?: number;
}

export interface HybridSearchResult {
  results: SearchResult[];
  totalMatches: number;
  searchTime: number;
  method: 'semantic' | 'bm25' | 'hybrid';
}

export interface ISearchService {
  /**
   * Performs a hybrid search combining semantic and BM25 scoring
   */
  search(options: SearchOptions): Promise<HybridSearchResult>;

  /**
   * Performs a semantic-only search
   */
  semanticSearch(options: SearchOptions): Promise<HybridSearchResult>;

  /**
   * Performs a BM25-only search
   */
  bm25Search(options: SearchOptions): Promise<HybridSearchResult>;

  /**
   * Gets search suggestions based on partial query
   */
  getSuggestions?(query: string, limit?: number): Promise<string[]>;
}

export interface BM25Document {
  id: string;
  content: string;
  filePath: string;
  tokens?: string[];
  termFrequencies?: Map<string, number>;
}

export interface BM25Index {
  documents: Map<string, BM25Document>;
  documentFrequencies: Map<string, number>;
  avgDocLength: number;
  totalDocuments: number;
}

export interface BM25Config {
  k1?: number;
  b?: number;
  epsilon?: number;
}
