/**
 * Agentic File Search Executor
 * Executes search plans to find exact code locations before editing
 *
 * This enables LLM-driven search planning before edits:
 * 1. Executes search plans to find code locations before editing
 * 2. Supports both simple terms and regex patterns
 * 3. Returns results with line numbers and context
 * 4. Fallback search strategies if primary search fails
 */

/**
 * Represents a single search result with location and context
 */
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileSearchExecutor');

export interface SearchResult {
  /** Path to the file containing the match */
  filePath: string;
  /** Line number where the match was found (1-indexed) */
  lineNumber: number;
  /** The content of the matching line (trimmed) */
  lineContent: string;
  /** The search term that matched, if applicable */
  matchedTerm?: string;
  /** The regex pattern that matched, if applicable */
  matchedPattern?: string;
  /** Lines before the match for context */
  contextBefore: string[];
  /** Lines after the match for context */
  contextAfter: string[];
  /** Confidence level of the match */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Search plan configuration from the LLM
 */
export interface SearchPlan {
  /** Type of edit being planned (e.g., 'UPDATE_STYLE', 'REMOVE_ELEMENT', 'ADD_FEATURE') */
  editType: string;
  /** LLM's reasoning for the search strategy */
  reasoning: string;
  /** Simple search terms to look for (case-insensitive) */
  searchTerms: string[];
  /** Regex patterns to match against (optional) */
  regexPatterns?: string[];
  /** File extensions to search (e.g., ['.jsx', '.tsx']) */
  fileTypesToSearch?: string[];
  /** Expected number of matches (for validation) */
  expectedMatches?: number;
  /** Fallback search strategy if primary search fails */
  fallbackSearch?: {
    terms: string[];
    patterns?: string[];
  };
}

/**
 * Result of executing a search plan
 */
export interface SearchExecutionResult {
  /** Whether the search found any results */
  success: boolean;
  /** All search results found */
  results: SearchResult[];
  /** Number of files that were searched */
  filesSearched: number;
  /** Time taken to execute the search in milliseconds */
  executionTime: number;
  /** Whether the fallback search strategy was used */
  usedFallback: boolean;
  /** Error message if search failed */
  error?: string;
}

/**
 * Number of context lines to include before and after a match
 */
const CONTEXT_LINES = 3;

/**
 * Default file extensions to search if not specified
 */
const DEFAULT_FILE_EXTENSIONS = ['.jsx', '.tsx', '.js', '.ts', '.css', '.scss', '.html', '.vue', '.svelte'];

/**
 * Execute a search plan against the codebase
 *
 * @param searchPlan - The search plan configuration from the LLM
 * @param files - Map of file paths to file contents
 * @returns Search execution result with all matches
 */
export function executeSearchPlan(
  searchPlan: SearchPlan,
  files: Record<string, string>
): SearchExecutionResult {
  const startTime = Date.now();
  const results: SearchResult[] = [];
  let filesSearched = 0;
  let usedFallback = false;

  const {
    searchTerms = [],
    regexPatterns = [],
    fileTypesToSearch = DEFAULT_FILE_EXTENSIONS,
    fallbackSearch,
  } = searchPlan;

  /**
   * Helper function to perform search with given terms and patterns
   */
  const performSearch = (terms: string[], patterns?: string[]): SearchResult[] => {
    const searchResults: SearchResult[] = [];

    for (const [filePath, content] of Object.entries(files)) {
      // Skip files that don't match the desired extensions
      const shouldSearch = fileTypesToSearch.some(ext => filePath.endsWith(ext));
      if (!shouldSearch) continue;

      filesSearched++;
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let matched = false;
        let matchedTerm: string | undefined;
        let matchedPattern: string | undefined;

        // Check simple search terms (case-insensitive)
        for (const term of terms) {
          if (line.toLowerCase().includes(term.toLowerCase())) {
            matched = true;
            matchedTerm = term;
            break;
          }
        }

        // Check regex patterns if no term match
        if (!matched && patterns) {
          for (const pattern of patterns) {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(line)) {
                matched = true;
                matchedPattern = pattern;
                break;
              }
            } catch (e) {
              logger.warn(`[file-search] Invalid regex pattern: ${pattern}`, e);
            }
          }
        }

        if (matched) {
          // Get context lines (CONTEXT_LINES before, CONTEXT_LINES after)
          const contextBefore = lines.slice(Math.max(0, i - CONTEXT_LINES), i);
          const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + CONTEXT_LINES + 1));

          // Determine confidence based on match type and context
          const confidence = determineConfidence(line, matchedTerm, matchedPattern);

          searchResults.push({
            filePath,
            lineNumber: i + 1, // Convert to 1-indexed
            lineContent: line.trim(),
            matchedTerm,
            matchedPattern,
            contextBefore,
            contextAfter,
            confidence,
          });
        }
      }
    }

    return searchResults;
  };

  // Execute primary search
  results.push(...performSearch(searchTerms, regexPatterns));

  // If no results and we have a fallback, try it
  if (results.length === 0 && fallbackSearch) {
    logger.info('[file-search] No results from primary search, trying fallback...');
    usedFallback = true;
    results.push(...performSearch(fallbackSearch.terms, fallbackSearch.patterns));
  }

  const executionTime = Date.now() - startTime;

  // Sort results by confidence (high first, then medium, then low)
  results.sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });

  return {
    success: results.length > 0,
    results,
    filesSearched,
    executionTime,
    usedFallback,
    error: results.length === 0 ? 'No matches found for search terms' : undefined,
  };
}

/**
 * Determine the confidence level of a match based on context
 */
function determineConfidence(
  line: string,
  matchedTerm?: string,
  matchedPattern?: string
): 'high' | 'medium' | 'low' {
  // High confidence if it's an exact term match (not just a substring of a word)
  if (matchedTerm && line.includes(matchedTerm)) {
    // Check if it's a whole word match or at a word boundary
    const regex = new RegExp(`\\b${escapeRegExp(matchedTerm)}\\b`, 'i');
    if (regex.test(line)) {
      return 'high';
    }
  }

  // High confidence for structural code elements
  if (
    line.includes('function') ||
    line.includes('export') ||
    line.includes('return') ||
    line.includes('const') ||
    line.includes('class') ||
    line.includes('interface') ||
    line.includes('type')
  ) {
    return 'high';
  }

  // Medium confidence for pattern matches
  if (matchedPattern) {
    return 'medium';
  }

  // Low confidence for other matches
  return 'low';
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format search results for AI consumption
 * Creates a structured text representation that the LLM can use to understand
 * where to make edits
 *
 * @param results - Array of search results to format
 * @returns Formatted string representation of the results
 */
export function formatSearchResultsForAI(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found.';
  }

  const sections: string[] = [];

  sections.push('SEARCH RESULTS - EXACT LOCATIONS FOUND:\n');

  // Group results by file for better readability
  const resultsByFile: Record<string, SearchResult[]> = {};
  for (const result of results) {
    if (!resultsByFile[result.filePath]) {
      resultsByFile[result.filePath] = [];
    }
    resultsByFile[result.filePath].push(result);
  }

  for (const filePath of Object.keys(resultsByFile)) {
    const fileResults = resultsByFile[filePath];
    sections.push(`\nFILE: ${filePath}`);

    for (const result of fileResults) {
      sections.push(`\n  Line ${result.lineNumber} (${result.confidence} confidence)`);

      if (result.matchedTerm) {
        sections.push(`     Matched: "${result.matchedTerm}"`);
      } else if (result.matchedPattern) {
        sections.push(`     Pattern: ${result.matchedPattern}`);
      }

      sections.push(`     Code: ${result.lineContent}`);

      if (result.contextBefore.length > 0 || result.contextAfter.length > 0) {
        sections.push(`     Context:`);
        for (const line of result.contextBefore) {
          sections.push(`       ${line}`);
        }
        sections.push(`     > ${result.lineContent}`);
        for (const line of result.contextAfter) {
          sections.push(`       ${line}`);
        }
      }
    }
  }

  sections.push('\n\nRECOMMENDED ACTION:');

  // Recommend the highest confidence result
  const bestResult = results[0];
  sections.push(`Edit ${bestResult.filePath} at line ${bestResult.lineNumber}`);

  return sections.join('\n');
}

/**
 * Select the best file to edit based on search results and edit type
 *
 * @param results - Array of search results
 * @param editType - Type of edit being performed
 * @returns Target file information or null if no suitable file found
 */
export function selectTargetFile(
  results: SearchResult[],
  editType: string
): { filePath: string; lineNumber: number; reason: string } | null {
  if (results.length === 0) return null;

  // For style updates, prefer components over CSS files
  if (editType === 'UPDATE_STYLE') {
    const componentResult = results.find(
      (r) => r.filePath.endsWith('.jsx') || r.filePath.endsWith('.tsx')
    );
    if (componentResult) {
      return {
        filePath: componentResult.filePath,
        lineNumber: componentResult.lineNumber,
        reason: 'Found component with style to update',
      };
    }
  }

  // For remove operations, find the component that renders the element
  if (editType === 'REMOVE_ELEMENT') {
    const renderResult = results.find(
      (r) => r.lineContent.includes('return') || r.lineContent.includes('<')
    );
    if (renderResult) {
      return {
        filePath: renderResult.filePath,
        lineNumber: renderResult.lineNumber,
        reason: 'Found element to remove in render output',
      };
    }
  }

  // For add operations, find a suitable insertion point
  if (editType === 'ADD_FEATURE' || editType === 'ADD_ELEMENT') {
    const insertResult = results.find(
      (r) =>
        r.lineContent.includes('return') ||
        r.lineContent.includes('export') ||
        r.confidence === 'high'
    );
    if (insertResult) {
      return {
        filePath: insertResult.filePath,
        lineNumber: insertResult.lineNumber,
        reason: 'Found suitable insertion point for new code',
      };
    }
  }

  // For refactoring, prefer files with function/class definitions
  if (editType === 'REFACTOR') {
    const definitionResult = results.find(
      (r) =>
        r.lineContent.includes('function') ||
        r.lineContent.includes('class') ||
        r.lineContent.includes('const')
    );
    if (definitionResult) {
      return {
        filePath: definitionResult.filePath,
        lineNumber: definitionResult.lineNumber,
        reason: 'Found definition to refactor',
      };
    }
  }

  // Default: use highest confidence result
  const best = results[0];
  return {
    filePath: best.filePath,
    lineNumber: best.lineNumber,
    reason: `Highest confidence match (${best.confidence})`,
  };
}

/**
 * Create a search plan from a natural language description
 * This is a helper for quickly creating search plans
 *
 * @param editType - Type of edit (e.g., 'UPDATE_STYLE', 'ADD_FEATURE')
 * @param searchTerms - Simple search terms
 * @param options - Additional options
 * @returns A configured SearchPlan
 */
export function createSearchPlan(
  editType: string,
  searchTerms: string[],
  options?: {
    regexPatterns?: string[];
    fileTypes?: string[];
    fallbackTerms?: string[];
    reasoning?: string;
  }
): SearchPlan {
  return {
    editType,
    reasoning: options?.reasoning || `Searching for ${searchTerms.join(', ')}`,
    searchTerms,
    regexPatterns: options?.regexPatterns,
    fileTypesToSearch: options?.fileTypes || DEFAULT_FILE_EXTENSIONS,
    fallbackSearch: options?.fallbackTerms
      ? { terms: options.fallbackTerms, patterns: options?.regexPatterns }
      : undefined,
  };
}

/**
 * Search for a specific function or component definition
 *
 * @param name - Name of the function or component
 * @param files - Map of file paths to contents
 * @returns Search results for the definition
 */
export function searchForDefinition(
  name: string,
  files: Record<string, string>
): SearchExecutionResult {
  const plan = createSearchPlan('FIND_DEFINITION', [name], {
    regexPatterns: [
      `function\\s+${name}`,
      `const\\s+${name}\\s*=`,
      `class\\s+${name}`,
      `export\\s+(default\\s+)?function\\s+${name}`,
      `export\\s+const\\s+${name}`,
    ],
    reasoning: `Looking for definition of ${name}`,
  });

  return executeSearchPlan(plan, files);
}

/**
 * Search for all usages of a function, component, or variable
 *
 * @param name - Name to search for
 * @param files - Map of file paths to contents
 * @returns Search results for all usages
 */
export function searchForUsages(
  name: string,
  files: Record<string, string>
): SearchExecutionResult {
  const plan = createSearchPlan('FIND_USAGES', [name], {
    regexPatterns: [
      `<${name}[\\s/>]`,
      `${name}\\(`,
      `${name}\\.`,
      `import.*${name}`,
    ],
    reasoning: `Looking for all usages of ${name}`,
  });

  return executeSearchPlan(plan, files);
}

/**
 * Search for imports of a specific module or package
 *
 * @param moduleName - Name of the module to find imports for
 * @param files - Map of file paths to contents
 * @returns Search results for import statements
 */
export function searchForImports(
  moduleName: string,
  files: Record<string, string>
): SearchExecutionResult {
  const plan = createSearchPlan('FIND_IMPORTS', [], {
    regexPatterns: [
      `import\\s+.*from\\s+['"]${moduleName}['"]`,
      `import\\s+['"]${moduleName}['"]`,
      `require\\(['"]${moduleName}['"]\\)`,
    ],
    fileTypes: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    reasoning: `Looking for imports of ${moduleName}`,
  });

  return executeSearchPlan(plan, files);
}

/**
 * Get a summary of search execution for logging
 *
 * @param result - Search execution result
 * @returns Summary string
 */
export function getSearchSummary(result: SearchExecutionResult): string {
  if (!result.success) {
    return `Search failed: ${result.error || 'No matches found'}`;
  }

  const fileCount = new Set(result.results.map((r) => r.filePath)).size;
  const highConfidence = result.results.filter((r) => r.confidence === 'high').length;
  const mediumConfidence = result.results.filter((r) => r.confidence === 'medium').length;

  return [
    `Found ${result.results.length} matches in ${fileCount} files`,
    `(${highConfidence} high, ${mediumConfidence} medium confidence)`,
    `Searched ${result.filesSearched} files in ${result.executionTime}ms`,
    result.usedFallback ? '(used fallback search)' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
