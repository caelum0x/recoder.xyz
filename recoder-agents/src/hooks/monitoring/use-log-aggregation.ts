'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ingestLog,
  ingestLogBatch,
  getAggregatedLogs,
  getLogStats,
  getTraceLogs,
  deleteOldLogs,
  getSavedFilters,
  createSavedFilter,
  deleteSavedFilter,
  type AggregatedLog,
  type LogStats,
  type LogSavedFilter,
  type IngestLogData,
  type BatchIngestData,
  type LogFilterConfig,
  type CreateSavedFilterData,
} from '@/lib/api/log-aggregation';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const logAggregationKeys = {
  all: ['log-aggregation'] as const,
  logs: (filters?: LogFilterConfig & { limit?: number; offset?: number }) =>
    [...logAggregationKeys.all, 'logs', filters] as const,
  stats: () => [...logAggregationKeys.all, 'stats'] as const,
  trace: (traceId: string) => [...logAggregationKeys.all, 'trace', traceId] as const,
  savedFilters: () => [...logAggregationKeys.all, 'saved-filters'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Ingest a single log entry.
 */
export function useIngestLog() {
  const queryClient = useQueryClient();
  return useMutation<AggregatedLog, Error, IngestLogData>({
    mutationFn: ingestLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logAggregationKeys.all });
    },
  });
}

/**
 * Ingest multiple log entries in a single batch call.
 */
export function useIngestLogBatch() {
  const queryClient = useQueryClient();
  return useMutation<{ inserted: number; errors: string[] }, Error, BatchIngestData>({
    mutationFn: ingestLogBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logAggregationKeys.all });
    },
  });
}

/**
 * Query aggregated logs with optional filters.
 */
export function useAggregatedLogs(
  filters?: LogFilterConfig & { limit?: number; offset?: number }
) {
  return useQuery<AggregatedLog[]>({
    queryKey: logAggregationKeys.logs(filters),
    queryFn: () => getAggregatedLogs(filters),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}

/**
 * Get log statistics (counts by level, agent, source, top tags, hourly volume).
 */
export function useLogStats() {
  return useQuery<LogStats>({
    queryKey: logAggregationKeys.stats(),
    queryFn: getLogStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: 'always',
  });
}

/**
 * Get all logs for a specific trace ID.
 */
export function useTraceLogs(traceId: string | null) {
  return useQuery<AggregatedLog[]>({
    queryKey: logAggregationKeys.trace(traceId ?? ''),
    queryFn: () => getTraceLogs(traceId!),
    enabled: Boolean(traceId),
    staleTime: 30_000,
  });
}

/**
 * Delete logs older than N days.
 */
export function useDeleteOldLogs() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: boolean; days: number }, Error, number>({
    mutationFn: deleteOldLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logAggregationKeys.all });
    },
  });
}

/**
 * List saved filter configurations.
 */
export function useSavedFilters() {
  return useQuery<LogSavedFilter[]>({
    queryKey: logAggregationKeys.savedFilters(),
    queryFn: getSavedFilters,
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
}

/**
 * Save a new filter configuration.
 */
export function useCreateSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation<LogSavedFilter, Error, CreateSavedFilterData>({
    mutationFn: createSavedFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logAggregationKeys.savedFilters() });
    },
  });
}

/**
 * Delete a saved filter by ID.
 */
export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteSavedFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logAggregationKeys.savedFilters() });
    },
  });
}

export type {
  AggregatedLog,
  LogStats,
  LogSavedFilter,
  IngestLogData,
  BatchIngestData,
  LogFilterConfig,
  CreateSavedFilterData,
};
