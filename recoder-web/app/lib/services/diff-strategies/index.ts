/**
 * Diff Strategies System
 * Copied from Kilocode - Provides multiple strategies for applying
 * code changes including search/replace, unified diff, and fuzzy matching
 */

import { z } from 'zod';
import { atom } from 'nanostores';

// =============================================================================
// Constants
// =============================================================================

export const BUFFER_LINES = 40; // Lines of context around matches
export const DEFAULT_FUZZY_THRESHOLD = 0.8; // 0.0 = very fuzzy, 1.0 = exact match
export const MAX_SEARCH_ATTEMPTS = 100; // Prevent infinite loops

// =============================================================================
// Schemas
// =============================================================================

export const DiffStrategyTypeSchema = z.enum([
  'search_replace',
  'multi_search_replace',
  'unified_diff',
  'line_replace',
]);

export const DiffBlockSchema = z.object({
  search: z.string(),
  replace: z.string(),
  startLine: z.number().optional(),
});

export const DiffResultSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  error: z.string().optional(),
  matchedAt: z.number().optional(), // Line number where match was found
  changes: z.object({
    additions: z.number(),
    deletions: z.number(),
  }).optional(),
});

export const MultiDiffResultSchema = z.object({
  success: z.boolean(),
  results: z.array(z.object({
    path: z.string(),
    result: DiffResultSchema,
  })),
  failedCount: z.number(),
  successCount: z.number(),
});

// =============================================================================
// Types
// =============================================================================

export type DiffStrategyType = z.infer<typeof DiffStrategyTypeSchema>;
export type DiffBlock = z.infer<typeof DiffBlockSchema>;
export type DiffResult = z.infer<typeof DiffResultSchema>;
export type MultiDiffResult = z.infer<typeof MultiDiffResultSchema>;

// =============================================================================
// State
// =============================================================================

export const currentStrategy = atom<DiffStrategyType>('search_replace');
export const fuzzyThreshold = atom<number>(DEFAULT_FUZZY_THRESHOLD);

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Normalize string for comparison (handle smart quotes, etc.)
 */
export function normalizeString(str: string): string {
  return str
    // Smart quotes to regular quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Various dashes to regular hyphen
    .replace(/[\u2013\u2014]/g, '-')
    // Normalize whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio (0-1) between two strings
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// =============================================================================
// Search/Replace Strategy
// =============================================================================

/**
 * Apply a single search/replace block to content
 */
export function applySearchReplace(
  content: string,
  search: string,
  replace: string,
  options: {
    fuzzy?: boolean;
    threshold?: number;
    startLine?: number;
  } = {}
): DiffResult {
  const normalizedContent = normalizeString(content);
  const normalizedSearch = normalizeString(search);
  const threshold = options.threshold ?? fuzzyThreshold.get();

  // Exact match first
  const exactIndex = normalizedContent.indexOf(normalizedSearch);
  if (exactIndex !== -1) {
    const before = content.slice(0, exactIndex);
    const after = content.slice(exactIndex + search.length);
    const newContent = before + replace + after;

    return {
      success: true,
      content: newContent,
      matchedAt: before.split('\n').length,
      changes: {
        additions: replace.split('\n').length,
        deletions: search.split('\n').length,
      },
    };
  }

  // Fuzzy match if enabled
  if (options.fuzzy) {
    const lines = normalizedContent.split('\n');
    const searchLines = normalizedSearch.split('\n');
    const searchLineCount = searchLines.length;

    // Middle-out search for better performance on large files
    const midpoint = options.startLine ?? Math.floor(lines.length / 2);
    let bestMatch: { index: number; similarity: number } | null = null;

    for (let offset = 0; offset < Math.max(midpoint, lines.length - midpoint); offset++) {
      for (const direction of [1, -1]) {
        const i = midpoint + offset * direction;
        if (i < 0 || i + searchLineCount > lines.length) continue;

        const candidateLines = lines.slice(i, i + searchLineCount);
        const candidate = candidateLines.join('\n');
        const similarity = stringSimilarity(candidate, normalizedSearch);

        if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { index: i, similarity };
          if (similarity === 1) break; // Perfect match
        }
      }
      if (bestMatch?.similarity === 1) break;
    }

    if (bestMatch) {
      const originalLines = content.split('\n');
      const beforeLines = originalLines.slice(0, bestMatch.index);
      const afterLines = originalLines.slice(bestMatch.index + searchLineCount);
      const newContent = [...beforeLines, replace, ...afterLines].join('\n');

      return {
        success: true,
        content: newContent,
        matchedAt: bestMatch.index + 1,
        changes: {
          additions: replace.split('\n').length,
          deletions: searchLineCount,
        },
      };
    }
  }

  return {
    success: false,
    error: 'Search text not found in content',
  };
}

// =============================================================================
// Multi Search/Replace Strategy
// =============================================================================

/**
 * Parse diff blocks from formatted diff string
 * Format:
 * <<<<<<< SEARCH
 * :start_line: N
 * -------
 * [search content]
 * =======
 * [replace content]
 * >>>>>>> REPLACE
 */
export function parseDiffBlocks(diffString: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const blockRegex = /<<<<<<< SEARCH\n(?::start_line:\s*(\d+)\n-------\n)?([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

  let match;
  while ((match = blockRegex.exec(diffString)) !== null) {
    const [_, startLineStr, search, replace] = match;
    blocks.push({
      search: search.trim(),
      replace: replace.trim(),
      startLine: startLineStr ? parseInt(startLineStr, 10) : undefined,
    });
  }

  return blocks;
}

/**
 * Apply multiple search/replace blocks to content
 */
export function applyMultiSearchReplace(
  content: string,
  blocks: DiffBlock[],
  options: {
    fuzzy?: boolean;
    threshold?: number;
    continueOnError?: boolean;
  } = {}
): DiffResult {
  let currentContent = content;
  let totalAdditions = 0;
  let totalDeletions = 0;
  const errors: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const result = applySearchReplace(
      currentContent,
      block.search,
      block.replace,
      {
        fuzzy: options.fuzzy,
        threshold: options.threshold,
        startLine: block.startLine,
      }
    );

    if (result.success && result.content) {
      currentContent = result.content;
      totalAdditions += result.changes?.additions ?? 0;
      totalDeletions += result.changes?.deletions ?? 0;
    } else {
      errors.push(`Block ${i + 1}: ${result.error}`);
      if (!options.continueOnError) {
        return {
          success: false,
          error: errors.join('\n'),
        };
      }
    }
  }

  if (errors.length > 0 && errors.length === blocks.length) {
    return {
      success: false,
      error: errors.join('\n'),
    };
  }

  return {
    success: true,
    content: currentContent,
    changes: {
      additions: totalAdditions,
      deletions: totalDeletions,
    },
  };
}

// =============================================================================
// Unified Diff Strategy
// =============================================================================

/**
 * Parse a unified diff format
 * @@ -start,count +start,count @@
 */
export function parseUnifiedDiff(diffString: string): Array<{
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }>;
}> {
  const hunks: Array<{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }>;
  }> = [];

  const hunkRegex = /@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@\n?([\s\S]*?)(?=@@|$)/g;
  let match;

  while ((match = hunkRegex.exec(diffString)) !== null) {
    const [_, oldStart, oldCount, newStart, newCount, content] = match;
    const lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }> = [];

    for (const line of content.split('\n')) {
      if (line.startsWith('+')) {
        lines.push({ type: 'add', content: line.slice(1) });
      } else if (line.startsWith('-')) {
        lines.push({ type: 'remove', content: line.slice(1) });
      } else if (line.startsWith(' ') || line === '') {
        lines.push({ type: 'context', content: line.slice(1) || '' });
      }
    }

    hunks.push({
      oldStart: parseInt(oldStart, 10),
      oldCount: parseInt(oldCount || '1', 10),
      newStart: parseInt(newStart, 10),
      newCount: parseInt(newCount || '1', 10),
      lines,
    });
  }

  return hunks;
}

/**
 * Apply a unified diff to content
 */
export function applyUnifiedDiff(
  content: string,
  diffString: string
): DiffResult {
  const hunks = parseUnifiedDiff(diffString);
  if (hunks.length === 0) {
    return {
      success: false,
      error: 'No valid diff hunks found',
    };
  }

  const lines = content.split('\n');
  let offset = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const hunk of hunks) {
    const startLine = hunk.oldStart - 1 + offset;
    let lineIndex = startLine;

    for (const line of hunk.lines) {
      if (line.type === 'remove') {
        if (lines[lineIndex] !== line.content) {
          return {
            success: false,
            error: `Line ${lineIndex + 1} does not match expected content for removal`,
          };
        }
        lines.splice(lineIndex, 1);
        offset--;
        totalDeletions++;
      } else if (line.type === 'add') {
        lines.splice(lineIndex, 0, line.content);
        lineIndex++;
        offset++;
        totalAdditions++;
      } else {
        // Context line - verify it matches
        if (lines[lineIndex] !== line.content) {
          return {
            success: false,
            error: `Context line ${lineIndex + 1} does not match`,
          };
        }
        lineIndex++;
      }
    }
  }

  return {
    success: true,
    content: lines.join('\n'),
    changes: {
      additions: totalAdditions,
      deletions: totalDeletions,
    },
  };
}

// =============================================================================
// Line Replace Strategy
// =============================================================================

/**
 * Replace specific lines in content
 */
export function applyLineReplace(
  content: string,
  startLine: number,
  endLine: number,
  replacement: string
): DiffResult {
  const lines = content.split('\n');

  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    return {
      success: false,
      error: `Invalid line range: ${startLine}-${endLine} (file has ${lines.length} lines)`,
    };
  }

  const beforeLines = lines.slice(0, startLine - 1);
  const afterLines = lines.slice(endLine);
  const replacementLines = replacement.split('\n');

  const newContent = [...beforeLines, ...replacementLines, ...afterLines].join('\n');

  return {
    success: true,
    content: newContent,
    matchedAt: startLine,
    changes: {
      additions: replacementLines.length,
      deletions: endLine - startLine + 1,
    },
  };
}

// =============================================================================
// Strategy Selection
// =============================================================================

/**
 * Automatically detect and apply the best diff strategy
 */
export function applyDiff(
  content: string,
  diff: string,
  options: {
    strategy?: DiffStrategyType;
    fuzzy?: boolean;
    threshold?: number;
  } = {}
): DiffResult {
  const strategy = options.strategy ?? detectDiffStrategy(diff);

  switch (strategy) {
    case 'search_replace':
      const blocks = parseDiffBlocks(diff);
      if (blocks.length > 0) {
        return applyMultiSearchReplace(content, blocks, options);
      }
      // Single search/replace
      const [search, replace] = diff.split('\n---\n');
      if (search && replace !== undefined) {
        return applySearchReplace(content, search, replace, options);
      }
      return { success: false, error: 'Invalid search/replace format' };

    case 'multi_search_replace':
      return applyMultiSearchReplace(content, parseDiffBlocks(diff), options);

    case 'unified_diff':
      return applyUnifiedDiff(content, diff);

    case 'line_replace':
      // Parse line:start-end format
      const lineMatch = diff.match(/^lines?:(\d+)-(\d+)\n([\s\S]*)$/);
      if (lineMatch) {
        return applyLineReplace(
          content,
          parseInt(lineMatch[1], 10),
          parseInt(lineMatch[2], 10),
          lineMatch[3]
        );
      }
      return { success: false, error: 'Invalid line replace format' };

    default:
      return { success: false, error: `Unknown strategy: ${strategy}` };
  }
}

/**
 * Detect the diff strategy from content
 */
export function detectDiffStrategy(diff: string): DiffStrategyType {
  if (diff.includes('<<<<<<< SEARCH')) {
    return 'multi_search_replace';
  }
  if (diff.includes('@@ -') && diff.includes(' @@')) {
    return 'unified_diff';
  }
  if (diff.match(/^lines?:\d+-\d+\n/)) {
    return 'line_replace';
  }
  return 'search_replace';
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that a diff can be applied without actually applying it
 */
export function validateDiff(
  content: string,
  diff: string,
  options: {
    strategy?: DiffStrategyType;
    fuzzy?: boolean;
    threshold?: number;
  } = {}
): { valid: boolean; error?: string; strategy: DiffStrategyType } {
  const strategy = options.strategy ?? detectDiffStrategy(diff);

  // Create a copy to test
  const result = applyDiff(content, diff, { ...options, strategy });

  return {
    valid: result.success,
    error: result.error,
    strategy,
  };
}

/**
 * Preview diff application without modifying original
 */
export function previewDiff(
  content: string,
  diff: string,
  options: {
    strategy?: DiffStrategyType;
    fuzzy?: boolean;
    threshold?: number;
    contextLines?: number;
  } = {}
): {
  success: boolean;
  preview?: string;
  changes?: DiffResult['changes'];
  error?: string;
} {
  const result = applyDiff(content, diff, options);

  if (!result.success || !result.content) {
    return { success: false, error: result.error };
  }

  // Generate a preview diff
  const contextLines = options.contextLines ?? 3;
  const oldLines = content.split('\n');
  const newLines = result.content.split('\n');

  // Simple preview: show changed region with context
  const preview = generateUnifiedDiff(oldLines, newLines, contextLines);

  return {
    success: true,
    preview,
    changes: result.changes,
  };
}

/**
 * Generate unified diff from two line arrays
 */
function generateUnifiedDiff(
  oldLines: string[],
  newLines: string[],
  contextLines: number
): string {
  const diff: string[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      // Context line
      diff.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      // Removed line
      diff.push(`-${oldLines[i]}`);
      i++;
    } else if (j < newLines.length) {
      // Added line
      diff.push(`+${newLines[j]}`);
      j++;
    }
  }

  return diff.join('\n');
}
