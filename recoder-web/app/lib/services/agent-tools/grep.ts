/**
 * Agent Tool: Grep
 *
 * Search for a regex pattern in the codebase using text matching.
 * Returns matching lines with file paths and line numbers.
 */

import { z } from 'zod';
import {
  escapeXmlAttr,
  escapeXmlContent,
  normalizePath,
  isPathSafe,
  safeJoin,
  type ToolDefinition,
  type AgentContext,
} from './types';
import { dockerGet, dockerReadFile } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const grepSchema = z.object({
  query: z.string().describe('The regex pattern to search for'),
  include_pattern: z
    .string()
    .optional()
    .describe(
      "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)",
    ),
  exclude_pattern: z
    .string()
    .optional()
    .describe("Glob pattern for files to exclude (e.g. '*.test.ts')"),
  case_sensitive: z
    .boolean()
    .optional()
    .describe('Whether the search should be case sensitive (default: false)'),
});

export type GrepArgs = z.infer<typeof grepSchema>;

// ============================================================================
// Types
// ============================================================================

export interface GrepMatch {
  path: string;
  lineNumber: number;
  lineText: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildGrepAttributes(args: Partial<GrepArgs>, count?: number): string {
  const attrs: string[] = [];
  if (args.query) {
    attrs.push(`query="${escapeXmlAttr(args.query)}"`);
  }
  if (args.include_pattern) {
    attrs.push(`include="${escapeXmlAttr(args.include_pattern)}"`);
  }
  if (args.exclude_pattern) {
    attrs.push(`exclude="${escapeXmlAttr(args.exclude_pattern)}"`);
  }
  if (args.case_sensitive) {
    attrs.push(`case-sensitive="true"`);
  }
  if (count !== undefined) {
    attrs.push(`count="${count}"`);
  }
  return attrs.join(' ');
}

/**
 * Check if a file path matches a glob pattern
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '@@DOUBLESTAR@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@DOUBLESTAR@@/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Check if a file should be included in the search
 */
function shouldIncludeFile(
  path: string,
  includePattern?: string,
  excludePattern?: string,
): boolean {
  // Default excluded patterns (common non-code files)
  const defaultExcludes = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.min.css',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
  ];

  // Check default excludes
  for (const exclude of defaultExcludes) {
    if (matchesGlob(path, exclude)) {
      return false;
    }
  }

  // Check exclude pattern
  if (excludePattern && matchesGlob(path, excludePattern)) {
    return false;
  }

  // Check include pattern
  if (includePattern && !matchesGlob(path, includePattern)) {
    return false;
  }

  return true;
}

/**
 * Search for a pattern in file content
 */
function searchInContent(
  content: string,
  pattern: string,
  caseSensitive: boolean = false,
): Array<{ lineNumber: number; lineText: string }> {
  const matches: Array<{ lineNumber: number; lineText: string }> = [];

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch {
    // If the pattern is not a valid regex, escape it and search as literal
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (regex.test(line)) {
      matches.push({
        lineNumber: i + 1,
        lineText: line.trim(),
      });
      // Reset lastIndex for global regex
      regex.lastIndex = 0;
    }
  }

  return matches;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const grepTool: ToolDefinition<GrepArgs> = {
  name: 'grep',
  description: `Search for a regex pattern in the codebase.

- Returns matching lines with file paths and line numbers
- By default, the search is case-insensitive
- Use include_pattern to filter by file type (e.g. '*.tsx')
- Use exclude_pattern to skip certain files (e.g. '*.test.ts')

Example:
\`\`\`
grep(query="useState", include_pattern="*.tsx")
\`\`\``,
  inputSchema: grepSchema,
  defaultConsent: 'always',
  modifiesState: false,

  getConsentPreview: (args) => {
    let preview = `Search for "${args.query}"`;
    if (args.include_pattern) {
      preview += ` in ${args.include_pattern}`;
    }
    return preview;
  },

  buildXml: (args, isComplete) => {
    if (isComplete) {
      return undefined;
    }
    if (!args.query) return undefined;
    const attrs = buildGrepAttributes(args);
    return `<recoder-grep ${attrs}>Searching...</recoder-grep>`;
  },

  execute: async (args, ctx: AgentContext) => {
    ctx.log?.(`Searching for pattern: ${args.query}`, 'debug');

    const matches: GrepMatch[] = [];

    try {
      // Get file list from docker backend
      const endpoint = `/api/files/${ctx.projectId}`;
      const response = await dockerGet<{
        files: Array<{ path: string; type: 'file' | 'directory' }>;
      }>(endpoint, { timeout: 30000 });

      const allFiles = response.files || [];
      const filesToSearch = allFiles.filter(
        (f) =>
          f.type === 'file' &&
          shouldIncludeFile(f.path, args.include_pattern, args.exclude_pattern),
      );

      // Limit the number of files to search for performance
      const MAX_FILES_TO_SEARCH = 500;
      const limitedFiles = filesToSearch.slice(0, MAX_FILES_TO_SEARCH);

      if (filesToSearch.length > MAX_FILES_TO_SEARCH) {
        ctx.log?.(
          `Limiting search to ${MAX_FILES_TO_SEARCH} files (${filesToSearch.length} matched)`,
          'warn',
        );
      }

      // Search each file
      const searchPromises = limitedFiles.map(async (file) => {
        try {
          const fullPath = ctx.basePath
            ? safeJoin(ctx.basePath, file.path)
            : file.path;

          const content = await dockerReadFile(ctx.projectId, fullPath);
          const fileMatches = searchInContent(
            content,
            args.query,
            args.case_sensitive,
          );

          for (const match of fileMatches) {
            matches.push({
              path: file.path,
              lineNumber: match.lineNumber,
              lineText: match.lineText,
            });
          }
        } catch {
          // Skip files that can't be read (binary, etc.)
        }
      });

      // Run searches in parallel with concurrency limit
      const CONCURRENCY = 20;
      for (let i = 0; i < searchPromises.length; i += CONCURRENCY) {
        await Promise.all(searchPromises.slice(i, i + CONCURRENCY));
      }

      // Sort matches by file path and line number
      matches.sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return a.lineNumber - b.lineNumber;
      });

      // Limit results
      const MAX_RESULTS = 100;
      const limitedMatches = matches.slice(0, MAX_RESULTS);

      const attrs = buildGrepAttributes(args, matches.length);

      if (matches.length === 0) {
        ctx.onXmlComplete?.(`<recoder-grep ${attrs}>No matches found.</recoder-grep>`);
        return 'No matches found.';
      }

      // Format output: path:line: content
      const lines = limitedMatches.map(
        (m) => `${m.path}:${m.lineNumber}: ${m.lineText}`,
      );

      if (matches.length > MAX_RESULTS) {
        lines.push(`\n... and ${matches.length - MAX_RESULTS} more matches`);
      }

      const resultText = lines.join('\n');

      ctx.onXmlComplete?.(
        `<recoder-grep ${attrs}>\n${escapeXmlContent(resultText)}\n</recoder-grep>`,
      );

      return resultText;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Search failed: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Search for a pattern in the project
 */
export async function grep(
  projectId: string,
  query: string,
  options?: {
    includePattern?: string;
    excludePattern?: string;
    caseSensitive?: boolean;
    basePath?: string;
  },
): Promise<GrepMatch[]> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: false,
  };

  const result = await grepTool.execute(
    {
      query,
      include_pattern: options?.includePattern,
      exclude_pattern: options?.excludePattern,
      case_sensitive: options?.caseSensitive,
    },
    ctx,
  );

  // Parse the result back into matches
  const matches: GrepMatch[] = [];
  const lines = result.split('\n');

  for (const line of lines) {
    const match = line.match(/^(.+):(\d+): (.*)$/);
    if (match) {
      matches.push({
        path: match[1],
        lineNumber: parseInt(match[2], 10),
        lineText: match[3],
      });
    }
  }

  return matches;
}
