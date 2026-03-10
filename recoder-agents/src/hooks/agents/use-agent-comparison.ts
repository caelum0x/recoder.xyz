import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  compareAgents,
  getAgentLeaderboard,
  createComparison,
  listSavedComparisons,
  getComparison,
  deleteComparison,
  liveCompare,
  type CreateComparisonRequest,
} from '@/lib/api/agent-comparison';

// Legacy hooks (preserved for backward compatibility)

export function useAgentComparison(agentIds: string[]) {
  return useQuery({
    queryKey: ['agent-comparison', agentIds],
    queryFn: () => compareAgents(agentIds),
    enabled: agentIds.length >= 2,
    staleTime: 60_000,
  });
}

export function useAgentLeaderboard(metric: string = 'runs', limit: number = 10) {
  return useQuery({
    queryKey: ['agent-leaderboard', metric, limit],
    queryFn: () => getAgentLeaderboard(metric, limit),
    staleTime: 60_000,
  });
}

// New saved comparison hooks

export function useCreateComparison() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateComparisonRequest) => createComparison(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-comparisons'] });
    },
  });
}

export function useSavedComparisons() {
  return useQuery({
    queryKey: ['saved-comparisons'],
    queryFn: () => listSavedComparisons(),
    staleTime: 60_000,
  });
}

export function useComparison(comparisonId: string | null) {
  return useQuery({
    queryKey: ['comparison', comparisonId],
    queryFn: () => getComparison(comparisonId!),
    enabled: !!comparisonId,
    staleTime: 60_000,
  });
}

export function useDeleteComparison() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (comparisonId: string) => deleteComparison(comparisonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-comparisons'] });
    },
  });
}

export function useLiveComparison(agentIds: string[], period: string = '30d') {
  return useQuery({
    queryKey: ['live-comparison', agentIds, period],
    queryFn: () => liveCompare(agentIds, period),
    enabled: agentIds.length >= 2,
    staleTime: 30_000,
  });
}
