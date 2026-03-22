'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listHealthChecks,
  createHealthCheck,
  updateHealthCheck,
  deleteHealthCheck,
  runHealthCheck,
  getHealthResults,
  getUptimeSummary,
  getHealthOverview,
  type HealthCheckConfig,
  type HealthCheckResult,
  type UptimeSummary,
  type CreateHealthCheckData,
} from '@/lib/api/agent-health-checks';

const HEALTH_CHECKS_KEY = (agentId: string) => ['health-checks', agentId] as const;
const HEALTH_RESULTS_KEY = (agentId: string, configId: string) =>
  ['health-results', agentId, configId] as const;
const UPTIME_KEY = (agentId: string) => ['uptime', agentId] as const;
const HEALTH_OVERVIEW_KEY = ['health-overview'] as const;

export function useHealthChecks(agentId: string) {
  return useQuery<HealthCheckConfig[]>({
    queryKey: HEALTH_CHECKS_KEY(agentId),
    queryFn: () => listHealthChecks(agentId),
    staleTime: 30_000,
    enabled: !!agentId,
  });
}

export function useCreateHealthCheck(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<HealthCheckConfig, Error, CreateHealthCheckData>({
    mutationFn: (data) => createHealthCheck(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEALTH_CHECKS_KEY(agentId) });
    },
  });
}

export function useUpdateHealthCheck(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    HealthCheckConfig,
    Error,
    { configId: string; data: Partial<CreateHealthCheckData> & { is_active?: boolean } }
  >({
    mutationFn: ({ configId, data }) => updateHealthCheck(agentId, configId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEALTH_CHECKS_KEY(agentId) });
    },
  });
}

export function useDeleteHealthCheck(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (configId) => deleteHealthCheck(agentId, configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEALTH_CHECKS_KEY(agentId) });
    },
  });
}

export function useRunHealthCheck(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<HealthCheckResult, Error, string>({
    mutationFn: (configId) => runHealthCheck(agentId, configId),
    onSuccess: (_, configId) => {
      queryClient.invalidateQueries({ queryKey: HEALTH_RESULTS_KEY(agentId, configId) });
      queryClient.invalidateQueries({ queryKey: UPTIME_KEY(agentId) });
      queryClient.invalidateQueries({ queryKey: HEALTH_OVERVIEW_KEY });
      queryClient.invalidateQueries({ queryKey: HEALTH_CHECKS_KEY(agentId) });
    },
  });
}

export function useHealthResults(
  agentId: string,
  configId: string,
  options?: { limit?: number; status?: string }
) {
  return useQuery<HealthCheckResult[]>({
    queryKey: [...HEALTH_RESULTS_KEY(agentId, configId), options ?? {}],
    queryFn: () => getHealthResults(agentId, configId, options),
    staleTime: 15_000,
    enabled: !!agentId && !!configId,
  });
}

export function useUptimeSummary(agentId: string) {
  return useQuery<UptimeSummary>({
    queryKey: UPTIME_KEY(agentId),
    queryFn: () => getUptimeSummary(agentId),
    staleTime: 30_000,
    enabled: !!agentId,
  });
}

export function useHealthOverview() {
  return useQuery<UptimeSummary[]>({
    queryKey: HEALTH_OVERVIEW_KEY,
    queryFn: () => getHealthOverview(),
    staleTime: 30_000,
  });
}
