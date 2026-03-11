import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface AgentQuota {
  id: string;
  user_id: string;
  agent_id: string;
  resource_type: 'runs_per_day' | 'runs_per_hour' | 'max_tokens' | 'max_cost_daily' | 'max_concurrent' | 'max_duration_seconds';
  quota_value: number;
  current_usage: number;
  is_active: boolean;
  last_reset_at: string;
  created_at: string;
  usage_pct: number;
}

export interface SetQuotaData {
  resource_type: string;
  quota_value: number;
}

export interface CheckQuotaResult {
  allowed: boolean;
  current_usage: number;
  quota_value: number | null;
  remaining: number | null;
  message: string;
}

export interface RecordUsageResult {
  success: boolean;
  current_usage: number;
  quota_value: number;
  is_violation: boolean;
}

export interface QuotaViolation {
  id: string;
  quota_id: string;
  user_id: string;
  agent_id: string;
  attempted_value: number;
  quota_value: number;
  violated_at: string;
  resource_type: string;
}

// ============================================================================
// API Functions
// ============================================================================

export const getAgentQuotas = async (agentId: string): Promise<AgentQuota[]> => {
  const response = await backendApi.get<AgentQuota[]>(
    `/agents/${agentId}/quotas`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch agent quotas: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const setAgentQuota = async (
  agentId: string,
  data: SetQuotaData
): Promise<AgentQuota> => {
  const response = await backendApi.post<AgentQuota>(
    `/agents/${agentId}/quotas`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to set agent quota: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteAgentQuota = async (
  agentId: string,
  quotaId: string
): Promise<{ success: boolean }> => {
  const response = await backendApi.delete<{ success: boolean }>(
    `/agents/${agentId}/quotas/${quotaId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete agent quota: ${response.error.message}`);
  }

  return response.data!;
};

export const checkAgentQuota = async (
  agentId: string,
  data: { resource_type: string; requested_amount: number }
): Promise<CheckQuotaResult> => {
  const response = await backendApi.post<CheckQuotaResult>(
    `/agents/${agentId}/quotas/check`,
    data,
    { showErrors: false }
  );

  if (response.error) {
    throw new Error(`Failed to check quota: ${response.error.message}`);
  }

  return response.data!;
};

export const recordAgentUsage = async (
  agentId: string,
  data: { resource_type: string; amount: number }
): Promise<RecordUsageResult> => {
  const response = await backendApi.post<RecordUsageResult>(
    `/agents/${agentId}/quotas/record-usage`,
    data,
    { showErrors: false }
  );

  if (response.error) {
    throw new Error(`Failed to record usage: ${response.error.message}`);
  }

  return response.data!;
};

export const resetAgentQuotas = async (
  agentId: string
): Promise<{ success: boolean; reset_count: number }> => {
  const response = await backendApi.post<{ success: boolean; reset_count: number }>(
    `/agents/${agentId}/quotas/reset`,
    undefined,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to reset quotas: ${response.error.message}`);
  }

  return response.data!;
};

export const getQuotaViolations = async (
  agentId?: string,
  limit: number = 50
): Promise<QuotaViolation[]> => {
  const params = new URLSearchParams();
  if (agentId) params.set('agent_id', agentId);
  if (limit) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/agents/quotas/violations${query ? `?${query}` : ''}`;

  const response = await backendApi.get<QuotaViolation[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch quota violations: ${response.error.message}`);
  }

  return response.data ?? [];
};
