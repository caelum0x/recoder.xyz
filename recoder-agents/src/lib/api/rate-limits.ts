import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface KeyUsage {
  key_id: string;
  requests_current_minute: number;
  requests_current_day: number;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  minute_usage_pct: number;
  day_usage_pct: number;
}

export interface UsageResponse {
  keys: KeyUsage[];
}

export interface HourlyBucket {
  hour: string;
  request_count: number;
  rate_limited_count: number;
}

export interface HistoryResponse {
  buckets: HourlyBucket[];
  total_requests: number;
}

export interface Violation {
  id: string;
  key_id: string | null;
  endpoint: string;
  method: string;
  request_timestamp: string;
}

export interface ViolationsResponse {
  violations: Violation[];
  total: number;
}

export interface TopEndpoint {
  endpoint: string;
  method: string;
  request_count: number;
  rate_limited_count: number;
}

export interface TopEndpointsResponse {
  endpoints: TopEndpoint[];
}

// ============================================================================
// API Functions
// ============================================================================

export async function getRateLimitUsage(): Promise<UsageResponse> {
  try {
    const response = await backendApi.get<UsageResponse>(
      '/rate-limits/usage',
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get rate limit usage', resource: 'rate-limits' });
    throw error;
  }
}

export async function getRateLimitHistory(
  keyId?: string,
  hours: number = 24,
): Promise<HistoryResponse> {
  try {
    const params = new URLSearchParams();
    if (keyId) params.set('key_id', keyId);
    params.set('hours', String(hours));
    const qs = params.toString();

    const response = await backendApi.get<HistoryResponse>(
      `/rate-limits/history${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get rate limit history', resource: 'rate-limits' });
    throw error;
  }
}

export async function getRateLimitViolations(
  keyId?: string,
  limit: number = 50,
): Promise<ViolationsResponse> {
  try {
    const params = new URLSearchParams();
    if (keyId) params.set('key_id', keyId);
    params.set('limit', String(limit));
    const qs = params.toString();

    const response = await backendApi.get<ViolationsResponse>(
      `/rate-limits/violations${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get rate limit violations', resource: 'rate-limits' });
    throw error;
  }
}

export async function getTopEndpoints(
  keyId?: string,
  limit: number = 20,
): Promise<TopEndpointsResponse> {
  try {
    const params = new URLSearchParams();
    if (keyId) params.set('key_id', keyId);
    params.set('limit', String(limit));
    const qs = params.toString();

    const response = await backendApi.get<TopEndpointsResponse>(
      `/rate-limits/top-endpoints${qs ? `?${qs}` : ''}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get top endpoints', resource: 'rate-limits' });
    throw error;
  }
}
