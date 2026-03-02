'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';
import type { WorktreeInfo } from '@recoder/shared/a2a';

const worktreeKeys = {
  all: ['worktrees'] as const,
  list: (wsId: string) => [...worktreeKeys.all, 'list', wsId] as const,
  diff: (taskId: string) => [...worktreeKeys.all, 'diff', taskId] as const,
};

export function useWorktrees(wsId: string | null, containerId?: string) {
  return useQuery({
    queryKey: worktreeKeys.list(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ worktrees: WorktreeInfo[]; total: number }>(
        `/api/a2a/workspaces/${wsId}/worktrees?containerId=${containerId}`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch worktrees');
    },
    enabled: !!wsId && !!containerId,
    staleTime: 10_000,
  });
}

export function useWorktreeDiff(wsId: string | null, taskId: string | null, containerId?: string) {
  return useQuery({
    queryKey: worktreeKeys.diff(taskId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ diff: string }>(
        `/api/a2a/workspaces/${wsId}/worktrees/${taskId}/diff?containerId=${containerId}`,
      );
      if (res.success && res.data) return res.data.diff;
      throw new Error(res.error?.message || 'Failed to fetch diff');
    },
    enabled: !!wsId && !!taskId && !!containerId,
  });
}

export function useMergeWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      taskId,
      containerId,
      strategy,
    }: {
      wsId: string;
      taskId: string;
      containerId: string;
      strategy?: 'merge' | 'rebase';
    }) => {
      const res = await dockerBackendApi.post<{ success: boolean; conflicts: string[] }>(
        `/api/a2a/workspaces/${wsId}/worktrees/${taskId}/merge`,
        { containerId, strategy },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to merge');
    },
    onSuccess: (_, { wsId }) => {
      queryClient.invalidateQueries({ queryKey: worktreeKeys.list(wsId) });
    },
  });
}

export function useCleanupWorktree() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      wsId,
      taskId,
      containerId,
    }: {
      wsId: string;
      taskId: string;
      containerId: string;
    }) => {
      const res = await dockerBackendApi.delete(
        `/api/a2a/workspaces/${wsId}/worktrees/${taskId}?containerId=${containerId}`,
      );
      if (res.success) return true;
      throw new Error(res.error?.message || 'Failed to cleanup');
    },
    onSuccess: (_, { wsId }) => {
      queryClient.invalidateQueries({ queryKey: worktreeKeys.list(wsId) });
    },
  });
}
