'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recordMetric,
  listCurrentMetrics,
  getMetricHistory,
  listPlans,
  createPlan,
  getPlan,
  updatePlan,
  deletePlan,
  setCapacityAlert,
  listCapacityAlerts,
  checkCapacity,
  type CapacityMetric,
  type CapacityPlan,
  type CapacityAlert,
  type RecordMetricData,
  type CreatePlanData,
  type UpdatePlanData,
  type SetAlertData,
  type CapacityCheckResult,
} from '@/lib/api/capacity-planning';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const capacityKeys = {
  all: ['capacity'] as const,
  metrics: () => [...capacityKeys.all, 'metrics'] as const,
  metricHistory: (metricName: string, days?: number) =>
    [...capacityKeys.all, 'history', metricName, days] as const,
  plans: () => [...capacityKeys.all, 'plans'] as const,
  plan: (id: string) => [...capacityKeys.all, 'plan', id] as const,
  alerts: () => [...capacityKeys.all, 'alerts'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCurrentMetrics() {
  return useQuery<CapacityMetric[]>({
    queryKey: capacityKeys.metrics(),
    queryFn: listCurrentMetrics,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  });
}

export function useMetricHistory(metricName: string, days: number = 30) {
  return useQuery<CapacityMetric[]>({
    queryKey: capacityKeys.metricHistory(metricName, days),
    queryFn: () => getMetricHistory(metricName, days),
    enabled: Boolean(metricName),
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
}

export function useCapacityPlans() {
  return useQuery<CapacityPlan[]>({
    queryKey: capacityKeys.plans(),
    queryFn: listPlans,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation<CapacityPlan, Error, CreatePlanData>({
    mutationFn: createPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.plans() });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation<CapacityPlan, Error, { id: string; data: UpdatePlanData }>({
    mutationFn: ({ id, data }) => updatePlan(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.plans() });
      queryClient.invalidateQueries({ queryKey: capacityKeys.plan(variables.id) });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deletePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.plans() });
    },
  });
}

export function useCapacityAlerts() {
  return useQuery<CapacityAlert[]>({
    queryKey: capacityKeys.alerts(),
    queryFn: listCapacityAlerts,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useSetCapacityAlert() {
  const queryClient = useQueryClient();
  return useMutation<CapacityAlert, Error, SetAlertData>({
    mutationFn: setCapacityAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.alerts() });
    },
  });
}

export function useCheckCapacity() {
  const queryClient = useQueryClient();
  return useMutation<CapacityCheckResult, Error, void>({
    mutationFn: checkCapacity,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.alerts() });
    },
  });
}

export function useRecordMetric() {
  const queryClient = useQueryClient();
  return useMutation<CapacityMetric, Error, RecordMetricData>({
    mutationFn: recordMetric,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: capacityKeys.metrics() });
    },
  });
}

export type {
  CapacityMetric,
  CapacityPlan,
  CapacityAlert,
  RecordMetricData,
  CreatePlanData,
  UpdatePlanData,
  SetAlertData,
  CapacityCheckResult,
};
