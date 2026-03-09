'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCostSummary, getBudgetAlerts, setBudgetThreshold, type CostSummary, type BudgetAlert } from '@/lib/api/budget-alerts';

export function useCostSummary() {
  return useQuery<CostSummary>({
    queryKey: ['cost-summary'],
    queryFn: getCostSummary,
    staleTime: 60_000,
  });
}

export function useBudgetAlerts() {
  return useQuery<BudgetAlert[]>({
    queryKey: ['budget-alerts'],
    queryFn: getBudgetAlerts,
    staleTime: 30_000,
  });
}

export function useSetBudgetThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => setBudgetThreshold(amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-alerts'] });
    },
  });
}
