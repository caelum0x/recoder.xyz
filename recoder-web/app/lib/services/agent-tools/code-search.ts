/**
 * Agent Tool: Code Search
 *
 * Search the codebase semantically to find files relevant to a query.
 * Use this tool when you need to discover which files contain code
 * related to a specific concept, feature, or functionality.
 */

import { z } from 'zod';
import {
  escapeXmlAttr,
  escapeXmlContent,
  normalizePath,
  safeJoin,
  type ToolDefinition,
  type AgentContext,
} from './types';
import { dockerGet, dockerReadFile } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const codeSearchSchema = z.object({
  query: z.string().describe('Search query to find relevant files'),
});

export type CodeSearchArgs = z.infer<typeof codeSearchSchema>;

// ============================================================================
// Types
// ============================================================================

interface FileContext {
  path: string;
  content: string;
}

interface ScoredFile {
  path: string;
  score: number;
  matchedTerms: string[];
}

// ============================================================================
// Search Logic
// ============================================================================

/**
 * Tokenize a query into search terms
 */
function tokenizeQuery(query: string): string[] {
  // Split on common delimiters and filter out short terms
  const terms = query
    .toLowerCase()
    .split(/[\s\-_.,;:!?'"()\[\]{}]+/)
    .filter((term) => term.length >= 2);

  // Also split camelCase and PascalCase
  const camelCaseTerms: string[] = [];
  for (const term of terms) {
    const matches = term.match(/[a-z]+|[A-Z][a-z]*/g);
    if (matches) {
      camelCaseTerms.push(...matches.map((m) => m.toLowerCase()));
    }
  }

  // Combine and deduplicate
  const allTerms = Array.from(new Set([...terms, ...camelCaseTerms]));

  return allTerms.filter((term) => term.length >= 2);
}

/**
 * Calculate relevance score for a file based on the query
 */
function calculateRelevance(
  file: FileContext,
  queryTerms: string[],
): ScoredFile {
  const contentLower = file.content.toLowerCase();
  const pathLower = file.path.toLowerCase();
  const fileName = file.path.split('/').pop()?.toLowerCase() || '';

  let score = 0;
  const matchedTerms: string[] = [];

  for (const term of queryTerms) {
    // Check file name (highest weight)
    if (fileName.includes(term)) {
      score += 10;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Check file path (medium weight)
    if (pathLower.includes(term)) {
      score += 5;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Count occurrences in content
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = contentLower.match(regex);
    if (matches) {
      // Logarithmic scoring for content matches (diminishing returns)
      score += Math.min(Math.log2(matches.length + 1) * 2, 10);
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Bonus for exact word match (word boundaries)
    const wordRegex = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi',
    );
    const wordMatches = contentLower.match(wordRegex);
    if (wordMatches) {
      score += Math.min(wordMatches.length, 5);
    }
  }

  // Bonus for matching multiple terms
  if (matchedTerms.length > 1) {
    score *= 1 + matchedTerms.length * 0.2;
  }

  // File type relevance bonus
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h'];
  const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.xml'];
  const docsExtensions = ['.md', '.txt', '.rst'];

  if (codeExtensions.some((ext) => file.path.endsWith(ext))) {
    score *= 1.2; // Boost code files
  } else if (configExtensions.some((ext) => file.path.endsWith(ext))) {
    score *= 0.8; // Slight penalty for config files
  } else if (docsExtensions.some((ext) => file.path.endsWith(ext))) {
    score *= 0.9; // Slight penalty for docs
  }

  // Penalty for very long files (likely generated or vendor code)
  const lineCount = file.content.split('\n').length;
  if (lineCount > 1000) {
    score *= 0.7;
  }

  return {
    path: file.path,
    score,
    matchedTerms,
  };
}

/**
 * Perform semantic-ish code search
 * (A true semantic search would use embeddings, but this uses heuristics)
 */
function performCodeSearch(
  files: FileContext[],
  query: string,
): string[] {
  const queryTerms = tokenizeQuery(query);

  if (queryTerms.length === 0) {
    return [];
  }

  // Score all files
  const scoredFiles = files.map((file) => calculateRelevance(file, queryTerms));

  // Filter to files with non-zero scores
  const relevantFiles = scoredFiles.filter((f) => f.score > 0);

  // Sort by score descending
  relevantFiles.sort((a, b) => b.score - a.score);

  // Return top results
  const MAX_RESULTS = 20;
  return relevantFiles.slice(0, MAX_RESULTS).map((f) => f.path);
}

// ============================================================================
// Tool Definition
// ============================================================================

const DESCRIPTION = `Search the codebase semantically to find files relevant to a query.

Use this tool when you need to discover which files contain code related to a specific concept, feature, or functionality.

### When to Use This Tool

- Explore unfamiliar codebases
- Ask "how / where / what" questions to understand behavior
- Find code by meaning rather than exact text

### When NOT to Use

Skip this tool for:
1. Exact text matches (use \`grep\`)
2. Reading known files (use \`read_file\`)
3. Simple symbol lookups (use \`grep\`)

### Examples

\`\`\`
code_search(query="user authentication")
code_search(query="database connection")
code_search(query="React form validation")
\`\`\``;

export const codeSearchTool: ToolDefinition<CodeSearchArgs> = {
  name: 'code_search',
  description: DESCRIPTION,
  inputSchema: codeSearchSchema,
  defaultConsent: 'always',
  modifiesState: false,

  getConsentPreview: (args) => `Search for "${args.query}"`,

  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<recoder-code-search query="${escapeXmlAttr(args.query)}">Searching...`;
  },

  execute: async (args, ctx: AgentContext) => {
    ctx.log?.(`Executing code search: ${args.query}`, 'debug');

    // Stream initial state to UI
    ctx.onXmlStream?.(`<recoder-code-search query="${escapeXmlAttr(args.query)}">`);

    try {
      // Get file list from docker backend
      const endpoint = `/api/files/${ctx.projectId}`;
      const response = await dockerGet<{
        files: Array<{ path: string; type: 'file' | 'directory' }>;
      }>(endpoint, { timeout: 30000 });

      const allFiles = response.files || [];

      // Filter to only code files
      const codeExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.hpp',
        '.rb', '.php', '.swift', '.kt', '.scala',
        '.vue', '.svelte',
        '.json', '.yaml', '.yml', '.toml',
        '.md', '.txt',
        '.css', '.scss', '.less',
        '.html', '.xml',
      ];

      const codeFiles = allFiles.filter((f) =>
        f.type === 'file' &&
        codeExtensions.some((ext) => f.path.endsWith(ext)) &&
        !f.path.includes('node_modules') &&
        !f.path.includes('.git') &&
        !f.path.includes('dist/') &&
        !f.path.includes('build/') &&
        !f.path.endsWith('.min.js') &&
        !f.path.endsWith('.min.css'),
      );

      // Limit the number of files to read for performance
      const MAX_FILES_TO_READ = 200;
      const limitedFiles = codeFiles.slice(0, MAX_FILES_TO_READ);

      ctx.log?.(
        `Reading ${limitedFiles.length} files for search (${codeFiles.length} total code files)`,
        'debug',
      );

      // Read file contents in parallel
      const filesContext: FileContext[] = [];
      const readPromises = limitedFiles.map(async (file) => {
        try {
          const fullPath = ctx.basePath
            ? safeJoin(ctx.basePath, file.path)
            : file.path;

          const content = await dockerReadFile(ctx.projectId, fullPath);

          // Skip very large files
          if (content.length > 100000) {
            return;
          }

          filesContext.push({
            path: file.path,
            content,
          });
        } catch {
          // Skip files that can't be read
        }
      });

      // Run reads in parallel with concurrency limit
      const CONCURRENCY = 30;
      for (let i = 0; i < readPromises.length; i += CONCURRENCY) {
        await Promise.all(readPromises.slice(i, i + CONCURRENCY));
      }

      ctx.log?.(
        `Searching ${filesContext.length} files for query: "${args.query}"`,
        'debug',
      );

      // Perform the search
      const relevantFiles = performCodeSearch(filesContext, args.query);

      // Format results
      const resultText =
        relevantFiles.length === 0
          ? 'No relevant files found.'
          : relevantFiles.map((f) => ` - ${f}`).join('\n');

      // Write final result to UI
      ctx.onXmlComplete?.(
        `<recoder-code-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</recoder-code-search>`,
      );

      ctx.log?.(`Code search completed for query: ${args.query}`, 'debug');

      if (relevantFiles.length === 0) {
        return 'No relevant files found for the given query.';
      }

      return `Found ${relevantFiles.length} relevant file(s):\n${resultText}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Code search failed: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Search for files relevant to a query
 */
export async function codeSearch(
  projectId: string,
  query: string,
  options?: { basePath?: string },
): Promise<string[]> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: false,
  };

  const result = await codeSearchTool.execute({ query }, ctx);

  // Parse the result to extract file paths
  const lines = result.split('\n');
  const files: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*-\s*(.+)$/);
    if (match) {
      files.push(match[1]);
    }
  }

  return files;
}
