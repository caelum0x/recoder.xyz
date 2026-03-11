'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCostAlertRules,
  createCostAlertRule,
  updateCostAlertRule,
  deleteCostAlertRule,
  checkCostAlerts,
  getCostAlertHistory,
  updateCostAlert,
  type CostAlertRule,
  type CostAlertHistoryEntry,
  type CostAlertCheckResult,
  type CreateCostAlertRuleData,
  type UpdateCostAlertRuleData,
  type CostAlertHistoryFilters,
} from '@/lib/api/agent-cost-alerts';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const costAlertKeys = {
  all: ['agent-cost-alerts'] as const,
  rules: () => [...costAlertKeys.all, 'rules'] as const,
  history: (filters?: CostAlertHistoryFilters) => [...costAlertKeys.all, 'history', filters] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch all cost alert rules.
 */
export function useCostAlertRules(options?: { enabled?: boolean }) {
  return useQuery<CostAlertRule[]>({
    queryKey: costAlertKeys.rules(),
    queryFn: getCostAlertRules,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Create a new cost alert rule. Invalidates rules list on success.
 */
export function useCreateCostAlertRule() {
  const queryClient = useQueryClient();

  return useMutation<CostAlertRule, Error, CreateCostAlertRuleData>({
    mutationFn: createCostAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAlertKeys.rules() });
    },
  });
}

/**
 * Update an existing cost alert rule. Invalidates rules list on success.
 */
export function useUpdateCostAlertRule() {
  const queryClient = useQueryClient();

  return useMutation<CostAlertRule, Error, { ruleId: string; data: UpdateCostAlertRuleData }>({
    mutationFn: ({ ruleId, data }) => updateCostAlertRule(ruleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAlertKeys.rules() });
    },
  });
}

/**
 * Delete a cost alert rule. Invalidates rules and history on success.
 */
export function useDeleteCostAlertRule() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: deleteCostAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAlertKeys.all });
    },
  });
}

/**
 * Check all active rules against current costs. Invalidates history on success.
 */
export function useCheckCostAlerts() {
  const queryClient = useQueryClient();

  return useMutation<CostAlertCheckResult, Error, void>({
    mutationFn: checkCostAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAlertKeys.all });
    },
  });
}

/**
 * Fetch cost alert history with optional filters. Polls every 30 seconds.
 */
export function useCostAlertHistory(filters?: CostAlertHistoryFilters, options?: { enabled?: boolean }) {
  return useQuery<CostAlertHistoryEntry[]>({
    queryKey: costAlertKeys.history(filters),
    queryFn: () => getCostAlertHistory(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Acknowledge or resolve a cost alert. Invalidates history on success.
 */
export function useUpdateCostAlert() {
  const queryClient = useQueryClient();

  return useMutation<CostAlertHistoryEntry, Error, { alertId: string; status: string }>({
    mutationFn: ({ alertId, status }) => updateCostAlert(alertId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: costAlertKeys.all });
    },
  });
}
