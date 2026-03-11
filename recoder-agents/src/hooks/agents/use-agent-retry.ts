'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listRetryPolicies,
  createRetryPolicy,
  deleteRetryPolicy,
  retryRun,
  listRetryAttempts,
  getRetryStats,
  type RetryPolicy,
  type RetryAttempt,
  type RetryStats,
  type CreateRetryPolicyRequest,
  type ManualRetryRequest,
} from '@/lib/api/agent-retry';

export const retryKeys = {
  all: ['agent-retry'] as const,
  policies: () => [...retryKeys.all, 'policies'] as const,
  attempts: (runId: string) => [...retryKeys.all, 'attempts', runId] as const,
  stats: () => [...retryKeys.all, 'stats'] as const,
};

export function useRetryPolicies() {
  return useQuery<RetryPolicy[]>({
    queryKey: retryKeys.policies(),
    queryFn: () => listRetryPolicies(),
    staleTime: 30_000,
  });
}

export function useCreateRetryPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRetryPolicyRequest) => createRetryPolicy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retryKeys.policies() });
    },
  });
}

export function useDeleteRetryPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (policyId: string) => deleteRetryPolicy(policyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retryKeys.policies() });
    },
  });
}

export function useRetryRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, data }: { runId: string; data?: ManualRetryRequest }) =>
      retryRun(runId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: retryKeys.attempts(variables.runId),
      });
      queryClient.invalidateQueries({ queryKey: retryKeys.stats() });
    },
  });
}

export function useRetryAttempts(runId: string) {
  return useQuery<RetryAttempt[]>({
    queryKey: retryKeys.attempts(runId),
    queryFn: () => listRetryAttempts(runId),
    enabled: !!runId,
    staleTime: 10_000,
  });
}

export function useRetryStats() {
  return useQuery<RetryStats>({
    queryKey: retryKeys.stats(),
    queryFn: () => getRetryStats(),
    staleTime: 30_000,
  });
}
