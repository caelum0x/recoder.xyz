/**
 * Code Index Constants
 * Configuration values for the code indexing and RAG system
 */

// Parser Constants
export const MAX_BLOCK_CHARS = 1000;
export const MIN_BLOCK_CHARS = 50;
export const MIN_CHUNK_REMAINDER_CHARS = 200;
export const MAX_CHARS_TOLERANCE_FACTOR = 1.15;

// Search Constants
export const DEFAULT_SEARCH_MIN_SCORE = 0.3;
export const DEFAULT_MAX_SEARCH_RESULTS = 10;

// File Processing Constants
export const CODE_BLOCK_NAMESPACE = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

// Directory Scanner Constants
export const MAX_LIST_FILES_LIMIT = 50_000;
export const BATCH_SEGMENT_THRESHOLD = 60;
export const MAX_BATCH_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 500;
export const PARSING_CONCURRENCY = 10;
export const MAX_PENDING_BATCHES = 20;

// Embedder Constants
export const MAX_BATCH_TOKENS = 100000;
export const MAX_ITEM_TOKENS = 8191;
export const BATCH_PROCESSING_CONCURRENCY = 10;

// BM25 Constants for Hybrid Search
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export const BM25_EPSILON = 0.25;

// Hybrid Search Weights
export const DEFAULT_SEMANTIC_WEIGHT = 0.7;
export const DEFAULT_BM25_WEIGHT = 0.3;

// Cache Constants
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_CACHE_SIZE = 10000;

// Supported File Extensions
export const SUPPORTED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.cs', '.php', '.swift', '.scala',
  '.vue', '.svelte', '.astro',
  '.html', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.markdown',
  '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh',
  '.dockerfile', '.containerfile',
  '.prisma', '.proto'
];

// Extensions that use fallback chunking
export const FALLBACK_EXTENSIONS = ['.vb', '.scala', '.swift'];
