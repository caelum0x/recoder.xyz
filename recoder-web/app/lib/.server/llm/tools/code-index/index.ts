/**
 * Code Index Service - Semantic Code Search
 *
 * Features:
 * - Index codebase for semantic search
 * - Find code by meaning, not just text
 * - Supports incremental updates
 *
 * Usage:
 *   // Index a workspace
 *   await indexWorkspace({
 *     projectId: 'my-project',
 *     workspacePath: '/workspace',
 *     openaiApiKey: 'sk-...',
 *   });
 *
 *   // Search for code
 *   const results = await searchCode('authentication middleware', {
 *     projectId: 'my-project',
 *     openaiApiKey: 'sk-...',
 *   });
 */

// Indexer
export {
  indexWorkspace,
  getIndexingProgress,
  isProjectIndexed,
  getIndexStats,
  clearProjectIndex,
  reindexFile,
  type IndexerConfig,
  type IndexingProgress,
  type IndexingResult,
} from './indexer.js';

// Search
export {
  searchCode,
  formatResultsForLLM,
  searchAndFormat,
  type SearchConfig,
  type CodeSearchResult,
} from './search.js';

// Embedder
export {
  createEmbeddings,
  createQueryEmbedding,
  getEmbeddingDimension,
  type EmbedderConfig,
  type EmbeddingResult,
} from './embedder.js';

// Vector Store
export {
  getVectorStore,
  clearVectorStore,
  getActiveProjects,
  InMemoryVectorStore,
  type CodeBlock,
  type IndexedBlock,
  type SearchResult,
  type VectorStoreConfig,
} from './vector-store.js';

// Parser
export {
  parseFile,
  isSupported,
  getSupportedExtensions,
  type ParserConfig,
} from './parser.js';
