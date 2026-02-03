/**
 * Code Search Service
 *
 * Provides full-text search within file contents with regex support,
 * context lines, and search-and-replace functionality.
 */

import type {
  CodeSearchResult,
  CodeSearchOptions,
  SearchReplaceOperation,
  ReplacePreview,
  HighlightRange,
} from './types';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONTEXT_LINES = 2;
const MAX_RESULTS_DEFAULT = 100;
const MAX_LINE_LENGTH = 500;

// =============================================================================
// Search Utilities
// =============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create search regex from options
 */
function createSearchRegex(
  query: string,
  options: CodeSearchOptions
): RegExp {
  let pattern = query;

  if (!options.useRegex) {
    pattern = escapeRegex(query);
  }

  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  const flags = options.caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

/**
 * Validate regex pattern
 */
export function validateRegex(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Invalid regex pattern',
    };
  }
}

/**
 * Truncate line content for display
 */
function truncateLine(line: string, maxLength: number = MAX_LINE_LENGTH): string {
  if (line.length <= maxLength) return line;
  return line.slice(0, maxLength - 3) + '...';
}

/**
 * Get context lines around a match
 */
function getContextLines(
  lines: string[],
  lineIndex: number,
  contextCount: number
): { before: string[]; after: string[] } {
  const before = lines
    .slice(Math.max(0, lineIndex - contextCount), lineIndex)
    .map(truncateLine);

  const after = lines
    .slice(lineIndex + 1, Math.min(lines.length, lineIndex + contextCount + 1))
    .map(truncateLine);

  return { before, after };
}

// =============================================================================
// Code Search
// =============================================================================

/**
 * Search for text within file contents
 */
export function searchInFile(
  filePath: string,
  content: string,
  query: string,
  options: CodeSearchOptions = {}
): CodeSearchResult[] {
  const mergedOptions: CodeSearchOptions = {
    contextLines: DEFAULT_CONTEXT_LINES,
    caseSensitive: false,
    useRegex: false,
    wholeWord: false,
    maxResults: MAX_RESULTS_DEFAULT,
    ...options,
  };

  if (!query.trim()) return [];

  // Validate regex if needed
  if (mergedOptions.useRegex) {
    const validation = validateRegex(query);
    if (!validation.valid) {
      console.warn(`[CodeSearch] Invalid regex: ${validation.error}`);
      return [];
    }
  }

  const regex = createSearchRegex(query, mergedOptions);
  const lines = content.split('\n');
  const results: CodeSearchResult[] = [];

  for (let i = 0; i < lines.length && results.length < mergedOptions.maxResults!; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    // Reset regex for global matching
    regex.lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      const { before, after } = getContextLines(
        lines,
        i,
        mergedOptions.contextLines!
      );

      results.push({
        id: `code:${filePath}:${i + 1}:${match.index}`,
        source: 'code',
        label: truncateLine(line.trim()),
        description: `${filePath}:${i + 1}`,
        score: 1,
        matchType: mergedOptions.useRegex ? 'regex' : 'exact',
        highlights: [
          {
            start: match.index,
            end: match.index + match[0].length,
          },
        ],
        icon: 'i-ph-text-t',
        filePath,
        lineNumber: i + 1,
        column: match.index + 1,
        lineContent: line,
        contextBefore: before,
        contextAfter: after,
        matchedText: match[0],
        matchLength: match[0].length,
      });

      // Prevent infinite loops with zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }

      // Limit matches per line
      if (results.length >= mergedOptions.maxResults!) break;
    }
  }

  return results;
}

/**
 * Search across multiple files
 */
export function searchInFiles(
  files: Map<string, string>,
  query: string,
  options: CodeSearchOptions = {}
): CodeSearchResult[] {
  const mergedOptions: CodeSearchOptions = {
    maxResults: MAX_RESULTS_DEFAULT,
    ...options,
  };

  const allResults: CodeSearchResult[] = [];

  for (const [filePath, content] of files) {
    // Check file extension filter
    if (options.extensions) {
      const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
      if (!options.extensions.includes(ext)) continue;
    }

    // Check exclude patterns
    if (options.excludePatterns) {
      let shouldExclude = false;
      for (const pattern of options.excludePatterns) {
        if (matchesPattern(filePath, pattern)) {
          shouldExclude = true;
          break;
        }
      }
      if (shouldExclude) continue;
    }

    const fileResults = searchInFile(filePath, content, query, {
      ...mergedOptions,
      maxResults: mergedOptions.maxResults! - allResults.length,
    });

    allResults.push(...fileResults);

    if (allResults.length >= mergedOptions.maxResults!) break;
  }

  return allResults;
}

/**
 * Simple pattern matching for exclude patterns
 */
function matchesPattern(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTAR}}/g, '.*');

  try {
    return new RegExp(`^${regexPattern}$`).test(path);
  } catch {
    return false;
  }
}

// =============================================================================
// Search and Replace
// =============================================================================

/**
 * Create replacement regex
 */
function createReplaceRegex(operation: SearchReplaceOperation): RegExp {
  let pattern = operation.search;

  if (!operation.isRegex) {
    pattern = escapeRegex(pattern);
  }

  if (operation.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  const flags = operation.caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

/**
 * Apply case preservation to replacement
 */
function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original === original.toLowerCase()) {
    return replacement.toLowerCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

/**
 * Preview replacements for a file
 */
export function previewReplacements(
  filePath: string,
  content: string,
  operation: SearchReplaceOperation
): ReplacePreview[] {
  // Validate regex if needed
  if (operation.isRegex) {
    const validation = validateRegex(operation.search);
    if (!validation.valid) return [];
  }

  const regex = createReplaceRegex(operation);
  const lines = content.split('\n');
  const previews: ReplacePreview[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    regex.lastIndex = 0;

    if (regex.test(line)) {
      regex.lastIndex = 0;
      const replaced = line.replace(regex, (match) => {
        if (operation.preserveCase) {
          return preserveCase(match, operation.replace);
        }
        return operation.replace;
      });

      if (replaced !== line) {
        previews.push({
          filePath,
          original: truncateLine(line),
          replaced: truncateLine(replaced),
          lineNumber: i + 1,
          hasChange: true,
        });
      }
    }
  }

  return previews;
}

/**
 * Execute replacements on content
 */
export function executeReplacements(
  content: string,
  operation: SearchReplaceOperation
): { content: string; count: number } {
  // Validate regex if needed
  if (operation.isRegex) {
    const validation = validateRegex(operation.search);
    if (!validation.valid) {
      return { content, count: 0 };
    }
  }

  const regex = createReplaceRegex(operation);
  let count = 0;

  const newContent = content.replace(regex, (match) => {
    count++;
    if (operation.preserveCase) {
      return preserveCase(match, operation.replace);
    }
    return operation.replace;
  });

  return { content: newContent, count };
}

/**
 * Execute replacements across multiple files
 */
export function executeReplacementsInFiles(
  files: Map<string, string>,
  operation: SearchReplaceOperation,
  options: CodeSearchOptions = {}
): Map<string, { content: string; count: number }> {
  const results = new Map<string, { content: string; count: number }>();

  for (const [filePath, content] of files) {
    // Check file extension filter
    if (options.extensions) {
      const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
      if (!options.extensions.includes(ext)) continue;
    }

    // Check exclude patterns
    if (options.excludePatterns) {
      let shouldExclude = false;
      for (const pattern of options.excludePatterns) {
        if (matchesPattern(filePath, pattern)) {
          shouldExclude = true;
          break;
        }
      }
      if (shouldExclude) continue;
    }

    const result = executeReplacements(content, operation);
    if (result.count > 0) {
      results.set(filePath, result);
    }
  }

  return results;
}

// =============================================================================
// Search Statistics
// =============================================================================

/**
 * Get search statistics for results
 */
export function getSearchStats(results: CodeSearchResult[]): {
  totalMatches: number;
  fileCount: number;
  fileBreakdown: Map<string, number>;
} {
  const fileBreakdown = new Map<string, number>();

  for (const result of results) {
    const count = fileBreakdown.get(result.filePath) || 0;
    fileBreakdown.set(result.filePath, count + 1);
  }

  return {
    totalMatches: results.length,
    fileCount: fileBreakdown.size,
    fileBreakdown,
  };
}

// =============================================================================
// Highlighted Text Generation
// =============================================================================

/**
 * Generate highlighted text with match markers
 */
export function getHighlightedText(
  text: string,
  highlights: HighlightRange[]
): Array<{ text: string; isHighlight: boolean }> {
  if (highlights.length === 0) {
    return [{ text, isHighlight: false }];
  }

  // Sort highlights by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const parts: Array<{ text: string; isHighlight: boolean }> = [];
  let lastEnd = 0;

  for (const highlight of sorted) {
    // Text before highlight
    if (highlight.start > lastEnd) {
      parts.push({
        text: text.slice(lastEnd, highlight.start),
        isHighlight: false,
      });
    }

    // Highlighted text
    parts.push({
      text: text.slice(highlight.start, highlight.end),
      isHighlight: true,
    });

    lastEnd = highlight.end;
  }

  // Text after last highlight
  if (lastEnd < text.length) {
    parts.push({
      text: text.slice(lastEnd),
      isHighlight: false,
    });
  }

  return parts;
}
