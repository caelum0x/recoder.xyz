'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createMetricDefinition,
  getMetricDefinitions,
  updateMetricDefinition,
  deleteMetricDefinition,
  recordMetricValue,
  getMetricValues,
  getMetricAggregate,
  getMetricsDashboard,
  type MetricDefinition,
  type MetricValue,
  type MetricAggregate,
  type MetricDashboardItem,
  type CreateMetricDefData,
  type UpdateMetricDefData,
  type RecordValueData,
} from '@/lib/api/custom-metrics';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const customMetricsKeys = {
  all: ['custom-metrics'] as const,
  definitions: () => [...customMetricsKeys.all, 'definitions'] as const,
  values: (metricId: string, hours?: number) =>
    [...customMetricsKeys.all, 'values', metricId, hours] as const,
  aggregate: (metricId: string) =>
    [...customMetricsKeys.all, 'aggregate', metricId] as const,
  dashboard: () => [...customMetricsKeys.all, 'dashboard'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch all metric definitions for the current user.
 */
export function useMetricDefinitions() {
  return useQuery<MetricDefinition[]>({
    queryKey: customMetricsKeys.definitions(),
    queryFn: getMetricDefinitions,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/**
 * Create a new metric definition.
 */
export function useCreateMetricDef() {
  const queryClient = useQueryClient();
  return useMutation<MetricDefinition, Error, CreateMetricDefData>({
    mutationFn: createMetricDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.definitions() });
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.dashboard() });
    },
  });
}

/**
 * Update an existing metric definition.
 */
export function useUpdateMetricDef() {
  const queryClient = useQueryClient();
  return useMutation<MetricDefinition, Error, { metricId: string; data: UpdateMetricDefData }>({
    mutationFn: ({ metricId, data }) => updateMetricDefinition(metricId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.definitions() });
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.dashboard() });
    },
  });
}

/**
 * Delete a metric definition (cascades to values).
 */
export function useDeleteMetricDef() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteMetricDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.definitions() });
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.dashboard() });
    },
  });
}

/**
 * Record a new value for a metric.
 */
export function useRecordMetricValue() {
  const queryClient = useQueryClient();
  return useMutation<MetricValue, Error, { metricId: string; data: RecordValueData }>({
    mutationFn: ({ metricId, data }) => recordMetricValue(metricId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: customMetricsKeys.values(variables.metricId),
      });
      queryClient.invalidateQueries({
        queryKey: customMetricsKeys.aggregate(variables.metricId),
      });
      queryClient.invalidateQueries({ queryKey: customMetricsKeys.dashboard() });
    },
  });
}

/**
 * Fetch values for a specific metric.
 */
export function useMetricValues(metricId: string, hours: number = 24) {
  return useQuery<MetricValue[]>({
    queryKey: customMetricsKeys.values(metricId, hours),
    queryFn: () => getMetricValues(metricId, hours),
    enabled: Boolean(metricId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/**
 * Fetch aggregate stats for a metric.
 */
export function useMetricAggregate(metricId: string) {
  return useQuery<MetricAggregate>({
    queryKey: customMetricsKeys.aggregate(metricId),
    queryFn: () => getMetricAggregate(metricId),
    enabled: Boolean(metricId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/**
 * Fetch the metrics dashboard (all metrics with latest values).
 */
export function useMetricsDashboard() {
  return useQuery<MetricDashboardItem[]>({
    queryKey: customMetricsKeys.dashboard(),
    queryFn: getMetricsDashboard,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
}

export type {
  MetricDefinition,
  MetricValue,
  MetricAggregate,
  MetricDashboardItem,
  CreateMetricDefData,
  UpdateMetricDefData,
  RecordValueData,
};
