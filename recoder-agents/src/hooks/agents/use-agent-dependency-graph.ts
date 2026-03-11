'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addAgentDependency,
  getAgentDependenciesV2,
  removeAgentDependency,
  getFullDependencyGraph,
  getAgentImpact,
  getDependencyStats,
  type AddDependencyRequest,
  type DependencyRecord,
  type DependencyGraph,
  type ImpactAnalysis,
  type DependencyStats,
} from '@/lib/api/agent-dependency-graph';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const depGraphKeys = {
  all: ['agent-dep-graph'] as const,
  deps: (agentId: string) => [...depGraphKeys.all, 'deps', agentId] as const,
  graph: () => [...depGraphKeys.all, 'graph'] as const,
  impact: (agentId: string) => [...depGraphKeys.all, 'impact', agentId] as const,
  stats: () => [...depGraphKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAddDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: AddDependencyRequest }) =>
      addAgentDependency(agentId, data),
    onSuccess: (_result, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: depGraphKeys.deps(agentId) });
      queryClient.invalidateQueries({ queryKey: depGraphKeys.graph() });
      queryClient.invalidateQueries({ queryKey: depGraphKeys.stats() });
    },
  });
}

export function useAgentDependenciesV2(agentId: string) {
  return useQuery<DependencyRecord[]>({
    queryKey: depGraphKeys.deps(agentId),
    queryFn: () => getAgentDependenciesV2(agentId),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}

export function useRemoveDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, depId }: { agentId: string; depId: string }) =>
      removeAgentDependency(agentId, depId),
    onSuccess: (_result, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: depGraphKeys.deps(agentId) });
      queryClient.invalidateQueries({ queryKey: depGraphKeys.graph() });
      queryClient.invalidateQueries({ queryKey: depGraphKeys.stats() });
    },
  });
}

export function useDependencyGraph() {
  return useQuery<DependencyGraph>({
    queryKey: depGraphKeys.graph(),
    queryFn: () => getFullDependencyGraph(),
    staleTime: 60_000,
  });
}

export function useImpactAnalysis(agentId: string) {
  return useQuery<ImpactAnalysis>({
    queryKey: depGraphKeys.impact(agentId),
    queryFn: () => getAgentImpact(agentId),
    enabled: !!agentId,
    staleTime: 60_000,
  });
}

export function useDependencyStats() {
  return useQuery<DependencyStats>({
    queryKey: depGraphKeys.stats(),
    queryFn: () => getDependencyStats(),
    staleTime: 60_000,
  });
}
