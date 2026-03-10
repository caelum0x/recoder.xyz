'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentDependencies,
  createAgentDependency,
  deleteAgentDependency,
  getAgentDependencyGraph,
  autoDetectDependencies,
  type CreateDependencyRequest,
} from '@/lib/api/agent-dependencies';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const dependencyKeys = {
  all: ['agent-dependencies'] as const,
  list: (agentId?: string) => [...dependencyKeys.all, 'list', agentId] as const,
  graph: () => [...dependencyKeys.all, 'graph'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAgentDependencies(agentId?: string) {
  return useQuery({
    queryKey: dependencyKeys.list(agentId),
    queryFn: () => getAgentDependencies(agentId),
    staleTime: 60000,
  });
}

export function useCreateDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDependencyRequest) => createAgentDependency(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dependencyKeys.all });
    },
  });
}

export function useDeleteDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (depId: string) => deleteAgentDependency(depId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dependencyKeys.all });
    },
  });
}

export function useAgentDependencyGraph() {
  return useQuery({
    queryKey: dependencyKeys.graph(),
    queryFn: () => getAgentDependencyGraph(),
    staleTime: 60000,
  });
}

export function useAutoDetectDependencies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => autoDetectDependencies(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dependencyKeys.all });
    },
  });
}
