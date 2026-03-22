'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recordCost,
  batchRecordCosts,
  listCosts,
  getCostSummary,
  getCostTrends,
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetAlerts,
  type CostRecord,
  type CostBudget,
  type CostSummary,
  type CostTrend,
  type RecordCostData,
  type CreateBudgetData,
  type CostFilters,
} from '@/lib/api/cost-tracking';

const COSTS_KEY = ['costs'] as const;
const COST_SUMMARY_KEY = ['costs', 'summary'] as const;
const COST_TRENDS_KEY = ['costs', 'trends'] as const;
const BUDGETS_KEY = ['costs', 'budgets'] as const;
const BUDGET_ALERTS_KEY = ['costs', 'budgets', 'alerts'] as const;

export function useRecordCost() {
  const queryClient = useQueryClient();

  return useMutation<CostRecord, Error, RecordCostData>({
    mutationFn: (data) => recordCost(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COSTS_KEY });
      queryClient.invalidateQueries({ queryKey: COST_SUMMARY_KEY });
      queryClient.invalidateQueries({ queryKey: COST_TRENDS_KEY });
    },
  });
}

export function useCostSummary() {
  return useQuery<CostSummary>({
    queryKey: COST_SUMMARY_KEY,
    queryFn: () => getCostSummary(),
    staleTime: 60_000,
  });
}

export function useCostTrends(days?: number, agentId?: string) {
  return useQuery<CostTrend[]>({
    queryKey: [...COST_TRENDS_KEY, days ?? 30, agentId ?? 'all'],
    queryFn: () => getCostTrends(days, agentId),
    staleTime: 60_000,
  });
}

export function useCosts(filters?: CostFilters) {
  return useQuery<CostRecord[]>({
    queryKey: [...COSTS_KEY, 'list', filters ?? {}],
    queryFn: () => listCosts(filters),
    staleTime: 30_000,
  });
}

export function useBudgets() {
  return useQuery<CostBudget[]>({
    queryKey: BUDGETS_KEY,
    queryFn: () => listBudgets(),
    staleTime: 30_000,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation<CostBudget, Error, CreateBudgetData>({
    mutationFn: (data) => createBudget(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGET_ALERTS_KEY });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();

  return useMutation<
    CostBudget,
    Error,
    { id: string; data: Partial<CreateBudgetData> & { is_active?: boolean } }
  >({
    mutationFn: ({ id, data }) => updateBudget(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGET_ALERTS_KEY });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGET_ALERTS_KEY });
    },
  });
}

export function useBudgetAlerts() {
  return useQuery<CostBudget[]>({
    queryKey: BUDGET_ALERTS_KEY,
    queryFn: () => getBudgetAlerts(),
    staleTime: 60_000,
  });
}
