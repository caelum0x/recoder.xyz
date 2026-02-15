/**
 * useSearch - Hook for searching across project files
 * Uses the docker-backend search API powered by ripgrep
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SearchHook');

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchOptions {
  /** Use regular expression */
  regex?: boolean;
  /** Match case exactly */
  caseSensitive?: boolean;
  /** Match whole words only */
  wholeWord?: boolean;
  /** Glob pattern for files to include (e.g., "*.ts") */
  include?: string;
  /** Glob pattern for files to exclude (e.g., "node_modules") */
  exclude?: string;
  /** Maximum number of results */
  maxResults?: number;
}

export interface UseSearchOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Minimum query length to trigger search (default: 2) */
  minQueryLength?: number;
  /** Default search options */
  defaultOptions?: SearchOptions;
}

export interface UseSearchReturn {
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Search results */
  results: SearchResult[];
  /** Results grouped by file */
  resultsByFile: Record<string, SearchResult[]>;
  /** Total result count */
  totalCount: number;
  /** Number of files with matches */
  fileCount: number;
  /** Is currently searching */
  isSearching: boolean;
  /** Search options */
  options: SearchOptions;
  /** Update search options */
  setOptions: (options: Partial<SearchOptions>) => void;
  /** Manually trigger search */
  search: (query?: string, options?: SearchOptions) => Promise<SearchResult[]>;
  /** Replace text in specified files */
  replaceInFiles: (searchQuery: string, replaceText: string, files: string[]) => Promise<{ success: boolean; filesModified: number }>;
  /** Replace in all files with matches */
  replaceAll: (searchQuery: string, replaceText: string) => Promise<{ success: boolean; filesModified: number }>;
  /** Clear results */
  clearResults: () => void;
  /** Whether search is available (container ready) */
  isAvailable: boolean;
}

/**
 * Hook for searching across project files
 *
 * @example
 * ```tsx
 * const { query, setQuery, results, isSearching, options, setOptions } = useSearch();
 *
 * // Search automatically debounces
 * setQuery('function');
 *
 * // Or search manually
 * const results = await search('class', { regex: true });
 *
 * // Replace in files
 * await replaceAll('oldName', 'newName');
 * ```
 */
export function useSearch(hookOptions: UseSearchOptions = {}): UseSearchReturn {
  const {
    debounceMs = 300,
    minQueryLength = 2,
    defaultOptions = {
      regex: false,
      caseSensitive: false,
      wholeWord: false,
      include: '',
      exclude: 'node_modules,dist,.git',
    },
  } = hookOptions;

  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [options, setOptionsState] = useState<SearchOptions>(defaultOptions);

  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  // Compute derived values
  const resultsByFile = results.reduce((acc, result) => {
    if (!acc[result.file]) acc[result.file] = [];
    acc[result.file].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const totalCount = results.length;
  const fileCount = Object.keys(resultsByFile).length;
  const isAvailable = !!projectId && containerReady;

  /**
   * Execute search against the backend
   */
  const executeSearch = useCallback(async (
    searchQuery: string,
    searchOptions: SearchOptions
  ): Promise<SearchResult[]> => {
    if (!projectId || !containerReady) {
      return [];
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    try {
      const data = await dockerPost<{ results?: SearchResult[]; total?: number }>(
        `/api/search/${projectId}`,
        { query: searchQuery, options: searchOptions }
      );
      const searchResults = data.results || [];
      setResults(searchResults);
      return searchResults;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        logger.error('[useSearch] Search error:', error);
      }
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [projectId, containerReady]);

  /**
   * Public search method
   */
  const search = useCallback(async (
    searchQuery?: string,
    searchOptions?: SearchOptions
  ): Promise<SearchResult[]> => {
    const q = searchQuery ?? query;
    const opts = searchOptions ?? options;

    if (!q.trim() || q.length < minQueryLength) {
      setResults([]);
      return [];
    }

    return executeSearch(q, opts);
  }, [query, options, minQueryLength, executeSearch]);

  /**
   * Set query with debounced auto-search
   */
  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    if (newQuery.length >= minQueryLength) {
      searchTimeoutRef.current = setTimeout(() => {
        executeSearch(newQuery, options);
      }, debounceMs);
    } else {
      setResults([]);
    }
  }, [minQueryLength, debounceMs, options, executeSearch]);

  /**
   * Update search options
   */
  const setOptions = useCallback((newOptions: Partial<SearchOptions>) => {
    setOptionsState(prev => {
      const updated = { ...prev, ...newOptions };
      // Re-run search if query exists
      if (query.length >= minQueryLength) {
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
        searchTimeoutRef.current = setTimeout(() => {
          executeSearch(query, updated);
        }, debounceMs);
      }
      return updated;
    });
  }, [query, minQueryLength, debounceMs, executeSearch]);

  /**
   * Replace text in specified files
   */
  const replaceInFiles = useCallback(async (
    searchQuery: string,
    replaceText: string,
    files: string[]
  ): Promise<{ success: boolean; filesModified: number }> => {
    if (!projectId || !containerReady) {
      return { success: false, filesModified: 0 };
    }

    try {
      const result = await dockerPost<{ success: boolean; filesModified: number }>(
        `/api/replace/${projectId}`,
        { searchQuery, replaceText, files }
      );

      // Re-run search to update results
      if (query.length >= minQueryLength) {
        await executeSearch(query, options);
      }

      return result;
    } catch (error) {
      logger.error('[useSearch] Replace error:', error);
      return { success: false, filesModified: 0 };
    }
  }, [projectId, containerReady, query, minQueryLength, options, executeSearch]);

  /**
   * Replace in all files with current matches
   */
  const replaceAll = useCallback(async (
    searchQuery: string,
    replaceText: string
  ): Promise<{ success: boolean; filesModified: number }> => {
    const files = Object.keys(resultsByFile).map(f => `/workspace/${f}`);
    if (files.length === 0) {
      return { success: true, filesModified: 0 };
    }
    return replaceInFiles(searchQuery, replaceText, files);
  }, [resultsByFile, replaceInFiles]);

  /**
   * Clear results
   */
  const clearResults = useCallback(() => {
    setResults([]);
    setQueryState('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    resultsByFile,
    totalCount,
    fileCount,
    isSearching,
    options,
    setOptions,
    search,
    replaceInFiles,
    replaceAll,
    clearResults,
    isAvailable,
  };
}
