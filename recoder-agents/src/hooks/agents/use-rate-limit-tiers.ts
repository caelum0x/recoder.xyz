'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRateTier,
  getRateTiers,
  updateRateTier,
  deleteRateTier,
  assignRateTier,
  getAgentRateTier,
  removeAgentRateTier,
  getRateTierUsage,
  type RateLimitTier,
  type AgentRateAssignment,
  type RateTierUsage,
  type CreateRateTierData,
  type UpdateRateTierData,
  type AssignRateTierData,
} from '@/lib/api/rate-limit-tiers';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const rateTierKeys = {
  all: ['rate-limit-tiers'] as const,
  tiers: () => [...rateTierKeys.all, 'tiers'] as const,
  usage: () => [...rateTierKeys.all, 'usage'] as const,
  agentTier: (agentId: string) => [...rateTierKeys.all, 'agent', agentId] as const,
} as const;

// ---------------------------------------------------------------------------
// Tier Hooks
// ---------------------------------------------------------------------------

export function useRateTiers() {
  return useQuery<RateLimitTier[]>({
    queryKey: rateTierKeys.tiers(),
    queryFn: getRateTiers,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateRateTier() {
  const queryClient = useQueryClient();
  return useMutation<RateLimitTier, Error, CreateRateTierData>({
    mutationFn: createRateTier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rateTierKeys.all });
    },
  });
}

export function useUpdateRateTier() {
  const queryClient = useQueryClient();
  return useMutation<RateLimitTier, Error, { tierId: string; data: UpdateRateTierData }>({
    mutationFn: ({ tierId, data }) => updateRateTier(tierId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rateTierKeys.all });
    },
  });
}

export function useDeleteRateTier() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteRateTier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rateTierKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Agent Assignment Hooks
// ---------------------------------------------------------------------------

export function useAssignRateTier() {
  const queryClient = useQueryClient();
  return useMutation<
    AgentRateAssignment,
    Error,
    { agentId: string; data: AssignRateTierData }
  >({
    mutationFn: ({ agentId, data }) => assignRateTier(agentId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: rateTierKeys.agentTier(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: rateTierKeys.usage() });
    },
  });
}

export function useAgentRateTier(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<AgentRateAssignment>({
    queryKey: rateTierKeys.agentTier(agentId),
    queryFn: () => getAgentRateTier(agentId),
    enabled: !!agentId && options?.enabled !== false,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: false, // 404 is expected when no tier assigned
  });
}

export function useRemoveRateTier() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: removeAgentRateTier,
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: rateTierKeys.agentTier(agentId) });
      queryClient.invalidateQueries({ queryKey: rateTierKeys.usage() });
    },
  });
}

// ---------------------------------------------------------------------------
// Usage Hook
// ---------------------------------------------------------------------------

export function useRateTierUsage() {
  return useQuery<RateTierUsage[]>({
    queryKey: rateTierKeys.usage(),
    queryFn: getRateTierUsage,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: false,
  });
}
