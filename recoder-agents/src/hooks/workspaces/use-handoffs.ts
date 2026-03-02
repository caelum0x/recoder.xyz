'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffRecord {
  handoffId: string;
  workspaceId: string;
  fromAgentId: string;
  toAgentId: string;
  taskId: string;
  intent: 'handoff' | 'delegate' | 'review';
  context?: Record<string, unknown>;
  status: 'active' | 'accepted' | 'declined' | 'completed';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Query-key factory
// ---------------------------------------------------------------------------

const handoffKeys = {
  all: ['handoffs'] as const,
  active: (wsId: string) => [...handoffKeys.all, 'active', wsId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useActiveHandoffs(workspaceId: string | null) {
  return useQuery({
    queryKey: handoffKeys.active(workspaceId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ handoffs: HandoffRecord[]; total: number }>(
        `/api/a2a/workspaces/${workspaceId}/handoffs?status=active`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch active handoffs');
    },
    enabled: !!workspaceId,
    refetchInterval: 5_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useInitiateHandoff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      workspaceId: string;
      fromAgentId: string;
      toAgentId: string;
      taskId: string;
      intent: 'handoff' | 'delegate' | 'review';
      context?: Record<string, unknown>;
    }) => {
      const { workspaceId, ...body } = input;
      const res = await dockerBackendApi.post<HandoffRecord>(
        `/api/a2a/workspaces/${workspaceId}/handoffs`,
        body,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to initiate handoff');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: handoffKeys.active(data.workspaceId) });
    },
  });
}

export function useAcceptHandoff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ handoffId }: { handoffId: string; workspaceId: string }) => {
      const res = await dockerBackendApi.post<HandoffRecord>(
        `/api/a2a/handoffs/${handoffId}/accept`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to accept handoff');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: handoffKeys.active(variables.workspaceId) });
    },
  });
}

export function useDeclineHandoff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ handoffId }: { handoffId: string; workspaceId: string }) => {
      const res = await dockerBackendApi.post<HandoffRecord>(
        `/api/a2a/handoffs/${handoffId}/decline`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to decline handoff');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: handoffKeys.active(variables.workspaceId) });
    },
  });
}

export { handoffKeys };
