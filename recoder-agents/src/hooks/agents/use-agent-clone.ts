'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cloneAgentWithMods,
  getAgentClones,
  getAgentDiff,
  type CloneAgentRequest,
  type CloneAgentResponse,
  type CloneHistoryResponse,
  type AgentDiffResponse,
} from '@/lib/api/agent-clone';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const agentCloneKeys = {
  all: ['agent-clone'] as const,
  clones: (agentId: string) => [...agentCloneKeys.all, 'clones', agentId] as const,
  diff: (agentA: string, agentB: string) =>
    [...agentCloneKeys.all, 'diff', agentA, agentB] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Clone an agent with optional modifications.
 */
export function useCloneAgent() {
  const queryClient = useQueryClient();

  return useMutation<
    CloneAgentResponse,
    Error,
    { agentId: string; request?: CloneAgentRequest }
  >({
    mutationFn: ({ agentId, request }) => cloneAgentWithMods(agentId, request),
    onSuccess: (_data, variables) => {
      // Invalidate agents list and clone history
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({
        queryKey: agentCloneKeys.clones(variables.agentId),
      });
    },
  });
}

/**
 * Fetch clone history for a source agent.
 */
export function useAgentClones(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<CloneHistoryResponse>({
    queryKey: agentCloneKeys.clones(agentId),
    queryFn: () => getAgentClones(agentId),
    staleTime: 2 * 60 * 1000,
    enabled: !!agentId && options?.enabled !== false,
  });
}

/**
 * Diff two agents field-by-field.
 */
export function useAgentDiff(
  agentA: string,
  agentB: string,
  options?: { enabled?: boolean }
) {
  return useQuery<AgentDiffResponse>({
    queryKey: agentCloneKeys.diff(agentA, agentB),
    queryFn: () => getAgentDiff(agentA, agentB),
    staleTime: 60 * 1000,
    enabled: !!agentA && !!agentB && agentA !== agentB && options?.enabled !== false,
  });
}
