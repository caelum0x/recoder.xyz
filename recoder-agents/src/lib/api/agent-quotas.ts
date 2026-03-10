import { backendApi } from '@/lib/api-client';

export interface AgentQuota {
  id: string;
  user_id: string;
  agent_id: string;
  max_runs_per_day: number | null;
  max_tokens_per_day: number | null;
  max_cost_per_day: number | null;
  max_runs_per_month: number | null;
  max_tokens_per_month: number | null;
  max_cost_per_month: number | null;
  alert_threshold_pct: number;
  is_enforced: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuotaUsage {
  runs_today: number;
  tokens_today: number;
  cost_today: number;
  runs_month: number;
  tokens_month: number;
  cost_month: number;
  daily_runs_pct: number | null;
  daily_tokens_pct: number | null;
  daily_cost_pct: number | null;
  monthly_runs_pct: number | null;
  monthly_tokens_pct: number | null;
  monthly_cost_pct: number | null;
}

export interface AgentQuotaResponse {
  quota: AgentQuota | null;
  usage: QuotaUsage;
}

export interface QuotaOverviewItem {
  agent_id: string;
  agent_name: string;
  max_runs_per_day: number | null;
  max_tokens_per_day: number | null;
  max_cost_per_day: number | null;
  max_runs_per_month: number | null;
  max_tokens_per_month: number | null;
  max_cost_per_month: number | null;
  alert_threshold_pct: number | null;
  is_enforced: boolean | null;
  runs_today: number;
  tokens_today: number;
  cost_today: number;
  runs_month: number;
  tokens_month: number;
  cost_month: number;
  daily_runs_pct: number | null;
  daily_tokens_pct: number | null;
  daily_cost_pct: number | null;
  monthly_runs_pct: number | null;
  monthly_tokens_pct: number | null;
  monthly_cost_pct: number | null;
  has_quota: boolean;
}

export interface QuotaAlertItem {
  metric: string;
  period: string;
  current: number;
  limit: number;
  pct: number;
  exceeded: boolean;
}

export interface QuotaAlert {
  agent_id: string;
  agent_name: string;
  is_enforced: boolean;
  alert_threshold_pct: number;
  alerts: QuotaAlertItem[];
}

export interface UpsertQuotaData {
  max_runs_per_day?: number | null;
  max_tokens_per_day?: number | null;
  max_cost_per_day?: number | null;
  max_runs_per_month?: number | null;
  max_tokens_per_month?: number | null;
  max_cost_per_month?: number | null;
  alert_threshold_pct?: number;
  is_enforced?: boolean;
}

export const getAgentQuota = async (agentId: string): Promise<AgentQuotaResponse> => {
  const response = await backendApi.get<AgentQuotaResponse>(
    `/agents/${agentId}/quota`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAgentQuota = async (
  agentId: string,
  data: UpsertQuotaData
): Promise<AgentQuota> => {
  const response = await backendApi.put<AgentQuota>(
    `/agents/${agentId}/quota`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAgentQuota = async (agentId: string) => {
  const response = await backendApi.delete(`/agents/${agentId}/quota`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getQuotasOverview = async (): Promise<QuotaOverviewItem[]> => {
  const response = await backendApi.get<QuotaOverviewItem[]>(
    `/agents/quotas/overview`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getQuotaAlerts = async (): Promise<QuotaAlert[]> => {
  const response = await backendApi.get<QuotaAlert[]>(
    `/agents/quotas/alerts`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
