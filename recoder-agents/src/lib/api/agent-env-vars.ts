import { backendApi } from '@/lib/api-client';

export interface AgentEnvVar {
  id: string;
  agent_id: string;
  key: string;
  value: string;
  is_secret: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertEnvVarData {
  key: string;
  value: string;
  is_secret?: boolean;
  description?: string;
}

export interface BulkEnvVarItem {
  key: string;
  value: string;
  is_secret?: boolean;
  description?: string;
}

export interface BulkEnvVarResponse {
  status: string;
  count: number;
  results: Array<AgentEnvVar | { key: string; error: string }>;
}

export interface ExportEnvVarsResponse {
  content: string;
  count: number;
}

export const listEnvVars = async (agentId: string): Promise<AgentEnvVar[]> => {
  const response = await backendApi.get<AgentEnvVar[]>(
    `/agents/${agentId}/env`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const upsertEnvVar = async (
  agentId: string,
  data: UpsertEnvVarData
): Promise<AgentEnvVar> => {
  const response = await backendApi.post<AgentEnvVar>(
    `/agents/${agentId}/env`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteEnvVar = async (
  agentId: string,
  key: string
): Promise<void> => {
  const response = await backendApi.delete(`/agents/${agentId}/env/${encodeURIComponent(key)}`);
  if (response.error) throw new Error(response.error.message);
};

export const bulkSetEnvVars = async (
  agentId: string,
  variables: BulkEnvVarItem[]
): Promise<BulkEnvVarResponse> => {
  const response = await backendApi.post<BulkEnvVarResponse>(
    `/agents/${agentId}/env/bulk`,
    { variables }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const exportEnvVars = async (
  agentId: string
): Promise<ExportEnvVarsResponse> => {
  const response = await backendApi.get<ExportEnvVarsResponse>(
    `/agents/${agentId}/env/export`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
