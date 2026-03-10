import { backendApi } from '../api-client';
import type { AgentVersion } from '@/hooks/agents/utils';

export interface VersionComparisonDifference {
  field: string;
  type: 'added' | 'removed' | 'modified';
  old_value?: any;
  new_value?: any;
}

export interface VersionComparisonResponse {
  version1: AgentVersion;
  version2: AgentVersion;
  differences: VersionComparisonDifference[];
}

export const getAgentVersions = async (agentId: string): Promise<AgentVersion[]> => {
  const response = await backendApi.get<AgentVersion[]>(
    `/agents/${agentId}/versions`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch versions: ${response.error.message}`);
  }

  return response.data!;
};

export const getVersionComparison = async (
  agentId: string,
  v1Id: string,
  v2Id: string
): Promise<VersionComparisonResponse> => {
  const response = await backendApi.get<VersionComparisonResponse>(
    `/agents/${agentId}/versions/${v1Id}/compare/${v2Id}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to compare versions: ${response.error.message}`);
  }

  return response.data!;
};

export const rollbackToVersion = async (
  agentId: string,
  versionId: string
): Promise<AgentVersion> => {
  const response = await backendApi.post<AgentVersion>(
    `/agents/${agentId}/versions/${versionId}/rollback`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to rollback version: ${response.error.message}`);
  }

  return response.data!;
};

export const activateVersion = async (
  agentId: string,
  versionId: string
): Promise<void> => {
  const response = await backendApi.put<{ message: string }>(
    `/agents/${agentId}/versions/${versionId}/activate`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to activate version: ${response.error.message}`);
  }
};

export const updateVersionDetails = async (
  agentId: string,
  versionId: string,
  data: { version_name?: string; change_description?: string }
): Promise<AgentVersion> => {
  const response = await backendApi.put<AgentVersion>(
    `/agents/${agentId}/versions/${versionId}/details`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update version details: ${response.error.message}`);
  }

  return response.data!;
};


// ============================================================================
// Config Snapshot Versioning (Sprint 46)
// ============================================================================

export interface ConfigVersion {
  id: string;
  user_id: string;
  agent_id: string;
  version_number: number;
  name: string | null;
  description: string | null;
  config_snapshot: Record<string, any>;
  created_at: string;
}

export interface ConfigVersionListResponse {
  versions: ConfigVersion[];
  total: number;
}

export interface ConfigVersionDiffField {
  field: string;
  type: 'added' | 'removed' | 'modified';
  old_value?: any;
  new_value?: any;
}

export interface ConfigVersionDiffResponse {
  from_version: number;
  to_version: number;
  differences: ConfigVersionDiffField[];
}

export const listConfigVersions = async (
  agentId: string,
  limit = 50,
  offset = 0
): Promise<ConfigVersionListResponse> => {
  const response = await backendApi.get<ConfigVersionListResponse>(
    `/agents/${agentId}/config-versions?limit=${limit}&offset=${offset}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to list config versions: ${response.error.message}`);
  }

  return response.data!;
};

export const getConfigVersion = async (
  agentId: string,
  versionNumber: number
): Promise<ConfigVersion> => {
  const response = await backendApi.get<ConfigVersion>(
    `/agents/${agentId}/config-versions/${versionNumber}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to get config version: ${response.error.message}`);
  }

  return response.data!;
};

export const createConfigVersion = async (
  agentId: string,
  data: { name?: string; description?: string }
): Promise<ConfigVersion> => {
  const response = await backendApi.post<ConfigVersion>(
    `/agents/${agentId}/config-versions`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create config version: ${response.error.message}`);
  }

  return response.data!;
};

export const restoreConfigVersion = async (
  agentId: string,
  versionNumber: number
): Promise<ConfigVersion> => {
  const response = await backendApi.post<ConfigVersion>(
    `/agents/${agentId}/config-versions/${versionNumber}/restore`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to restore config version: ${response.error.message}`);
  }

  return response.data!;
};

export const diffConfigVersions = async (
  agentId: string,
  fromVersion: number,
  toVersion: number
): Promise<ConfigVersionDiffResponse> => {
  const response = await backendApi.get<ConfigVersionDiffResponse>(
    `/agents/${agentId}/config-versions/diff?from_version=${fromVersion}&to_version=${toVersion}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to diff config versions: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteConfigVersion = async (
  agentId: string,
  versionNumber: number
): Promise<{ deleted: boolean; version_number: number }> => {
  const response = await backendApi.delete<{ deleted: boolean; version_number: number }>(
    `/agents/${agentId}/config-versions/${versionNumber}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete config version: ${response.error.message}`);
  }

  return response.data!;
};
