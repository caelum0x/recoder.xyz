'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSnapshots,
  createSnapshot,
  updateSnapshot,
  deleteSnapshot,
  restoreSnapshot,
  getSnapshotStats,
  type ConfigSnapshot,
  type CreateSnapshotData,
  type UpdateSnapshotData,
  type SnapshotStats,
} from '@/lib/api/agent-config-snapshots';

const snapshotsKey = (agentId: string) => ['agent-config-snapshots', agentId] as const;
const statsKey = (agentId: string) => ['agent-config-snapshot-stats', agentId] as const;

export function useSnapshots(
  agentId: string,
  options?: { pinnedOnly?: boolean; limit?: number }
) {
  return useQuery<ConfigSnapshot[]>({
    queryKey: [...snapshotsKey(agentId), options?.pinnedOnly ?? false, options?.limit ?? 50],
    queryFn: () => listSnapshots(agentId, options),
    staleTime: 30_000,
    enabled: !!agentId,
  });
}

export function useSnapshotStats(agentId: string) {
  return useQuery<SnapshotStats>({
    queryKey: statsKey(agentId),
    queryFn: () => getSnapshotStats(agentId),
    staleTime: 30_000,
    enabled: !!agentId,
  });
}

export function useCreateSnapshot(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<ConfigSnapshot, Error, CreateSnapshotData>({
    mutationFn: (data) => createSnapshot(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snapshotsKey(agentId) });
      queryClient.invalidateQueries({ queryKey: statsKey(agentId) });
    },
  });
}

export function useUpdateSnapshot(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<ConfigSnapshot, Error, { snapshotId: string; data: UpdateSnapshotData }>({
    mutationFn: ({ snapshotId, data }) => updateSnapshot(agentId, snapshotId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snapshotsKey(agentId) });
      queryClient.invalidateQueries({ queryKey: statsKey(agentId) });
    },
  });
}

export function useDeleteSnapshot(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (snapshotId) => deleteSnapshot(agentId, snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snapshotsKey(agentId) });
      queryClient.invalidateQueries({ queryKey: statsKey(agentId) });
    },
  });
}

export function useRestoreSnapshot(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { snapshot: ConfigSnapshot; log_entry: { id: string; restored_at: string; notes: string | null } },
    Error,
    { snapshotId: string; notes?: string }
  >({
    mutationFn: ({ snapshotId, notes }) => restoreSnapshot(agentId, snapshotId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snapshotsKey(agentId) });
      queryClient.invalidateQueries({ queryKey: statsKey(agentId) });
    },
  });
}
