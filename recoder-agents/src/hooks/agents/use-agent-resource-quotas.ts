'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentQuotas,
  setAgentQuota,
  deleteAgentQuota,
  checkAgentQuota,
  recordAgentUsage,
  resetAgentQuotas,
  getQuotaViolations,
  type AgentQuota,
  type SetQuotaData,
  type CheckQuotaResult,
  type RecordUsageResult,
  type QuotaViolation,
} from '@/lib/api/agent-resource-quotas';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const agentQuotaKeys = {
  all: ['agent-resource-quotas'] as const,
  quotas: (agentId: string) => [...agentQuotaKeys.all, 'quotas', agentId] as const,
  violations: (agentId?: string) => [...agentQuotaKeys.all, 'violations', agentId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch all resource quotas for an agent with usage percentages.
 */
export function useAgentQuotas(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<AgentQuota[]>({
    queryKey: agentQuotaKeys.quotas(agentId),
    queryFn: () => getAgentQuotas(agentId),
    refetchInterval: 15_000,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: !!agentId && options?.enabled !== false,
  });
}

/**
 * Set or update a resource quota. Invalidates quota list on success.
 */
export function useSetQuota() {
  const queryClient = useQueryClient();

  return useMutation<AgentQuota, Error, { agentId: string; data: SetQuotaData }>({
    mutationFn: ({ agentId, data }) => setAgentQuota(agentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentQuotaKeys.quotas(variables.agentId),
      });
    },
  });
}

/**
 * Delete a resource quota. Invalidates quota list on success.
 */
export function useDeleteQuota() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { agentId: string; quotaId: string }>({
    mutationFn: ({ agentId, quotaId }) => deleteAgentQuota(agentId, quotaId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentQuotaKeys.quotas(variables.agentId),
      });
    },
  });
}

/**
 * Check if an action is allowed within quota.
 */
export function useCheckQuota() {
  return useMutation<
    CheckQuotaResult,
    Error,
    { agentId: string; resource_type: string; requested_amount: number }
  >({
    mutationFn: ({ agentId, ...data }) => checkAgentQuota(agentId, data),
  });
}

/**
 * Record resource usage. Invalidates quota list and violations on success.
 */
export function useRecordUsage() {
  const queryClient = useQueryClient();

  return useMutation<
    RecordUsageResult,
    Error,
    { agentId: string; resource_type: string; amount: number }
  >({
    mutationFn: ({ agentId, ...data }) => recordAgentUsage(agentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentQuotaKeys.quotas(variables.agentId),
      });
      queryClient.invalidateQueries({
        queryKey: agentQuotaKeys.violations(variables.agentId),
      });
    },
  });
}

/**
 * Reset all usage counters for an agent. Invalidates quota list on success.
 */
export function useResetQuotas() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; reset_count: number }, Error, string>({
    mutationFn: resetAgentQuotas,
    onSuccess: (_, agentId) => {
      queryClient.invalidateQueries({
        queryKey: agentQuotaKeys.quotas(agentId),
      });
    },
  });
}

/**
 * Fetch quota violations. Optionally filter by agent.
 */
export function useQuotaViolations(agentId?: string, options?: { enabled?: boolean }) {
  return useQuery<QuotaViolation[]>({
    queryKey: agentQuotaKeys.violations(agentId),
    queryFn: () => getQuotaViolations(agentId),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
