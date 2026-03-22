import { backendApi } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitEvent {
  id: string;
  user_id: string;
  endpoint: string;
  limit_type: string;
  current_count: number;
  max_allowed: number;
  was_blocked: boolean;
  occurred_at: string;
}

export interface TopEndpointSummary {
  endpoint: string;
  total_hits: number;
  blocked_hits: number;
}

export interface RateLimitSummary {
  total_events: number;
  blocked_count: number;
  allowed_count: number;
  block_rate_pct: number;
  top_endpoints: TopEndpointSummary[];
}

export interface TimelineBucket {
  hour: string;
  total: number;
  blocked: number;
  allowed: number;
}

export interface RateLimitConfig {
  id: string;
  user_id: string;
  endpoint_pattern: string;
  limit_type: string;
  max_allowed: number;
  window_seconds: number;
  is_active: boolean;
  created_at: string;
}

export interface UpdateConfigRequest {
  endpoint_pattern: string;
  limit_type: string;
  max_allowed: number;
  window_seconds: number;
}

export interface EventFilters {
  endpoint?: string;
  blocked_only?: boolean;
  hours?: number;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function getRateLimitEvents(
  filters: EventFilters = {}
): Promise<RateLimitEvent[]> {
  const params = new URLSearchParams();
  if (filters.endpoint) params.set('endpoint', filters.endpoint);
  if (filters.blocked_only) params.set('blocked_only', 'true');
  if (filters.hours) params.set('hours', String(filters.hours));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();

  const response = await backendApi.get<RateLimitEvent[]>(
    `/rate-limits/events${qs ? `?${qs}` : ''}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch rate limit events: ${response.error.message}`);
  }

  return response.data!;
}

export async function getRateLimitSummary(
  hours: number = 24
): Promise<RateLimitSummary> {
  const response = await backendApi.get<RateLimitSummary>(
    `/rate-limits/summary?hours=${hours}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch rate limit summary: ${response.error.message}`);
  }

  return response.data!;
}

export async function getRateLimitTimeline(
  hours: number = 24
): Promise<TimelineBucket[]> {
  const response = await backendApi.get<TimelineBucket[]>(
    `/rate-limits/timeline?hours=${hours}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch rate limit timeline: ${response.error.message}`);
  }

  return response.data!;
}

export async function getRateLimitConfigs(): Promise<RateLimitConfig[]> {
  const response = await backendApi.get<RateLimitConfig[]>(
    '/rate-limits/configs',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch rate limit configs: ${response.error.message}`);
  }

  return response.data!;
}

export async function updateRateLimitConfig(
  data: UpdateConfigRequest
): Promise<RateLimitConfig> {
  const response = await backendApi.put<RateLimitConfig>(
    '/rate-limits/configs',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update rate limit config: ${response.error.message}`);
  }

  return response.data!;
}
