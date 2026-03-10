'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentTeam,
  shareAgent,
  removeAgentAccess,
  type AgentAccess,
} from '@/lib/api/collaboration';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const agentTeamKeys = {
  all: ['agent-team'] as const,
  team: (agentId: string) => ['agent-team', agentId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useAgentTeam(agentId: string) {
  return useQuery<AgentAccess[]>({
    queryKey: agentTeamKeys.team(agentId),
    queryFn: () => getAgentTeam(agentId),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useShareAgent() {
  const queryClient = useQueryClient();

  return useMutation<
    AgentAccess,
    Error,
    { agentId: string; email: string; role: 'user' | 'editor' | 'admin' }
  >({
    mutationFn: ({ agentId, email, role }) => shareAgent(agentId, email, role),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentTeamKeys.team(variables.agentId),
      });
      toast.info(`Shared with ${variables.email} as ${variables.role}`);
    },
    onError: (error) => {
      toast.warning(error.message || 'Failed to share agent');
    },
  });
}

export function useRemoveAgentAccess() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { agentId: string; accessId: string }>({
    mutationFn: ({ agentId, accessId }) => removeAgentAccess(agentId, accessId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: agentTeamKeys.team(variables.agentId),
      });
      toast.info('Team member removed');
    },
    onError: (error) => {
      toast.warning(error.message || 'Failed to remove team member');
    },
  });
}
