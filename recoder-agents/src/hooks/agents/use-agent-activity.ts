import { useQuery } from '@tanstack/react-query';
import {
  getAgentActivity,
  getRecentActivity,
  getAgentActivitySummary,
  type ActivityFilters,
} from '@/lib/api/agent-activity';

export function useAgentActivity(agentId: string, filters?: ActivityFilters) {
  return useQuery({
    queryKey: ['agent-activity', agentId, filters],
    queryFn: () => getAgentActivity(agentId, filters),
    enabled: !!agentId,
    staleTime: 15_000,
  });
}

export function useRecentActivity(limit: number = 50) {
  return useQuery({
    queryKey: ['recent-activity', limit],
    queryFn: () => getRecentActivity(limit),
    staleTime: 15_000,
  });
}

export function useAgentActivitySummary(agentId: string) {
  return useQuery({
    queryKey: ['agent-activity-summary', agentId],
    queryFn: () => getAgentActivitySummary(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}
