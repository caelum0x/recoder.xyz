/**
 * Agent Tool: Search Replace
 *
 * Apply targeted search/replace edits to a file.
 * This is the preferred tool for making precise edits to existing files.
 *
 * Uses a diff format with SEARCH and REPLACE blocks that supports:
 * - Exact matching
 * - Fuzzy matching with whitespace normalization
 * - Levenshtein distance-based similarity matching
 */

import { z } from 'zod';
import {
  escapeXmlAttr,
  normalizePath,
  isPathSafe,
  safeJoin,
  type ToolDefinition,
  type AgentContext,
} from './types';
import { dockerReadFile, dockerWriteFile } from '../docker-api';

// ============================================================================
// Schema
// ============================================================================

const searchReplaceSchema = z.object({
  path: z.string().describe('The file path to edit'),
  search: z
    .string()
    .describe(
      'Content to search for in the file. This should match the existing code that will be replaced',
    ),
  replace: z
    .string()
    .describe('New content to replace the search content with'),
  description: z
    .string()
    .optional()
    .describe('Brief description of the changes'),
});

export type SearchReplaceArgs = z.infer<typeof searchReplaceSchema>;

// ============================================================================
// Search Replace Block Types
// ============================================================================

export interface SearchReplaceBlock {
  searchContent: string;
  replaceContent: string;
}

// ============================================================================
// Parser
// ============================================================================

const BLOCK_REGEX =
  /(?:^|\n)<<<<<<<\s+SEARCH>?\s*\n([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)=======\s*\n)([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)>>>>>>>\s+REPLACE)(?=\n|$)/g;

/**
 * Parse search/replace blocks from diff format
 */
export function parseSearchReplaceBlocks(diffContent: string): SearchReplaceBlock[] {
  const matches = Array.from(diffContent.matchAll(BLOCK_REGEX));
  return matches.map((m) => ({
    searchContent: m[1] ?? '',
    replaceContent: m[2] ?? '',
  }));
}

// ============================================================================
// String Normalization
// ============================================================================

/**
 * Normalize a string for comparison (handles smart quotes, etc.)
 */
function normalizeString(str: string): string {
  return str
    // Normalize smart quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Normalize dashes
    .replace(/[\u2013\u2014]/g, '-')
    // Normalize ellipsis
    .replace(/\u2026/g, '...')
    // Normalize spaces (keep newlines)
    .replace(/[\u00A0\u2003\u2002\u2009]/g, ' ');
}

/**
 * Unescape markers that were escaped in the content
 */
function unescapeMarkers(content: string): string {
  return content
    .replace(/^\\<<<<<<</gm, '<<<<<<<')
    .replace(/^\\=======/gm, '=======')
    .replace(/^\\>>>>>>>/gm, '>>>>>>>');
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

// Minimum similarity threshold for fuzzy matching (0 to 1, where 1 is exact match)
const FUZZY_MATCH_THRESHOLD = 0.9;

// Early termination threshold - stop searching if we find a match this good
const EARLY_STOP_THRESHOLD = 0.95;

// Maximum time to spend on fuzzy matching (in milliseconds)
const MAX_FUZZY_SEARCH_TIME_MS = 10_000; // 10 seconds

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first column
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 and 1, where 1 is an exact match
 */
function getSimilarity(original: string, search: string): number {
  if (search === '') {
    return 0;
  }

  const normalizedOriginal = normalizeString(original);
  const normalizedSearch = normalizeString(search);

  if (normalizedOriginal === normalizedSearch) {
    return 1;
  }

  const dist = levenshteinDistance(normalizedOriginal, normalizedSearch);
  const maxLength = Math.max(normalizedOriginal.length, normalizedSearch.length);
  return 1 - dist / maxLength;
}

/**
 * Quick scoring function that counts how many lines exactly match.
 * This is much faster than Levenshtein and serves as a good pre-filter.
 */
function quickScoreByExactLines(
  targetLines: string[],
  searchLines: string[],
  startIdx: number,
): number {
  let exactMatches = 0;

  for (let i = 0; i < searchLines.length; i++) {
    if (startIdx + i >= targetLines.length) break;

    if (
      normalizeString(targetLines[startIdx + i]) ===
      normalizeString(searchLines[i])
    ) {
      exactMatches++;
    }
  }

  return exactMatches / searchLines.length;
}

/**
 * Fast fuzzy search using a two-pass approach:
 * 1. Quick pre-filter pass: Count exact line matches (fast)
 * 2. Detailed pass: Only compute Levenshtein on promising candidates (expensive)
 */
function fastFuzzySearch(
  lines: string[],
  searchChunk: string,
  startIndex: number,
  endIndex: number,
): { bestScore: number; bestMatchIndex: number } {
  const searchLines = searchChunk.split(/\r?\n/);
  const searchLen = searchLines.length;

  const startTime = performance.now();
  const QUICK_THRESHOLD = 0.6;

  // First pass: find candidates with high exact line match ratio
  const candidates: Array<{ index: number; quickScore: number }> = [];

  for (let i = startIndex; i <= endIndex - searchLen; i++) {
    const elapsed = performance.now() - startTime;
    if (elapsed > MAX_FUZZY_SEARCH_TIME_MS) {
      console.warn(`Fast fuzzy search timed out during pre-filter after ${(elapsed / 1000).toFixed(1)}s`);
      break;
    }

    const quickScore = quickScoreByExactLines(lines, searchLines, i);

    if (quickScore >= QUICK_THRESHOLD) {
      candidates.push({ index: i, quickScore });
    }
  }

  // Sort candidates by quick score (best first)
  candidates.sort((a, b) => b.quickScore - a.quickScore);

  // Second pass: only compute expensive Levenshtein on top candidates
  let bestScore = 0;
  let bestMatchIndex = -1;
  const MAX_CANDIDATES_TO_CHECK = 10;

  for (let i = 0; i < Math.min(candidates.length, MAX_CANDIDATES_TO_CHECK); i++) {
    const candidate = candidates[i];

    const elapsed = performance.now() - startTime;
    if (elapsed > MAX_FUZZY_SEARCH_TIME_MS) {
      console.warn(`Fast fuzzy search timed out during detailed pass after ${(elapsed / 1000).toFixed(1)}s`);
      break;
    }

    const originalChunk = lines
      .slice(candidate.index, candidate.index + searchLen)
      .join('\n');

    const similarity = getSimilarity(originalChunk, searchChunk);

    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatchIndex = candidate.index;

      if (bestScore >= EARLY_STOP_THRESHOLD) {
        return { bestScore, bestMatchIndex };
      }
    }
  }

  return { bestScore, bestMatchIndex };
}

// ============================================================================
// Apply Search Replace
// ============================================================================

export interface ApplySearchReplaceResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Apply search/replace operations to content
 */
export function applySearchReplace(
  originalContent: string,
  diffContent: string,
): ApplySearchReplaceResult {
  const blocks = parseSearchReplaceBlocks(diffContent);
  if (blocks.length === 0) {
    return {
      success: false,
      error:
        'Invalid diff format - missing required sections. Expected <<<<<<< SEARCH / ======= / >>>>>>> REPLACE',
    };
  }

  const lineEnding = originalContent.includes('\r\n') ? '\r\n' : '\n';
  let resultLines = originalContent.split(/\r?\n/);
  let appliedCount = 0;

  for (const block of blocks) {
    let { searchContent, replaceContent } = block;

    // Normalize markers and strip line numbers if present
    searchContent = unescapeMarkers(searchContent);
    replaceContent = unescapeMarkers(replaceContent);

    const searchLines = searchContent === '' ? [] : searchContent.split(/\r?\n/);
    const replaceLines = replaceContent === '' ? [] : replaceContent.split(/\r?\n/);

    if (searchLines.length === 0) {
      return {
        success: false,
        error: 'Invalid diff format - empty SEARCH block is not allowed',
      };
    }

    // If search and replace are identical, skip
    if (searchLines.join('\n') === replaceLines.join('\n')) {
      console.warn('Search and replace blocks are identical');
    }

    let matchIndex = -1;

    const target = searchLines.join('\n');
    const hay = resultLines.join('\n');

    // Try exact string matching first and detect ambiguity
    const exactPositions: number[] = [];
    let fromIndex = 0;
    while (true) {
      const found = hay.indexOf(target, fromIndex);
      if (found === -1) break;
      exactPositions.push(found);
      fromIndex = found + 1;
    }

    if (exactPositions.length > 1) {
      return {
        success: false,
        error: 'Search block matched multiple locations in the target file (ambiguous)',
      };
    }

    if (exactPositions.length === 1) {
      const pos = exactPositions[0];
      matchIndex = hay.substring(0, pos).split('\n').length - 1;
    }

    if (matchIndex === -1) {
      // Lenient fallback: ignore leading indentation and trailing whitespace
      const normalizeForMatch = (line: string) =>
        line.replace(/^[\t ]*/, '').replace(/[\t ]+$/, '');

      const normalizedSearch = searchLines.map(normalizeForMatch);

      const candidates: number[] = [];
      for (let i = 0; i <= resultLines.length - searchLines.length; i++) {
        let allMatch = true;
        for (let j = 0; j < searchLines.length; j++) {
          if (normalizeForMatch(resultLines[i + j]) !== normalizedSearch[j]) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          candidates.push(i);
          if (candidates.length > 1) break;
        }
      }

      if (candidates.length > 1) {
        return {
          success: false,
          error: 'Search block fuzzy matched multiple locations in the target file (ambiguous)',
        };
      }

      if (candidates.length === 1) {
        matchIndex = candidates[0];
      }
    }

    // If still no match, try fuzzy matching with Levenshtein distance
    if (matchIndex === -1) {
      const searchChunk = searchLines.join('\n');
      const { bestScore, bestMatchIndex } = fastFuzzySearch(
        resultLines,
        searchChunk,
        0,
        resultLines.length,
      );

      if (bestScore >= FUZZY_MATCH_THRESHOLD) {
        matchIndex = bestMatchIndex;
      } else {
        return {
          success: false,
          error: `Search block did not match any content in the target file. Best fuzzy match had similarity of ${(bestScore * 100).toFixed(1)}% (threshold: ${(FUZZY_MATCH_THRESHOLD * 100).toFixed(1)}%)`,
        };
      }
    }

    const matchedLines = resultLines.slice(matchIndex, matchIndex + searchLines.length);

    // Preserve indentation relative to first matched line
    const originalIndents = matchedLines.map((line) => {
      const m = line.match(/^[\t ]*/);
      return m ? m[0] : '';
    });
    const searchIndents = searchLines.map((line) => {
      const m = line.match(/^[\t ]*/);
      return m ? m[0] : '';
    });

    const indentedReplaceLines = replaceLines.map((line) => {
      const matchedIndent = originalIndents[0] || '';
      const currentIndentMatch = line.match(/^[\t ]*/);
      const currentIndent = currentIndentMatch ? currentIndentMatch[0] : '';
      const searchBaseIndent = searchIndents[0] || '';

      const searchBaseLevel = searchBaseIndent.length;
      const currentLevel = currentIndent.length;
      const relativeLevel = currentLevel - searchBaseLevel;

      const finalIndent =
        relativeLevel < 0
          ? matchedIndent.slice(0, Math.max(0, matchedIndent.length + relativeLevel))
          : matchedIndent + currentIndent.slice(searchBaseLevel);

      return finalIndent + line.trim();
    });

    const beforeMatch = resultLines.slice(0, matchIndex);
    const afterMatch = resultLines.slice(matchIndex + searchLines.length);
    resultLines = [...beforeMatch, ...indentedReplaceLines, ...afterMatch];
    appliedCount++;
  }

  if (appliedCount === 0) {
    return {
      success: false,
      error: 'No search/replace blocks could be applied',
    };
  }

  return { success: true, content: resultLines.join(lineEnding) };
}

/**
 * Apply a single search/replace operation (without block format)
 */
export function applySingleSearchReplace(
  originalContent: string,
  search: string,
  replace: string,
): ApplySearchReplaceResult {
  const operations = `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
  return applySearchReplace(originalContent, operations);
}

// ============================================================================
// Tool Definition
// ============================================================================

export const searchReplaceTool: ToolDefinition<SearchReplaceArgs> = {
  name: 'search_replace',
  description: `Apply targeted search/replace edits to a file. This is the preferred tool for editing a file.

Use this format:
- The \`search\` parameter should contain the exact code you want to replace
- The \`replace\` parameter should contain the new code

Features:
- Exact matching is tried first
- Falls back to whitespace-normalized matching
- Falls back to fuzzy matching with 90% similarity threshold
- Preserves the original indentation

Example:
\`\`\`
search_replace(
  path="src/App.tsx",
  search="const title = 'Hello'",
  replace="const title = 'Hello World'"
)
\`\`\``,
  inputSchema: searchReplaceSchema,
  defaultConsent: 'always',
  modifiesState: true,

  getConsentPreview: (args) => `Edit ${args.path}`,

  buildXml: (args, isComplete) => {
    if (!args.path) return undefined;

    let xml = `<recoder-search-replace path="${escapeXmlAttr(args.path)}" description="${escapeXmlAttr(args.description ?? '')}">\n<<<<<<< SEARCH\n${args.search ?? ''}`;

    if (args.replace !== undefined) {
      xml += `\n=======\n${args.replace}`;
    }

    if (isComplete) {
      if (args.replace === undefined) {
        xml += '\n=======\n';
      }
      xml += '\n>>>>>>> REPLACE\n</recoder-search-replace>';
    }

    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    // Check modification permissions
    if (!ctx.canModify) {
      throw new Error('File modification not allowed in current context');
    }

    const normalizedPath = normalizePath(args.path);

    // Safety check
    if (!isPathSafe(args.path)) {
      throw new Error(`Invalid path: ${args.path} - path traversal not allowed`);
    }

    const fullPath = ctx.basePath
      ? safeJoin(ctx.basePath, normalizedPath)
      : normalizedPath;

    ctx.log?.(`Applying search/replace to: ${fullPath}`, 'debug');

    // Read original file
    let originalContent: string;
    try {
      originalContent = await dockerReadFile(ctx.projectId, fullPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.toLowerCase().includes('not found')) {
        throw new Error(`File does not exist: ${args.path}`);
      }
      throw new Error(`Failed to read file ${args.path}: ${message}`);
    }

    // Apply search/replace
    const result = applySingleSearchReplace(originalContent, args.search, args.replace);

    if (!result.success || !result.content) {
      throw new Error(`Failed to apply search-replace: ${result.error ?? 'unknown'}`);
    }

    // Write the updated content
    try {
      await dockerWriteFile(ctx.projectId, fullPath, result.content);
      ctx.log?.(`Successfully applied search-replace to: ${fullPath}`, 'info');
      return `Successfully applied edits to ${args.path}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write edited file ${args.path}: ${message}`);
    }
  },
};

// ============================================================================
// Standalone Function
// ============================================================================

/**
 * Apply search/replace to a file in the project
 */
export async function searchReplace(
  projectId: string,
  path: string,
  search: string,
  replace: string,
  options?: { basePath?: string; description?: string },
): Promise<void> {
  const ctx: AgentContext = {
    projectId,
    basePath: options?.basePath,
    canModify: true,
  };

  await searchReplaceTool.execute(
    { path, search, replace, description: options?.description },
    ctx,
  );
}
