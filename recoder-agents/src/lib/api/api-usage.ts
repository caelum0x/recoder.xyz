import { backendApi } from '../api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyUsageStats {
  date: string;
  request_count: number;
  error_count: number;
  total_tokens: number;
  avg_response_time_ms: number;
}

export interface RecentRequest {
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  tokens_used: number;
  timestamp: string;
}

export interface UsageSummary {
  total_requests: number;
  total_errors: number;
  error_rate: number;
  avg_response_time: number;
  total_tokens: number;
  active_keys: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getKeyUsage = async (keyId: string, days?: number): Promise<DailyUsageStats[]> => {
  const query = days ? `?days=${days}` : '';
  const response = await backendApi.get<DailyUsageStats[]>(
    `/api-keys/${keyId}/usage${query}`,
    { showErrors: false },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getKeyRecentUsage = async (keyId: string): Promise<RecentRequest[]> => {
  const response = await backendApi.get<RecentRequest[]>(
    `/api-keys/${keyId}/usage/recent`,
    { showErrors: false },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getUsageSummary = async (): Promise<UsageSummary> => {
  const response = await backendApi.get<UsageSummary>(
    '/api-keys/usage/summary',
    { showErrors: false },
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
