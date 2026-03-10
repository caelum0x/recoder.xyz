'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCostAlerts,
  createCostAlert,
  updateCostAlert,
  deleteCostAlert,
  getCostAlertHistory,
  checkCostAlertsNow,
  type CostAlertRule,
  type CreateCostAlertPayload,
  type UpdateCostAlertPayload,
  type CostAlertHistoryResponse,
  type CheckResult,
} from '@/lib/api/cost-alerts';

const COST_ALERTS_KEY = ['cost-alerts'] as const;
const COST_ALERT_HISTORY_KEY = ['cost-alert-history'] as const;

export function useCostAlerts(activeOnly?: boolean) {
  return useQuery<CostAlertRule[]>({
    queryKey: [...COST_ALERTS_KEY, activeOnly ? 'active' : 'all'],
    queryFn: () => listCostAlerts(activeOnly),
    staleTime: 30_000,
  });
}

export function useCreateCostAlert() {
  const queryClient = useQueryClient();

  return useMutation<CostAlertRule, Error, CreateCostAlertPayload>({
    mutationFn: (payload) => createCostAlert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COST_ALERTS_KEY });
    },
  });
}

export function useUpdateCostAlert() {
  const queryClient = useQueryClient();

  return useMutation<
    CostAlertRule,
    Error,
    { ruleId: string; payload: UpdateCostAlertPayload }
  >({
    mutationFn: ({ ruleId, payload }) => updateCostAlert(ruleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COST_ALERTS_KEY });
    },
  });
}

export function useDeleteCostAlert() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (ruleId) => deleteCostAlert(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COST_ALERTS_KEY });
      queryClient.invalidateQueries({ queryKey: COST_ALERT_HISTORY_KEY });
    },
  });
}

export function useCostAlertHistory(options?: {
  rule_id?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery<CostAlertHistoryResponse>({
    queryKey: [...COST_ALERT_HISTORY_KEY, options?.rule_id ?? 'all'],
    queryFn: () => getCostAlertHistory(options),
    staleTime: 30_000,
  });
}

export function useCheckCostAlerts() {
  const queryClient = useQueryClient();

  return useMutation<CheckResult, Error>({
    mutationFn: () => checkCostAlertsNow(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COST_ALERTS_KEY });
      queryClient.invalidateQueries({ queryKey: COST_ALERT_HISTORY_KEY });
    },
  });
}
