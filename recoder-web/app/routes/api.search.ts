/**
 * Search API Route
 *
 * Full-text search over the codebase using ripgrep via docker-backend.
 * Supports regex patterns, file type filtering, and result limiting.
 *
 * POST /api/search
 * Body: {
 *   projectId: string;       // Required - Project to search in
 *   query: string;           // Required - Search query string
 *   regex?: boolean;         // Optional - Treat query as regex pattern
 *   caseSensitive?: boolean; // Optional - Case-sensitive search
 *   wholeWord?: boolean;     // Optional - Match whole words only
 *   include?: string;        // Optional - Glob pattern to include (e.g., "*.tsx")
 *   exclude?: string;        // Optional - Glob pattern to exclude (e.g., "node_modules")
 *   maxResults?: number;     // Optional - Limit results (default: 100, max: 1000)
 *   fileTypes?: string[];    // Optional - File extensions to search (e.g., ["ts", "tsx", "js"])
 * }
 *
 * Response: {
 *   results: Array<{
 *     file: string;        // Relative file path
 *     line: number;        // Line number (1-indexed)
 *     column: number;      // Column number
 *     text: string;        // The matching line text
 *     matchStart: number;  // Start position of match in line
 *     matchEnd: number;    // End position of match in line
 *   }>;
 *   total: number;         // Total number of results
 *   truncated: boolean;    // Whether results were limited
 *   searchTime: number;    // Search time in milliseconds
 * }
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SearchApi');
import { DockerHttpError, createDockerProxyHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';

// Type definitions
interface SearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  include?: string;
  exclude?: string;
  maxResults?: number;
}

interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchRequestBody {
  projectId: string;
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  include?: string;
  exclude?: string;
  maxResults?: number;
  fileTypes?: string[];
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  truncated: boolean;
  searchTime: number;
}

// Maximum results allowed
const MAX_RESULTS_LIMIT = 1000;
const DEFAULT_RESULTS_LIMIT = 100;

// File extension to glob mapping for common file types
const FILE_TYPE_GLOBS: Record<string, string> = {
  ts: '*.ts',
  tsx: '*.tsx',
  js: '*.js',
  jsx: '*.jsx',
  json: '*.json',
  md: '*.md',
  css: '*.css',
  scss: '*.scss',
  html: '*.html',
  vue: '*.vue',
  svelte: '*.svelte',
  py: '*.py',
  go: '*.go',
  rs: '*.rs',
  java: '*.java',
  kt: '*.kt',
  rb: '*.rb',
  php: '*.php',
  c: '*.c',
  cpp: '*.cpp',
  h: '*.h',
  hpp: '*.hpp',
  sql: '*.sql',
  yaml: '*.yaml',
  yml: '*.yml',
  toml: '*.toml',
  xml: '*.xml',
  sh: '*.sh',
  bash: '*.bash',
  zsh: '*.zsh',
};

// Default exclusions for common non-code directories
const DEFAULT_EXCLUSIONS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '__pycache__',
  '.cache',
  'vendor',
  '.venv',
  'venv',
  'target',
];

/**
 * Build include glob pattern from file types
 */
function buildIncludePattern(fileTypes?: string[], customInclude?: string): string | undefined {
  const patterns: string[] = [];

  // Add file type patterns
  if (fileTypes && fileTypes.length > 0) {
    for (const type of fileTypes) {
      const normalizedType = type.toLowerCase().replace(/^\./, '');
      const glob = FILE_TYPE_GLOBS[normalizedType] || `*.${normalizedType}`;
      patterns.push(glob);
    }
  }

  // Add custom include pattern
  if (customInclude) {
    patterns.push(customInclude);
  }

  // Combine patterns with brace expansion for ripgrep
  if (patterns.length > 1) {
    return `{${patterns.join(',')}}`;
  } else if (patterns.length === 1) {
    return patterns[0];
  }

  return undefined;
}

/**
 * Build exclude pattern
 */
function buildExcludePattern(customExclude?: string): string {
  const exclusions = [...DEFAULT_EXCLUSIONS];

  if (customExclude) {
    exclusions.push(customExclude);
  }

  return `{${exclusions.join(',')}}`;
}

/**
 * Validate and sanitize search query
 */
function validateQuery(query: unknown): { valid: boolean; query?: string; error?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query is required and must be a string' };
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Query cannot be empty' };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: 'Query exceeds maximum length of 500 characters' };
  }

  return { valid: true, query: trimmed };
}

/**
 * Validate project ID
 */
function validateProjectId(projectId: unknown): { valid: boolean; projectId?: string; error?: string } {
  if (!projectId || typeof projectId !== 'string') {
    return { valid: false, error: 'Project ID is required' };
  }

  // Basic sanitization - alphanumeric, hyphens, underscores
  const sanitized = projectId.replace(/[^a-zA-Z0-9_-]/g, '');

  if (sanitized !== projectId) {
    return { valid: false, error: 'Invalid project ID format' };
  }

  return { valid: true, projectId: sanitized };
}

export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
  const startTime = Date.now();

  // Only allow POST
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Verify user session
    const session = await verifySession(request);
    if (!session?.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    let body: SearchRequestBody;
    try {
      body = await request.json() as SearchRequestBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate project ID
    const projectValidation = validateProjectId(body.projectId);
    if (!projectValidation.valid) {
      return json({ error: projectValidation.error }, { status: 400 });
    }

    // Validate query
    const queryValidation = validateQuery(body.query);
    if (!queryValidation.valid) {
      return json({ error: queryValidation.error }, { status: 400 });
    }

    // Build search options
    const maxResults = Math.min(
      Math.max(1, body.maxResults || DEFAULT_RESULTS_LIMIT),
      MAX_RESULTS_LIMIT
    );

    const searchOptions: SearchOptions = {
      regex: body.regex === true,
      caseSensitive: body.caseSensitive === true,
      wholeWord: body.wholeWord === true,
      maxResults: maxResults + 1, // Request 1 extra to detect truncation
    };

    // Build include pattern from file types
    const includePattern = buildIncludePattern(body.fileTypes, body.include);
    if (includePattern) {
      searchOptions.include = includePattern;
    }

    // Build exclude pattern
    searchOptions.exclude = buildExcludePattern(body.exclude);

    const dockerBackendUrl = getDockerBackendUrl(context);
    const headers = createDockerProxyHeaders(request);

    // Call docker-backend search API
    const searchUrl = `${dockerBackendUrl}/api/search/${projectValidation.projectId}`;

    const dockerResult = await dockerFetchJson<{ results: SearchResult[]; total: number }>(
      searchUrl,
      {
        method: 'POST',
        body: JSON.stringify({
          query: queryValidation.query,
          options: searchOptions,
        }),
      },
      headers,
    );

    // Check if results were truncated
    const truncated = dockerResult.results.length > maxResults;
    const results = truncated ? dockerResult.results.slice(0, maxResults) : dockerResult.results;

    const searchTime = Date.now() - startTime;

    const response: SearchResponse = {
      results,
      total: truncated ? maxResults : results.length,
      truncated,
      searchTime,
    };

    return json(response);

  } catch (error) {
    logger.error('[Search API] Error:', error);

    if (error instanceof DockerHttpError) {
      logger.error(`[Search API] Docker backend error: ${error.status} - ${error.message}`);

      if (error.status === 404) {
        return json({
          error: 'Project container not found. Make sure the project is running.',
          code: 'CONTAINER_NOT_FOUND'
        }, { status: 404 });
      }

      if (error.status === 401 || error.status === 403) {
        return json({ error: 'Not authorized to access this project' }, { status: 403 });
      }

      return json({
        error: 'Search service unavailable',
        code: 'SEARCH_ERROR'
      }, { status: 502 });
    }

    // Handle network errors to docker-backend
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return json({
        error: 'Search service unavailable. Please try again later.',
        code: 'SERVICE_UNAVAILABLE'
      }, { status: 503 });
    }

    return json({
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}

/**
 * GET handler - return API documentation
 */
export async function loader(): Promise<Response> {
  return json({
    name: 'Search API',
    version: '1.0.0',
    description: 'Full-text search over project codebase using ripgrep',
    method: 'POST',
    endpoint: '/api/search',
    body: {
      projectId: { type: 'string', required: true, description: 'Project ID to search in' },
      query: { type: 'string', required: true, description: 'Search query string' },
      regex: { type: 'boolean', required: false, description: 'Treat query as regex pattern' },
      caseSensitive: { type: 'boolean', required: false, description: 'Case-sensitive search' },
      wholeWord: { type: 'boolean', required: false, description: 'Match whole words only' },
      include: { type: 'string', required: false, description: 'Glob pattern to include files' },
      exclude: { type: 'string', required: false, description: 'Glob pattern to exclude files' },
      maxResults: { type: 'number', required: false, description: `Maximum results (default: ${DEFAULT_RESULTS_LIMIT}, max: ${MAX_RESULTS_LIMIT})` },
      fileTypes: { type: 'string[]', required: false, description: 'File extensions to search (e.g., ["ts", "tsx"])' },
    },
    response: {
      results: { type: 'SearchResult[]', description: 'Array of search results' },
      total: { type: 'number', description: 'Total number of results returned' },
      truncated: { type: 'boolean', description: 'Whether results were limited by maxResults' },
      searchTime: { type: 'number', description: 'Search time in milliseconds' },
    },
    supportedFileTypes: Object.keys(FILE_TYPE_GLOBS),
  });
}
