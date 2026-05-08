'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  approvalId: string;
  workspaceId: string;
  requestingAgentId: string;
  targetAgentId: string;
  action: string;
  details: Record<string, unknown>;
  status: 'pending' | 'granted' | 'rejected' | 'expired' | 'escalated';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Query-key factory
// ---------------------------------------------------------------------------

const approvalKeys = {
  all: ['approvals'] as const,
  pending: (wsId: string) => [...approvalKeys.all, 'pending', wsId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePendingApprovals(workspaceId: string | null) {
  return useQuery({
    queryKey: approvalKeys.pending(workspaceId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ approvals: ApprovalRequest[]; total: number }>(
        `/api/a2a/workspaces/${workspaceId}/approvals?status=pending`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch pending approvals');
    },
    enabled: !!workspaceId,
    refetchInterval: 5_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useApproveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ approvalId }: { approvalId: string; workspaceId: string }) => {
      const res = await dockerBackendApi.post<ApprovalRequest>(
        `/api/a2a/approvals/${approvalId}/grant`,
        { resolvedBy: 'user' },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to approve action');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.pending(variables.workspaceId) });
    },
  });
}

export function useRejectAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ approvalId }: { approvalId: string; workspaceId: string }) => {
      const res = await dockerBackendApi.post<ApprovalRequest>(
        `/api/a2a/approvals/${approvalId}/reject`,
        { resolvedBy: 'user' },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to reject action');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.pending(variables.workspaceId) });
    },
  });
}

export function useEscalateAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ approvalId, reason }: { approvalId: string; workspaceId: string; reason?: string }) => {
      const res = await dockerBackendApi.post<ApprovalRequest>(
        `/api/a2a/approvals/${approvalId}/escalate`,
        { reason },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to escalate action');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.pending(variables.workspaceId) });
    },
  });
}

export { approvalKeys };
