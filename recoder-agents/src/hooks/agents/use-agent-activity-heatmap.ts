import { useQuery } from '@tanstack/react-query';
import {
  getAgentActivityHeatmap,
  getActivityStreaks,
  getWeeklyActivitySummary,
} from '@/lib/api/agent-activity-heatmap';

export function useAgentActivityHeatmap(agentId?: string) {
  return useQuery({
    queryKey: ['agent-activity-heatmap', agentId ?? 'all'],
    queryFn: () => getAgentActivityHeatmap(agentId),
    staleTime: 60_000,
  });
}

export function useActivityStreaks() {
  return useQuery({
    queryKey: ['agent-activity-streaks'],
    queryFn: () => getActivityStreaks(),
    staleTime: 60_000,
  });
}

export function useWeeklyActivitySummary() {
  return useQuery({
    queryKey: ['agent-weekly-activity-summary'],
    queryFn: () => getWeeklyActivitySummary(),
    staleTime: 60_000,
  });
}
