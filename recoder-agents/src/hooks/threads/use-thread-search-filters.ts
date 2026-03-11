import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/lib/toast';
import {
  searchThreadsFiltered,
  indexThread,
  getSearchHistory,
  getSearchSuggestions,
  clearSearchHistory,
  type ThreadSearchFilters,
  type ThreadSearchResponse,
  type ThreadSearchIndexEntry,
  type SearchHistoryEntry,
  type SearchSuggestions,
  type IndexThreadRequest,
} from '@/lib/api/thread-search';

// ============================================================================
// Query Keys
// ============================================================================

export const threadSearchKeys = {
  all: ['thread-search'] as const,
  search: (filters: ThreadSearchFilters) => [...threadSearchKeys.all, 'results', filters] as const,
  history: () => [...threadSearchKeys.all, 'history'] as const,
  suggestions: () => [...threadSearchKeys.all, 'suggestions'] as const,
};

// ============================================================================
// Hooks
// ============================================================================

const DEBOUNCE_DELAY = 300;

export const useSearchThreads = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ThreadSearchFilters>({
    sort_by: 'recent',
    limit: 20,
    offset: 0,
  });
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the query text
  useEffect(() => {
    if (!filters.query || filters.query.length === 0) {
      setDebouncedQuery('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(filters.query || '');
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [filters.query]);

  const effectiveFilters: ThreadSearchFilters = {
    ...filters,
    query: debouncedQuery || undefined,
  };

  const hasActiveFilters = !!(
    debouncedQuery ||
    filters.agent_id ||
    filters.has_tool_calls !== undefined ||
    filters.has_errors !== undefined ||
    (filters.tags && filters.tags.length > 0) ||
    filters.date_from ||
    filters.date_to
  );

  const queryResult = useQuery<ThreadSearchResponse>({
    queryKey: threadSearchKeys.search(effectiveFilters),
    queryFn: () => searchThreadsFiltered(effectiveFilters),
    enabled: hasActiveFilters,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });

  const updateFilters = useCallback((update: Partial<ThreadSearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ sort_by: 'recent', limit: 20, offset: 0 });
    setDebouncedQuery('');
  }, []);

  const isDebouncing = !!(filters.query && filters.query !== debouncedQuery);

  return {
    ...queryResult,
    filters,
    updateFilters,
    resetFilters,
    hasActiveFilters,
    isDebouncing,
  };
};

export const useIndexThread = () => {
  const queryClient = useQueryClient();

  return useMutation<ThreadSearchIndexEntry, Error, { threadId: string; data: IndexThreadRequest }>({
    mutationFn: ({ threadId, data }) => indexThread(threadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadSearchKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to index thread');
    },
  });
};

export const useSearchHistory = (limit = 10) => {
  return useQuery<{ history: SearchHistoryEntry[] }>({
    queryKey: threadSearchKeys.history(),
    queryFn: () => getSearchHistory(limit),
    staleTime: 30000,
  });
};

export const useSearchSuggestions = () => {
  return useQuery<SearchSuggestions>({
    queryKey: threadSearchKeys.suggestions(),
    queryFn: () => getSearchSuggestions(),
    staleTime: 60000,
  });
};

export const useClearSearchHistory = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error>({
    mutationFn: () => clearSearchHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadSearchKeys.history() });
      toast.success('Search history cleared');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to clear search history');
    },
  });
};

export type {
  ThreadSearchFilters,
  ThreadSearchResponse,
  ThreadSearchIndexEntry,
  SearchHistoryEntry,
  SearchSuggestions,
};
