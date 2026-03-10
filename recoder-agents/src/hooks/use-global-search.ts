'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  indexedSearch,
  reindexSearch,
  searchSuggestions,
  type IndexedSearchResponse,
  type SuggestionsResponse,
  type ReindexResponse,
} from '@/lib/api/global-search';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const globalSearchKeys = {
  all: ['global-search'] as const,
  search: (query: string, resourceType?: string) =>
    [...globalSearchKeys.all, 'search', query, resourceType] as const,
  suggestions: (query: string) =>
    [...globalSearchKeys.all, 'suggestions', query] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Search the global index with debounced ILIKE matching.
 * Only fires when query has 2+ characters.
 */
export function useIndexedSearch(query: string, resourceType?: string) {
  return useQuery<IndexedSearchResponse>({
    queryKey: globalSearchKeys.search(query, resourceType),
    queryFn: () => indexedSearch(query, resourceType),
    enabled: query.length >= 2,
    staleTime: 15_000,
    gcTime: 60_000,
  });
}

/**
 * Autocomplete suggestions matching title prefix.
 * Only fires when query has 1+ characters.
 */
export function useSearchSuggestions(query: string) {
  return useQuery<SuggestionsResponse>({
    queryKey: globalSearchKeys.suggestions(query),
    queryFn: () => searchSuggestions(query),
    enabled: query.length >= 1,
    staleTime: 10_000,
  });
}

/**
 * Mutation to rebuild the search index from source tables.
 * Invalidates search queries on success.
 */
export function useReindex() {
  const queryClient = useQueryClient();

  return useMutation<ReindexResponse>({
    mutationFn: reindexSearch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: globalSearchKeys.all });
    },
  });
}
