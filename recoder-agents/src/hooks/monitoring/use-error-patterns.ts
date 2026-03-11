'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  scanErrorPatterns,
  getErrorPatterns,
  getErrorPattern,
  updateErrorPattern,
  getErrorPatternStats,
  type ErrorPattern,
  type ErrorPatternStats,
  type ErrorPatternFilters,
  type UpdateErrorPatternData,
  type ScanResult,
} from '@/lib/api/error-patterns';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const errorPatternKeys = {
  all: ['error-patterns'] as const,
  list: (filters?: ErrorPatternFilters) => [...errorPatternKeys.all, 'list', filters] as const,
  detail: (id: string) => [...errorPatternKeys.all, 'detail', id] as const,
  stats: () => [...errorPatternKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Scan recent errors and detect patterns. Invalidates all pattern queries on success.
 */
export function useScanErrors() {
  const queryClient = useQueryClient();

  return useMutation<ScanResult, Error>({
    mutationFn: scanErrorPatterns,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: errorPatternKeys.all });
    },
  });
}

/**
 * Fetch error patterns with optional filters. Polls every 30 seconds.
 */
export function useErrorPatterns(filters?: ErrorPatternFilters, options?: { enabled?: boolean }) {
  return useQuery<ErrorPattern[]>({
    queryKey: errorPatternKeys.list(filters),
    queryFn: () => getErrorPatterns(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch a single error pattern by ID.
 */
export function useErrorPatternDetail(id: string | null, options?: { enabled?: boolean }) {
  return useQuery<ErrorPattern>({
    queryKey: errorPatternKeys.detail(id ?? ''),
    queryFn: () => getErrorPattern(id!),
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!id && options?.enabled !== false,
  });
}

/**
 * Update an error pattern. Invalidates list and detail on success.
 */
export function useUpdateErrorPattern() {
  const queryClient = useQueryClient();

  return useMutation<ErrorPattern, Error, { patternId: string; data: UpdateErrorPatternData }>({
    mutationFn: ({ patternId, data }) => updateErrorPattern(patternId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: errorPatternKeys.all });
      queryClient.invalidateQueries({
        queryKey: errorPatternKeys.detail(variables.patternId),
      });
    },
  });
}

/**
 * Fetch error pattern stats. Polls every 30 seconds.
 */
export function useErrorPatternStats(options?: { enabled?: boolean }) {
  return useQuery<ErrorPatternStats>({
    queryKey: errorPatternKeys.stats(),
    queryFn: getErrorPatternStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
