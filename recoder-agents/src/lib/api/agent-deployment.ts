import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface DeploymentSlot {
  id: string;
  user_id: string;
  agent_id: string;
  slot_name: 'production' | 'staging' | 'canary' | 'rollback';
  config_snapshot: Record<string, unknown>;
  traffic_percent: number;
  is_active: boolean;
  deployed_at: string;
  deployed_by: string | null;
}

export interface DeploymentHistoryEntry {
  id: string;
  user_id: string;
  agent_id: string;
  slot_name: string;
  action: 'deploy' | 'promote' | 'rollback' | 'deactivate';
  from_config: Record<string, unknown> | null;
  to_config: Record<string, unknown> | null;
  created_at: string;
}

export interface DeployToSlotData {
  slot_name: string;
  config_snapshot: Record<string, unknown>;
  traffic_percent?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const deployToSlot = async (
  agentId: string,
  data: DeployToSlotData
): Promise<DeploymentSlot> => {
  const response = await backendApi.post<DeploymentSlot>(
    `/agents/${agentId}/deploy`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to deploy: ${response.error.message}`);
  }

  return response.data!;
};

export const getDeploymentSlots = async (
  agentId: string
): Promise<DeploymentSlot[]> => {
  const response = await backendApi.get<DeploymentSlot[]>(
    `/agents/${agentId}/slots`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch slots: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const promoteSlot = async (agentId: string): Promise<DeploymentSlot> => {
  const response = await backendApi.post<DeploymentSlot>(
    `/agents/${agentId}/promote`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to promote: ${response.error.message}`);
  }

  return response.data!;
};

export const rollbackSlot = async (agentId: string): Promise<DeploymentSlot> => {
  const response = await backendApi.post<DeploymentSlot>(
    `/agents/${agentId}/rollback`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to rollback: ${response.error.message}`);
  }

  return response.data!;
};

export const updateSlotTraffic = async (
  agentId: string,
  slotName: string,
  trafficPercent: number
): Promise<DeploymentSlot> => {
  const response = await backendApi.patch<DeploymentSlot>(
    `/agents/${agentId}/slots/${slotName}/traffic`,
    { traffic_percent: trafficPercent },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update traffic: ${response.error.message}`);
  }

  return response.data!;
};

export const getDeploymentHistory = async (
  agentId: string,
  limit?: number
): Promise<DeploymentHistoryEntry[]> => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/agents/${agentId}/deployment-history${query ? `?${query}` : ''}`;

  const response = await backendApi.get<DeploymentHistoryEntry[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch deployment history: ${response.error.message}`);
  }

  return response.data ?? [];
};
