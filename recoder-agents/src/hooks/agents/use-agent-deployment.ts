'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deployToSlot,
  getDeploymentSlots,
  promoteSlot,
  rollbackSlot,
  updateSlotTraffic,
  getDeploymentHistory,
  type DeploymentSlot,
  type DeploymentHistoryEntry,
  type DeployToSlotData,
} from '@/lib/api/agent-deployment';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const deploymentKeys = {
  all: ['deployment'] as const,
  slots: (agentId: string) => [...deploymentKeys.all, 'slots', agentId] as const,
  history: (agentId: string) => [...deploymentKeys.all, 'history', agentId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Deploy config to a slot. Invalidates slots and history on success.
 */
export function useDeployToSlot() {
  const queryClient = useQueryClient();

  return useMutation<DeploymentSlot, Error, { agentId: string; data: DeployToSlotData }>({
    mutationFn: ({ agentId, data }) => deployToSlot(agentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.slots(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: deploymentKeys.history(variables.agentId) });
    },
  });
}

/**
 * Fetch deployment slots for an agent. Polls every 30 seconds.
 */
export function useDeploymentSlots(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<DeploymentSlot[]>({
    queryKey: deploymentKeys.slots(agentId),
    queryFn: () => getDeploymentSlots(agentId),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!agentId && options?.enabled !== false,
  });
}

/**
 * Promote staging to production. Invalidates slots and history.
 */
export function usePromoteSlot() {
  const queryClient = useQueryClient();

  return useMutation<DeploymentSlot, Error, { agentId: string }>({
    mutationFn: ({ agentId }) => promoteSlot(agentId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.slots(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: deploymentKeys.history(variables.agentId) });
    },
  });
}

/**
 * Rollback production to the rollback slot. Invalidates slots and history.
 */
export function useRollbackSlot() {
  const queryClient = useQueryClient();

  return useMutation<DeploymentSlot, Error, { agentId: string }>({
    mutationFn: ({ agentId }) => rollbackSlot(agentId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.slots(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: deploymentKeys.history(variables.agentId) });
    },
  });
}

/**
 * Update traffic percentage for a slot. Invalidates slots.
 */
export function useUpdateTraffic() {
  const queryClient = useQueryClient();

  return useMutation<
    DeploymentSlot,
    Error,
    { agentId: string; slotName: string; trafficPercent: number }
  >({
    mutationFn: ({ agentId, slotName, trafficPercent }) =>
      updateSlotTraffic(agentId, slotName, trafficPercent),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.slots(variables.agentId) });
    },
  });
}

/**
 * Fetch deployment history for an agent. Polls every 30 seconds.
 */
export function useDeploymentHistory(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<DeploymentHistoryEntry[]>({
    queryKey: deploymentKeys.history(agentId),
    queryFn: () => getDeploymentHistory(agentId),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!agentId && options?.enabled !== false,
  });
}
