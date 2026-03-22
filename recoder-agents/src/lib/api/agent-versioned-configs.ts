import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface ConfigSnapshot {
  id: string;
  user_id: string;
  agent_id: string;
  version_number: number;
  label: string | null;
  config: Record<string, any>;
  change_summary: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface ConfigSnapshotListResponse {
  snapshots: ConfigSnapshot[];
  total: number;
}

export interface DiffEntry {
  key: string;
  type: 'added' | 'removed' | 'changed';
  old_value?: any;
  new_value?: any;
}

export interface DiffResponse {
  snapshot_a_id: string;
  snapshot_b_id: string;
  differences: DiffEntry[];
}

export interface CreateSnapshotRequest {
  label?: string;
  config: Record<string, any>;
  change_summary?: string;
}

// ============================================================================
// API Functions
// ============================================================================

export const listConfigSnapshots = async (
  agentId: string,
  limit = 50
): Promise<ConfigSnapshotListResponse> => {
  const response = await backendApi.get<ConfigSnapshotListResponse>(
    `/agents/${agentId}/config-snapshots?limit=${limit}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to list config snapshots: ${response.error.message}`);
  }

  return response.data!;
};

export const getConfigSnapshotDetail = async (
  agentId: string,
  snapshotId: string
): Promise<ConfigSnapshot> => {
  const response = await backendApi.get<ConfigSnapshot>(
    `/agents/${agentId}/config-snapshots/${snapshotId}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get config snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const createConfigSnapshot = async (
  agentId: string,
  data: CreateSnapshotRequest
): Promise<ConfigSnapshot> => {
  const response = await backendApi.post<ConfigSnapshot>(
    `/agents/${agentId}/config-snapshots`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create config snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const activateConfigSnapshot = async (
  agentId: string,
  snapshotId: string
): Promise<{ success: boolean; activated_snapshot_id: string }> => {
  const response = await backendApi.post<{ success: boolean; activated_snapshot_id: string }>(
    `/agents/${agentId}/config-snapshots/${snapshotId}/activate`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to activate config snapshot: ${response.error.message}`);
  }

  return response.data!;
};

export const diffConfigSnapshots = async (
  agentId: string,
  snapshotAId: string,
  snapshotBId: string
): Promise<DiffResponse> => {
  const response = await backendApi.post<DiffResponse>(
    `/agents/${agentId}/config-snapshots/diff`,
    { snapshot_a_id: snapshotAId, snapshot_b_id: snapshotBId },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to diff config snapshots: ${response.error.message}`);
  }

  return response.data!;
};

export const rollbackConfigSnapshot = async (
  agentId: string,
  snapshotId: string
): Promise<ConfigSnapshot> => {
  const response = await backendApi.post<ConfigSnapshot>(
    `/agents/${agentId}/config-snapshots/${snapshotId}/rollback`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to rollback config snapshot: ${response.error.message}`);
  }

  return response.data!;
};
