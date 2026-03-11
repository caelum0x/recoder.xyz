'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAnomalies,
  updateAnomalyStatus,
  runAnomalyScan,
  getAnomalyStats,
  type Anomaly,
  type AnomalyStats,
  type AnomalyFilters,
  type AnomalyScanResult,
} from '@/lib/api/anomaly-detection';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const anomalyKeys = {
  all: ['anomalies'] as const,
  list: (filters?: AnomalyFilters) => [...anomalyKeys.all, 'list', filters] as const,
  stats: () => [...anomalyKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch anomalies with optional filters. Polls every 30 seconds.
 */
export function useAnomalies(filters?: AnomalyFilters, options?: { enabled?: boolean }) {
  return useQuery<Anomaly[]>({
    queryKey: anomalyKeys.list(filters),
    queryFn: () => getAnomalies(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Update an anomaly's status (acknowledge, resolve, dismiss).
 * Invalidates list and stats on success.
 */
export function useUpdateAnomalyStatus() {
  const queryClient = useQueryClient();

  return useMutation<Anomaly, Error, { anomalyId: string; status: string }>({
    mutationFn: ({ anomalyId, status }) => updateAnomalyStatus(anomalyId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyKeys.all });
    },
  });
}

/**
 * Run an anomaly scan. Invalidates list and stats on success.
 */
export function useRunAnomalyScan() {
  const queryClient = useQueryClient();

  return useMutation<AnomalyScanResult, Error>({
    mutationFn: runAnomalyScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyKeys.all });
    },
  });
}

/**
 * Fetch anomaly stats. Polls every 30 seconds.
 */
export function useAnomalyStats(options?: { enabled?: boolean }) {
  return useQuery<AnomalyStats>({
    queryKey: anomalyKeys.stats(),
    queryFn: getAnomalyStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
