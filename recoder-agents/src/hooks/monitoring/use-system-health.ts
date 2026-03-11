'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  runHealthCheck,
  getHealthStatus,
  getHealthHistory,
  getServiceUptime,
  type HealthCheckResponse,
  type HealthStatusResponse,
  type HealthHistoryResponse,
  type UptimeResponse,
} from '@/lib/api/system-health';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const systemHealthKeys = {
  all: ['system-health'] as const,
  status: () => [...systemHealthKeys.all, 'status'] as const,
  history: (serviceName?: string, hours?: number) =>
    [...systemHealthKeys.all, 'history', serviceName, hours] as const,
  uptime: () => [...systemHealthKeys.all, 'uptime'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Run a health check against all core services.
 * Returns a mutation that triggers the check on demand.
 */
export function useRunHealthCheck() {
  const queryClient = useQueryClient();

  return useMutation<HealthCheckResponse, Error>({
    mutationFn: () => runHealthCheck(),
    onSuccess: () => {
      // Invalidate all health-related queries after a fresh check
      queryClient.invalidateQueries({ queryKey: systemHealthKeys.all });
    },
  });
}

/**
 * Fetch the latest health status for all services.
 * Polls every 60 seconds by default.
 */
export function useHealthStatus(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<HealthStatusResponse>({
    queryKey: systemHealthKeys.status(),
    queryFn: getHealthStatus,
    refetchInterval: options?.refetchInterval ?? 60_000,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch health history for charting.
 * Filterable by service name and time window (hours).
 */
export function useHealthHistory(
  serviceName?: string,
  hours: number = 24,
  options?: { enabled?: boolean }
) {
  return useQuery<HealthHistoryResponse>({
    queryKey: systemHealthKeys.history(serviceName, hours),
    queryFn: () => getHealthHistory(serviceName, hours),
    staleTime: 30_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch uptime percentages per service (last 30 days).
 */
export function useServiceUptime(options?: { enabled?: boolean }) {
  return useQuery<UptimeResponse>({
    queryKey: systemHealthKeys.uptime(),
    queryFn: getServiceUptime,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
