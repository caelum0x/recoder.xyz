import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentQuota,
  updateAgentQuota,
  deleteAgentQuota,
  getQuotasOverview,
  getQuotaAlerts,
  type UpsertQuotaData,
} from '@/lib/api/agent-quotas';

export function useAgentQuota(agentId: string) {
  return useQuery({
    queryKey: ['agent-quota', agentId],
    queryFn: () => getAgentQuota(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export function useUpdateAgentQuota(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertQuotaData) => updateAgentQuota(agentId, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['agent-quota', agentId] }),
  });
}

export function useDeleteAgentQuota(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAgentQuota(agentId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['agent-quota', agentId] }),
  });
}

export function useQuotasOverview() {
  return useQuery({
    queryKey: ['agent-quotas-overview'],
    queryFn: getQuotasOverview,
    staleTime: 30_000,
  });
}

export function useQuotaAlerts() {
  return useQuery({
    queryKey: ['agent-quotas-alerts'],
    queryFn: getQuotaAlerts,
    staleTime: 30_000,
  });
}
