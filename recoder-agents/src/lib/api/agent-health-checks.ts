import { backendApi } from '@/lib/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface HealthCheckConfig {
  id: string;
  user_id: string;
  agent_id: string;
  check_name: string;
  check_type: 'ping' | 'api_call' | 'response_quality' | 'latency';
  check_config: Record<string, unknown>;
  interval_minutes: number;
  timeout_seconds: number;
  failure_threshold: number;
  is_active: boolean;
  created_at: string;
  // enriched from lateral join
  last_status?: string | null;
  last_checked_at?: string | null;
  last_response_time_ms?: number | null;
}

export interface HealthCheckResult {
  id: string;
  config_id: string;
  user_id: string;
  agent_id: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'timeout';
  response_time_ms: number | null;
  error_message: string | null;
  details: Record<string, unknown>;
  checked_at: string;
}

export interface UptimeSummary {
  id?: string;
  user_id?: string;
  agent_id: string;
  uptime_pct: number;
  total_checks: number;
  failed_checks: number;
  avg_response_ms: number;
  last_status: string;
  last_checked_at: string | null;
  updated_at?: string;
}

export interface CreateHealthCheckData {
  check_name: string;
  check_type?: 'ping' | 'api_call' | 'response_quality' | 'latency';
  check_config?: Record<string, unknown>;
  interval_minutes?: number;
  timeout_seconds?: number;
  failure_threshold?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const listHealthChecks = async (agentId: string): Promise<HealthCheckConfig[]> => {
  const response = await backendApi.get<HealthCheckConfig[]>(
    `/agents/${agentId}/health-checks`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createHealthCheck = async (
  agentId: string,
  data: CreateHealthCheckData
): Promise<HealthCheckConfig> => {
  const response = await backendApi.post<HealthCheckConfig>(
    `/agents/${agentId}/health-checks`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateHealthCheck = async (
  agentId: string,
  configId: string,
  data: Partial<CreateHealthCheckData> & { is_active?: boolean }
): Promise<HealthCheckConfig> => {
  const response = await backendApi.patch<HealthCheckConfig>(
    `/agents/${agentId}/health-checks/${configId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteHealthCheck = async (agentId: string, configId: string): Promise<void> => {
  const response = await backendApi.delete(`/agents/${agentId}/health-checks/${configId}`);
  if (response.error) throw new Error(response.error.message);
};

export const runHealthCheck = async (
  agentId: string,
  configId: string
): Promise<HealthCheckResult> => {
  const response = await backendApi.post<HealthCheckResult>(
    `/agents/${agentId}/health-checks/${configId}/run`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getHealthResults = async (
  agentId: string,
  configId: string,
  options?: { limit?: number; status?: string }
): Promise<HealthCheckResult[]> => {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.status) params.set('status', options.status);
  const qs = params.toString();
  const response = await backendApi.get<HealthCheckResult[]>(
    `/agents/${agentId}/health-checks/${configId}/results${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getUptimeSummary = async (agentId: string): Promise<UptimeSummary> => {
  const response = await backendApi.get<UptimeSummary>(
    `/agents/${agentId}/uptime`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getHealthOverview = async (): Promise<UptimeSummary[]> => {
  const response = await backendApi.get<UptimeSummary[]>('/health-overview', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
