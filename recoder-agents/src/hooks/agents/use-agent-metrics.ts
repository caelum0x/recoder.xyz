import { useQuery } from '@tanstack/react-query';
import {
  getMetricsOverview,
  getToolMetrics,
  getCostBreakdown,
  type MetricsOverview,
  type ToolMetrics,
  type CostBreakdown,
} from '@/lib/api/agent-metrics';

export function useMetricsOverview(agentId: string) {
  return useQuery<MetricsOverview>({
    queryKey: ['agent-metrics-overview', agentId],
    queryFn: () => getMetricsOverview(agentId),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}

export function useToolMetrics(agentId: string) {
  return useQuery<ToolMetrics>({
    queryKey: ['agent-tool-metrics', agentId],
    queryFn: () => getToolMetrics(agentId),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}

export function useCostBreakdown(agentId: string) {
  return useQuery<CostBreakdown>({
    queryKey: ['agent-cost-breakdown', agentId],
    queryFn: () => getCostBreakdown(agentId),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}
