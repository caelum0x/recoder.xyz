import { backendApi } from '@/lib/api-client';

export type SecretType = 'api_key' | 'token' | 'password' | 'certificate' | 'other';

export interface AgentSecret {
  id: string;
  user_id: string;
  agent_id: string | null;
  secret_name: string;
  secret_value: string;
  description: string | null;
  secret_type: SecretType;
  is_active: boolean;
  expires_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
}

export interface SecretAccessLog {
  id: string;
  secret_id: string;
  user_id: string;
  accessed_at: string;
  access_reason: string | null;
  ip_address: string | null;
}

export interface CreateSecretData {
  secret_name: string;
  secret_value: string;
  description?: string;
  secret_type?: SecretType;
  agent_id?: string;
  expires_at?: string;
}

export interface UpdateSecretData {
  secret_name?: string;
  description?: string;
  secret_type?: SecretType;
  is_active?: boolean;
  expires_at?: string;
  secret_value?: string;
}

export interface SecretStats {
  total: number;
  active: number;
  expired: number;
  most_accessed: string | null;
}

export const listSecrets = async (agentId?: string): Promise<AgentSecret[]> => {
  const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const response = await backendApi.get<AgentSecret[]>(`/secrets${qs}`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createSecret = async (data: CreateSecretData): Promise<AgentSecret> => {
  const response = await backendApi.post<AgentSecret>('/secrets', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSecret = async (secretId: string): Promise<AgentSecret> => {
  const response = await backendApi.get<AgentSecret>(`/secrets/${secretId}`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const revealSecret = async (secretId: string): Promise<AgentSecret> => {
  const response = await backendApi.get<AgentSecret>(`/secrets/${secretId}/reveal`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateSecret = async (secretId: string, data: UpdateSecretData): Promise<AgentSecret> => {
  const response = await backendApi.patch<AgentSecret>(`/secrets/${secretId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteSecret = async (secretId: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete(`/secrets/${secretId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean };
};

export const getSecretAccessLog = async (secretId: string): Promise<SecretAccessLog[]> => {
  const response = await backendApi.get<SecretAccessLog[]>(`/secrets/${secretId}/access-log`, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSecretStats = async (): Promise<SecretStats> => {
  const response = await backendApi.get<SecretStats>('/secrets/stats', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
