import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface ServiceHealth {
  service_name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  response_time_ms: number;
  details: Record<string, any>;
  checked_at: string | null;
}

export interface HealthCheckResponse {
  services: ServiceHealth[];
  overall_status: 'healthy' | 'degraded' | 'down' | 'unknown';
  checked_at: string;
}

export interface HealthStatusResponse {
  services: ServiceHealth[];
  overall_status: 'healthy' | 'degraded' | 'down' | 'unknown';
}

export interface HealthHistoryItem {
  id: string;
  service_name: string;
  status: string;
  response_time_ms: number | null;
  checked_at: string;
}

export interface HealthHistoryResponse {
  history: HealthHistoryItem[];
  count: number;
}

export interface UptimeItem {
  service_name: string;
  uptime_percentage: number;
  total_checks: number;
  healthy_checks: number;
}

export interface UptimeResponse {
  uptimes: UptimeItem[];
}

// ============================================================================
// API Functions
// ============================================================================

export const runHealthCheck = async (): Promise<HealthCheckResponse> => {
  const response = await backendApi.post<HealthCheckResponse>(
    '/health-dashboard/check',
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to run health check: ${response.error.message}`);
  }

  return response.data!;
};

export const getHealthStatus = async (): Promise<HealthStatusResponse> => {
  const response = await backendApi.get<HealthStatusResponse>(
    '/health-dashboard/status',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch health status: ${response.error.message}`);
  }

  return response.data!;
};

export const getHealthHistory = async (
  serviceName?: string,
  hours: number = 24
): Promise<HealthHistoryResponse> => {
  const params = new URLSearchParams();
  if (serviceName) params.set('service_name', serviceName);
  params.set('hours', String(hours));

  const query = params.toString();
  const url = `/health-dashboard/history${query ? `?${query}` : ''}`;

  const response = await backendApi.get<HealthHistoryResponse>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch health history: ${response.error.message}`);
  }

  return response.data!;
};

export const getServiceUptime = async (): Promise<UptimeResponse> => {
  const response = await backendApi.get<UptimeResponse>(
    '/health-dashboard/uptime',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch service uptime: ${response.error.message}`);
  }

  return response.data!;
};
