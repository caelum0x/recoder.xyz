import { backendApi } from '@/lib/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface IntegrationEndpoint {
  id: string;
  user_id: string;
  endpoint_name: string;
  endpoint_url: string;
  integration_type: 'webhook' | 'api' | 'oauth' | 'database' | 'stream';
  check_interval_minutes: number;
  timeout_seconds: number;
  expected_status_code: number;
  auth_header: string | null;
  is_active: boolean;
  created_at: string;
}

export interface IntegrationHealthCheck {
  id: string;
  endpoint_id: string;
  user_id: string;
  status: 'healthy' | 'degraded' | 'down' | 'timeout';
  response_time_ms: number | null;
  status_code: number | null;
  error_message: string | null;
  checked_at: string;
}

export interface IntegrationUptime {
  id: string;
  user_id: string;
  endpoint_id: string;
  uptime_pct: number;
  total_checks: number;
  failed_checks: number;
  avg_response_ms: number;
  last_status: string;
  updated_at: string;
}

export interface RegisterEndpointData {
  endpoint_name: string;
  endpoint_url: string;
  integration_type?: 'webhook' | 'api' | 'oauth' | 'database' | 'stream';
  check_interval_minutes?: number;
  timeout_seconds?: number;
  expected_status_code?: number;
  auth_header?: string;
  is_active?: boolean;
}

export interface IntegrationOverview extends IntegrationEndpoint {
  uptime_pct: number;
  total_checks: number;
  failed_checks: number;
  avg_response_ms: number;
  last_status: string;
  last_checked_at: string | null;
}

export interface IntegrationStats {
  total_endpoints: number;
  healthy_count: number;
  degraded_count: number;
  down_count: number;
  overall_avg_uptime: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function listEndpoints(): Promise<IntegrationEndpoint[]> {
  const response = await backendApi.get<IntegrationEndpoint[]>('/integrations/endpoints', {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function registerEndpoint(data: RegisterEndpointData): Promise<IntegrationEndpoint> {
  const response = await backendApi.post<IntegrationEndpoint>('/integrations/endpoints', data, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function updateEndpoint(
  id: string,
  data: Partial<RegisterEndpointData>
): Promise<IntegrationEndpoint> {
  const response = await backendApi.patch<IntegrationEndpoint>(
    `/integrations/endpoints/${id}`,
    data,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function deleteEndpoint(id: string): Promise<void> {
  const response = await backendApi.delete<{ deleted: boolean }>(`/integrations/endpoints/${id}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
}

export async function checkEndpoint(id: string): Promise<IntegrationHealthCheck> {
  const response = await backendApi.post<IntegrationHealthCheck>(
    `/integrations/endpoints/${id}/check`,
    {},
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getEndpointHistory(
  id: string,
  limit = 50
): Promise<IntegrationHealthCheck[]> {
  const response = await backendApi.get<IntegrationHealthCheck[]>(
    `/integrations/endpoints/${id}/history?limit=${limit}`,
    { showErrors: true, cache: 'no-store' }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getIntegrationOverview(): Promise<IntegrationOverview[]> {
  const response = await backendApi.get<IntegrationOverview[]>('/integrations/overview', {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getIntegrationStats(): Promise<IntegrationStats> {
  const response = await backendApi.get<IntegrationStats>('/integrations/stats', {
    showErrors: true,
    cache: 'no-store',
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
