'use client';

import { useQuery } from '@tanstack/react-query';
import { globalSearch, type SearchResponse } from '@/lib/api/search';

export function useGlobalSearch(query: string, types?: string[]) {
  return useQuery<SearchResponse>({
    queryKey: ['global-search', query, types],
    queryFn: () => globalSearch(query, types),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });
}
