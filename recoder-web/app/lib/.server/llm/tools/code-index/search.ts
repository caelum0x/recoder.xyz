/**
 * Semantic Code Search Service
 * Find code by meaning, not just text matching
 */

import { createQueryEmbedding, getEmbeddingDimension, type EmbedderConfig } from './embedder.js';
import { getVectorStore, type SearchResult } from './vector-store.js';

export interface SearchConfig {
  projectId: string;
  openaiApiKey: string;
  embeddingModel?: string;
  maxResults?: number;
  minScore?: number;
  directoryPrefix?: string;
}

export interface CodeSearchResult {
  success: boolean;
  results: SearchResult[];
  query: string;
  searchTime: number;
  error?: string;
}

const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_MIN_SCORE = 0.5;

/**
 * Search for semantically similar code
 */
export async function searchCode(
  query: string,
  config: SearchConfig
): Promise<CodeSearchResult> {
  const startTime = Date.now();
  const {
    projectId,
    openaiApiKey,
    embeddingModel,
    maxResults = DEFAULT_MAX_RESULTS,
    minScore = DEFAULT_MIN_SCORE,
    directoryPrefix,
  } = config;

  try {
    // Get vector store
    const dimension = getEmbeddingDimension(embeddingModel);
    const store = getVectorStore(projectId, dimension);

    // Check if indexed
    if (!store.isIndexingComplete()) {
      return {
        success: false,
        results: [],
        query,
        searchTime: Date.now() - startTime,
        error: 'Project not indexed. Run indexWorkspace first.',
      };
    }

    // Create query embedding
    const embedderConfig: EmbedderConfig = {
      apiKey: openaiApiKey,
      model: embeddingModel,
    };

    const queryVector = await createQueryEmbedding(query, embedderConfig);

    // Search vector store
    const results = await store.search(queryVector, {
      maxResults,
      minScore,
      directoryPrefix,
    });

    return {
      success: true,
      results,
      query,
      searchTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      results: [],
      query,
      searchTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format search results for LLM consumption
 */
export function formatResultsForLLM(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant code found.';
  }

  const formatted = results.map((r, i) => {
    const header = `### ${i + 1}. ${r.filePath}:${r.startLine}-${r.endLine} (score: ${r.score.toFixed(2)})`;
    const code = '```\n' + r.content + '\n```';
    return `${header}\n${code}`;
  });

  return formatted.join('\n\n');
}

/**
 * Search and format results in one call
 */
export async function searchAndFormat(
  query: string,
  config: SearchConfig
): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await searchCode(query, config);

  if (!result.success) {
    return {
      success: false,
      output: '',
      error: result.error,
    };
  }

  const output = formatResultsForLLM(result.results);

  return {
    success: true,
    output: `Found ${result.results.length} relevant code blocks for "${query}":\n\n${output}`,
  };
}
