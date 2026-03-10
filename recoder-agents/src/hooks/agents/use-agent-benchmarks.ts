import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getAgentBenchmarks,
  generateBenchmark,
  getBenchmarkComparison,
  getBenchmarkLeaderboard,
  type BenchmarkListResponse,
  type AgentBenchmark,
  type BenchmarkComparisonResponse,
  type LeaderboardResponse,
} from '@/lib/api/agent-benchmarks';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const benchmarkKeys = {
  all: ['benchmarks'] as const,
  lists: () => [...benchmarkKeys.all, 'list'] as const,
  list: (agentId: string, filters?: Record<string, any>) =>
    [...benchmarkKeys.lists(), agentId, filters] as const,
  comparison: (agentId: string) =>
    [...benchmarkKeys.all, 'comparison', agentId] as const,
  leaderboard: (metric: string) =>
    [...benchmarkKeys.all, 'leaderboard', metric] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useAgentBenchmarks = (
  agentId: string,
  filters?: { model?: string; limit?: number; offset?: number }
) => {
  return useQuery<BenchmarkListResponse>({
    queryKey: benchmarkKeys.list(agentId, filters),
    queryFn: () => getAgentBenchmarks(agentId, filters),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useGenerateBenchmark = () => {
  const queryClient = useQueryClient();

  return useMutation<AgentBenchmark, Error, { agentId: string; period: string }>({
    mutationFn: ({ agentId, period }) => generateBenchmark(agentId, period),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.lists() });
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.comparison(agentId) });
      toast.success('Benchmark generated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate benchmark');
    },
  });
};

export const useBenchmarkComparison = (agentId: string) => {
  return useQuery<BenchmarkComparisonResponse>({
    queryKey: benchmarkKeys.comparison(agentId),
    queryFn: () => getBenchmarkComparison(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useBenchmarkLeaderboard = (metric: string = 'success_rate') => {
  return useQuery<LeaderboardResponse>({
    queryKey: benchmarkKeys.leaderboard(metric),
    queryFn: () => getBenchmarkLeaderboard(metric),
    staleTime: 60000,
    refetchOnMount: 'always',
  });
};

export type { AgentBenchmark, BenchmarkListResponse, BenchmarkComparisonResponse, LeaderboardResponse };
