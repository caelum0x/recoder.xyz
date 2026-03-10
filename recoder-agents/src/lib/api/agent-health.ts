import { backendApi } from '../api-client';

export interface HealthScore {
  id: string;
  user_id: string;
  agent_id: string;
  overall_score: number | null;
  reliability_score: number | null;
  performance_score: number | null;
  cost_efficiency_score: number | null;
  user_satisfaction_score: number | null;
  factors: Record<string, any>;
  calculated_at: string | null;
  message?: string;
}

export interface HealthHistoryResponse {
  agent_id: string;
  history: HealthScore[];
  count: number;
}

export interface HealthOverviewResponse {
  agents: HealthScore[];
  total: number;
}

export const getAgentHealth = async (agentId: string): Promise<HealthScore> => {
  const response = await backendApi.get<HealthScore>(
    `/agents/${agentId}/health`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch health score: ${response.error.message}`);
  }

  return response.data!;
};

export const calculateAgentHealth = async (agentId: string): Promise<HealthScore> => {
  const response = await backendApi.post<HealthScore>(
    `/agents/${agentId}/health/calculate`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to calculate health score: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentHealthHistory = async (
  agentId: string,
  limit: number = 30
): Promise<HealthHistoryResponse> => {
  const response = await backendApi.get<HealthHistoryResponse>(
    `/agents/${agentId}/health/history?limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch health history: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentsHealthOverview = async (): Promise<HealthOverviewResponse> => {
  const response = await backendApi.get<HealthOverviewResponse>(
    `/agents/health/overview`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch health overview: ${response.error.message}`);
  }

  return response.data!;
};
