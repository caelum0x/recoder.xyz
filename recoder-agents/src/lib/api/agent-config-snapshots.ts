import { backendApi } from '@/lib/api-client';

export interface ConfigSnapshot {
  id: string;
  user_id: string;
  agent_id: string;
  snapshot_name: string;
  description: string | null;
  config_data: Record<string, any>;
  tags: string[];
  is_pinned: boolean;
  restored_count: number;
  created_at: string;
}

export interface SnapshotRestoreLog {
  id: string;
  snapshot_id: string;
  user_id: string;
  agent_id: string;
  restored_at: string;
  notes: string | null;
}

export interface CreateSnapshotData {
  snapshot_name: string;
  description?: string;
  config_data: Record<string, any>;
  tags?: string[];
}

export interface UpdateSnapshotData {
  snapshot_name?: string;
  description?: string;
  tags?: string[];
  is_pinned?: boolean;
}

export interface SnapshotStats {
  total_snapshots: number;
  pinned_count: number;
  most_restored: Pick<ConfigSnapshot, 'id' | 'snapshot_name' | 'restored_count'> | null;
}

export const listSnapshots = async (
  agentId: string,
  options?: { pinnedOnly?: boolean; limit?: number }
): Promise<ConfigSnapshot[]> => {
  const params = new URLSearchParams();
  if (options?.pinnedOnly) params.set('pinned_only', 'true');
  if (options?.limit) params.set('limit', String(options.limit));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<ConfigSnapshot[]>(
    `/agents/${agentId}/snapshots${qs}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to list snapshots: ${response.error.message}`);
  }

  return response.data!;
};

export const createSnapshot = async (
  agentId: string,
  data: CreateSnapshotData
): Promise<ConfigSnapshot> => {
  const response = await backendApi.post<ConfigSnapshot>(
    `/agents/${agentId}/snapshots`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const getSnapshot = async (
  agentId: string,
  snapshotId: string
): Promise<ConfigSnapshot & { restore_log: SnapshotRestoreLog[] }> => {
  const response = await backendApi.get<ConfigSnapshot & { restore_log: SnapshotRestoreLog[] }>(
    `/agents/${agentId}/snapshots/${snapshotId}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const updateSnapshot = async (
  agentId: string,
  snapshotId: string,
  data: UpdateSnapshotData
): Promise<ConfigSnapshot> => {
  const response = await backendApi.patch<ConfigSnapshot>(
    `/agents/${agentId}/snapshots/${snapshotId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteSnapshot = async (
  agentId: string,
  snapshotId: string
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/agents/${agentId}/snapshots/${snapshotId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const restoreSnapshot = async (
  agentId: string,
  snapshotId: string,
  notes?: string
): Promise<{ snapshot: ConfigSnapshot; log_entry: SnapshotRestoreLog }> => {
  const response = await backendApi.post<{ snapshot: ConfigSnapshot; log_entry: SnapshotRestoreLog }>(
    `/agents/${agentId}/snapshots/${snapshotId}/restore`,
    { notes },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to restore snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const getRestoreLog = async (
  agentId: string,
  snapshotId: string
): Promise<SnapshotRestoreLog[]> => {
  const response = await backendApi.get<SnapshotRestoreLog[]>(
    `/agents/${agentId}/snapshots/${snapshotId}/restore-log`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch restore log: ${response.error.message}`);
  }

  return response.data!;
};

export const getSnapshotStats = async (agentId: string): Promise<SnapshotStats> => {
  const response = await backendApi.get<SnapshotStats>(
    `/agents/${agentId}/snapshots/stats`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch snapshot stats: ${response.error.message}`);
  }

  return response.data!;
};
