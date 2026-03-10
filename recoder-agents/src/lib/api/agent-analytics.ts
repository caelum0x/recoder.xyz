import { backendApi } from '@/lib/api-client';

export interface AnalyticsMetrics {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  average_cost: number;
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  average_duration_seconds: number;
  model_usage: Record<string, number>;
  tool_usage: Record<string, { total: number; success: number; failure: number }>;
  previous_period: {
    total_runs: number;
    success_rate: number;
    average_cost: number;
    total_tokens: number;
  } | null;
}

export interface DailyAnalytics {
  date: string;
  runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  tokens: number;
  cost: number;
}

export const getAgentAnalytics = async (
  agentId: string,
  range: string = '30d'
): Promise<AnalyticsMetrics> => {
  const response = await backendApi.get<AnalyticsMetrics>(
    `/agents/${agentId}/analytics?range=${range}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch analytics: ${response.error.message}`);
  }

  return response.data!;
};

export const getAgentAnalyticsDaily = async (
  agentId: string,
  fromDate: string,
  toDate: string
): Promise<DailyAnalytics[]> => {
  const response = await backendApi.get<DailyAnalytics[]>(
    `/agents/${agentId}/analytics/daily?from_date=${fromDate}&to_date=${toDate}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch daily analytics: ${response.error.message}`);
  }

  return response.data!;
};

export const exportAgentAnalytics = async (agentId: string): Promise<Blob> => {
  const response = await backendApi.get<Blob>(
    `/agents/${agentId}/analytics/export?format=csv`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to export analytics: ${response.error.message}`);
  }

  return response.data!;
};
