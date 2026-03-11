'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recordSnapshot,
  getResourceSnapshots,
  getCurrentResources,
  getResourceHistory,
  createAlertRule,
  getAlertRules,
  updateAlertRule,
  deleteAlertRule,
  checkAlerts,
  type RecordSnapshotData,
  type SnapshotFilters,
  type CreateAlertRuleData,
  type UpdateAlertRuleData,
  type ResourceSnapshot,
  type ResourceHistoryBucket,
  type ResourceAlertRule,
  type CheckAlertsResponse,
} from '@/lib/api/resource-monitoring';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const resourceMonitoringKeys = {
  all: ['resource-monitoring'] as const,
  snapshots: (filters?: SnapshotFilters) =>
    [...resourceMonitoringKeys.all, 'snapshots', filters] as const,
  current: () => [...resourceMonitoringKeys.all, 'current'] as const,
  history: (agentId?: string, minutes?: number) =>
    [...resourceMonitoringKeys.all, 'history', agentId, minutes] as const,
  alertRules: () => [...resourceMonitoringKeys.all, 'alert-rules'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Record a resource snapshot. Invalidates snapshot/current queries on success.
 */
export function useRecordSnapshot() {
  const queryClient = useQueryClient();
  return useMutation<ResourceSnapshot, Error, RecordSnapshotData>({
    mutationFn: recordSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceMonitoringKeys.current() });
      queryClient.invalidateQueries({
        queryKey: [...resourceMonitoringKeys.all, 'snapshots'],
      });
    },
  });
}

/**
 * Fetch resource snapshots with optional filters.
 */
export function useResourceSnapshots(filters?: SnapshotFilters) {
  return useQuery<ResourceSnapshot[]>({
    queryKey: resourceMonitoringKeys.snapshots(filters),
    queryFn: () => getResourceSnapshots(filters),
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchInterval: 15_000,
  });
}

/**
 * Fetch the latest snapshot per agent (summary view).
 */
export function useCurrentResources() {
  return useQuery<ResourceSnapshot[]>({
    queryKey: resourceMonitoringKeys.current(),
    queryFn: getCurrentResources,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  });
}

/**
 * Fetch aggregated time-series resource history.
 */
export function useResourceHistory(agentId?: string, hours: number = 1) {
  const minutes = hours * 60;
  return useQuery<ResourceHistoryBucket[]>({
    queryKey: resourceMonitoringKeys.history(agentId, minutes),
    queryFn: () => getResourceHistory(agentId, minutes),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });
}

/**
 * Create a new alert rule.
 */
export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation<ResourceAlertRule, Error, CreateAlertRuleData>({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceMonitoringKeys.alertRules() });
    },
  });
}

/**
 * Fetch all alert rules for the current user.
 */
export function useAlertRules() {
  return useQuery<ResourceAlertRule[]>({
    queryKey: resourceMonitoringKeys.alertRules(),
    queryFn: getAlertRules,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/**
 * Update an existing alert rule.
 */
export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation<ResourceAlertRule, Error, { ruleId: string; data: UpdateAlertRuleData }>({
    mutationFn: ({ ruleId, data }) => updateAlertRule(ruleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceMonitoringKeys.alertRules() });
    },
  });
}

/**
 * Delete an alert rule.
 */
export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceMonitoringKeys.alertRules() });
    },
  });
}

/**
 * Check current snapshots against active alert rules.
 */
export function useCheckAlerts() {
  const queryClient = useQueryClient();
  return useMutation<CheckAlertsResponse, Error, void>({
    mutationFn: checkAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceMonitoringKeys.alertRules() });
    },
  });
}

export type {
  ResourceSnapshot,
  ResourceHistoryBucket,
  ResourceAlertRule,
  SnapshotFilters,
  CreateAlertRuleData,
  UpdateAlertRuleData,
  CheckAlertsResponse,
};
