'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentHealth,
  calculateAgentHealth,
  getAgentHealthHistory,
  getAgentsHealthOverview,
} from '@/lib/api/agent-health';

export function useAgentHealth(agentId: string) {
  return useQuery({
    queryKey: ['agent-health', agentId],
    queryFn: () => getAgentHealth(agentId),
    enabled: !!agentId,
    staleTime: 60000,
  });
}

export function useCalculateHealth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) => calculateAgentHealth(agentId),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['agent-health', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-health-history', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents-health-overview'] });
    },
  });
}

export function useHealthHistory(agentId: string, limit: number = 30) {
  return useQuery({
    queryKey: ['agent-health-history', agentId, limit],
    queryFn: () => getAgentHealthHistory(agentId, limit),
    enabled: !!agentId,
    staleTime: 60000,
  });
}

export function useHealthOverview() {
  return useQuery({
    queryKey: ['agents-health-overview'],
    queryFn: () => getAgentsHealthOverview(),
    staleTime: 60000,
  });
}
