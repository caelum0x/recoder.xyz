import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyUsageEntry {
  date: string;
  run_count: number;
  token_count: number;
  cost: number;
  error_count: number;
  agent_id: string | null;
}

export interface DailyUsageResponse {
  days: number;
  entries: DailyUsageEntry[];
  total: number;
}

export interface UsageSummary {
  period_start: string;
  period_end: string;
  runs_used: number;
  runs_limit: number | null;
  runs_pct: number;
  tokens_used: number;
  tokens_limit: number | null;
  tokens_pct: number;
  cost_used: number;
  cost_limit: number | null;
  cost_pct: number;
}

export interface UsageForecast {
  period_start: string;
  period_end: string;
  days_elapsed: number;
  days_remaining: number;
  current_runs: number;
  projected_runs: number;
  runs_limit: number | null;
  runs_over_limit: boolean;
  current_tokens: number;
  projected_tokens: number;
  tokens_limit: number | null;
  tokens_over_limit: boolean;
  current_cost: number;
  projected_cost: number;
  cost_limit: number | null;
  cost_over_limit: boolean;
}

export interface TopConsumer {
  agent_id: string;
  agent_name: string | null;
  run_count: number;
  token_count: number;
  cost: number;
  pct_of_total: number;
}

export interface TopConsumersResponse {
  metric: string;
  consumers: TopConsumer[];
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const getQuotaUsageDaily = async (
  days: number = 30,
  agentId?: string
): Promise<DailyUsageResponse> => {
  const params = new URLSearchParams({ days: String(days) });
  if (agentId) params.set('agent_id', agentId);

  const response = await backendApi.get<DailyUsageResponse>(
    `/quota/usage/daily?${params.toString()}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch daily usage: ${response.error.message}`);
  }

  return response.data!;
};

export const getQuotaUsageSummary = async (): Promise<UsageSummary> => {
  const response = await backendApi.get<UsageSummary>(
    '/quota/usage/summary',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch usage summary: ${response.error.message}`);
  }

  return response.data!;
};

export const getQuotaForecast = async (): Promise<UsageForecast> => {
  const response = await backendApi.get<UsageForecast>(
    '/quota/forecast',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch forecast: ${response.error.message}`);
  }

  return response.data!;
};

export const getTopConsumers = async (
  metric: 'runs' | 'tokens' | 'cost' = 'runs',
  limit: number = 10
): Promise<TopConsumersResponse> => {
  const response = await backendApi.get<TopConsumersResponse>(
    `/quota/top-consumers?metric=${metric}&limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch top consumers: ${response.error.message}`);
  }

  return response.data!;
};
