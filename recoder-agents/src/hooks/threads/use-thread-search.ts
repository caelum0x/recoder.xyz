import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { searchThreads, ThreadSearchResponse } from '@/lib/api/threads';
import { threadKeys } from './keys';
import { toast } from '@/lib/toast';
import {
  searchThreadsIndex,
  indexThreadForSearch,
  indexThreadsBatch,
  removeFromIndex,
  getSearchHistoryV2,
  getSearchStats,
  type SearchFilters,
  type IndexThreadData,
} from '@/lib/api/thread-search';

const DEBOUNCE_DELAY = 400; // ms
const MIN_QUERY_LENGTH = 2;

/**
 * Hook for semantic thread search with debouncing.
 *
 * @param query - The search query text
 * @param limit - Maximum number of results (default: 10)
 * @returns Object containing search data, loading states, and configuration status
 */
export const useThreadSearch = (query: string, limit: number = 10) => {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the query
  useEffect(() => {
    // Don't debounce if query is too short - immediately clear
    if (query.length < MIN_QUERY_LENGTH) {
      setDebouncedQuery('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [query]);

  // Only run the query when we have a debounced query
  const shouldSearch = debouncedQuery.length >= MIN_QUERY_LENGTH;

  const {
    data,
    isLoading: isQueryLoading,
    isFetching,
    error,
  } = useQuery<ThreadSearchResponse>({
    queryKey: [...threadKeys.lists(), 'search', debouncedQuery, limit],
    queryFn: () => searchThreads(debouncedQuery, limit),
    enabled: shouldSearch,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Compute loading state:
  // - isSearching: true when we're actively searching (debounce wait or fetching)
  // - isLoading: true when waiting for initial data
  const isDebouncing = query.length >= MIN_QUERY_LENGTH && query !== debouncedQuery;
  const isSearching = isDebouncing || isFetching;
  const isLoading = shouldSearch && isQueryLoading;

  // Return results
  const results = useMemo(() => {
    if (!shouldSearch || !data) {
      return [];
    }
    return data.results || [];
  }, [shouldSearch, data]);

  return {
    results,
    total: data?.total || 0,
    isLoading,
    isSearching,
    isConfigured: data?.configured ?? true, // Assume configured if no data yet
    error,
    query: debouncedQuery,
    shouldSearch,
  };
};

// ============================================================================
// Sprint 72 Phase 2 — Thread Search Index Hooks
// ============================================================================

export function useSearchThreads(filters: SearchFilters) {
  return useQuery({
    queryKey: ['thread-search-index', filters],
    queryFn: () => searchThreadsIndex(filters),
    staleTime: 20000,
    enabled: true,
  });
}

export function useIndexThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: IndexThreadData) => indexThreadForSearch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread-search-index'] });
      queryClient.invalidateQueries({ queryKey: ['thread-search-stats'] });
      toast.success('Thread indexed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to index thread');
    },
  });
}

export function useBatchIndex() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threads: IndexThreadData[]) => indexThreadsBatch(threads),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['thread-search-index'] });
      queryClient.invalidateQueries({ queryKey: ['thread-search-stats'] });
      toast.success(`Indexed ${result.indexed} thread(s)`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to batch index threads');
    },
  });
}

export function useRemoveFromIndex() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) => removeFromIndex(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread-search-index'] });
      queryClient.invalidateQueries({ queryKey: ['thread-search-stats'] });
      toast.success('Thread removed from index');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove thread from index');
    },
  });
}

export function useSearchHistory(limit?: number) {
  return useQuery({
    queryKey: ['thread-search-history', limit],
    queryFn: () => getSearchHistoryV2(limit),
    staleTime: 15000,
  });
}

export function useClearSearchHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { clearSearchHistory } = await import('@/lib/api/thread-search');
      return clearSearchHistory();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread-search-history'] });
      toast.success('Search history cleared');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to clear search history');
    },
  });
}

export function useSearchStats() {
  return useQuery({
    queryKey: ['thread-search-stats'],
    queryFn: getSearchStats,
    staleTime: 60000,
  });
}
