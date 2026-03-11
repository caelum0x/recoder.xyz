import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  listConfigSnapshots,
  getConfigSnapshotDetail,
  createConfigSnapshot,
  activateConfigSnapshot,
  diffConfigSnapshots,
  rollbackConfigSnapshot,
  type ConfigSnapshot,
  type ConfigSnapshotListResponse,
  type DiffResponse,
  type CreateSnapshotRequest,
} from '@/lib/api/agent-versioned-configs';

// ============================================================================
// Query Keys
// ============================================================================

export const configSnapshotKeys = {
  all: ['config-snapshots'] as const,
  lists: () => [...configSnapshotKeys.all, 'list'] as const,
  list: (agentId: string) => [...configSnapshotKeys.lists(), agentId] as const,
  details: () => [...configSnapshotKeys.all, 'detail'] as const,
  detail: (agentId: string, snapshotId: string) => [...configSnapshotKeys.details(), agentId, snapshotId] as const,
  diff: (agentId: string, aId: string, bId: string) => [...configSnapshotKeys.all, 'diff', agentId, aId, bId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export const useConfigSnapshots = (agentId: string) => {
  return useQuery<ConfigSnapshotListResponse>({
    queryKey: configSnapshotKeys.list(agentId),
    queryFn: () => listConfigSnapshots(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useConfigSnapshotDetail = (agentId: string, snapshotId: string | null | undefined) => {
  return useQuery<ConfigSnapshot>({
    queryKey: configSnapshotKeys.detail(agentId, snapshotId!),
    queryFn: () => getConfigSnapshotDetail(agentId, snapshotId!),
    enabled: !!agentId && !!snapshotId,
    staleTime: 30000,
  });
};

export const useCreateConfigSnapshot = () => {
  const queryClient = useQueryClient();

  return useMutation<ConfigSnapshot, Error, { agentId: string; data: CreateSnapshotRequest }>({
    mutationFn: ({ agentId, data }) => createConfigSnapshot(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: configSnapshotKeys.list(agentId) });
      toast.success('Configuration snapshot saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save configuration snapshot');
    },
  });
};

export const useActivateSnapshot = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; activated_snapshot_id: string }, Error, { agentId: string; snapshotId: string }>({
    mutationFn: ({ agentId, snapshotId }) => activateConfigSnapshot(agentId, snapshotId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: configSnapshotKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Snapshot activated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to activate snapshot');
    },
  });
};

export const useDiffSnapshots = (
  agentId: string,
  snapshotAId: string | null,
  snapshotBId: string | null,
  enabled = false
) => {
  return useQuery<DiffResponse>({
    queryKey: configSnapshotKeys.diff(agentId, snapshotAId!, snapshotBId!),
    queryFn: () => diffConfigSnapshots(agentId, snapshotAId!, snapshotBId!),
    enabled: enabled && !!agentId && !!snapshotAId && !!snapshotBId,
    staleTime: 60000,
  });
};

export const useRollbackSnapshot = () => {
  const queryClient = useQueryClient();

  return useMutation<ConfigSnapshot, Error, { agentId: string; snapshotId: string }>({
    mutationFn: ({ agentId, snapshotId }) => rollbackConfigSnapshot(agentId, snapshotId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: configSnapshotKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Rolled back to snapshot successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to rollback to snapshot');
    },
  });
};

export type { ConfigSnapshot, ConfigSnapshotListResponse, DiffResponse, CreateSnapshotRequest };
