'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEndpoints,
  registerEndpoint,
  updateEndpoint,
  deleteEndpoint,
  checkEndpoint,
  getEndpointHistory,
  getIntegrationOverview,
  getIntegrationStats,
  type IntegrationEndpoint,
  type IntegrationHealthCheck,
  type IntegrationOverview,
  type IntegrationStats,
  type RegisterEndpointData,
} from '@/lib/api/integration-health';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const integrationHealthKeys = {
  all: ['integration-health'] as const,
  overview: () => [...integrationHealthKeys.all, 'overview'] as const,
  stats: () => [...integrationHealthKeys.all, 'stats'] as const,
  endpoints: () => [...integrationHealthKeys.all, 'endpoints'] as const,
  history: (endpointId: string) =>
    [...integrationHealthKeys.all, 'history', endpointId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks — Overview & Stats
// ---------------------------------------------------------------------------

export function useIntegrationOverview(autoRefresh = false) {
  return useQuery<IntegrationOverview[]>({
    queryKey: integrationHealthKeys.overview(),
    queryFn: getIntegrationOverview,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: autoRefresh ? 30_000 : false,
  });
}

export function useIntegrationStats(autoRefresh = false) {
  return useQuery<IntegrationStats>({
    queryKey: integrationHealthKeys.stats(),
    queryFn: getIntegrationStats,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: autoRefresh ? 30_000 : false,
  });
}

// ---------------------------------------------------------------------------
// Hook — Endpoints list
// ---------------------------------------------------------------------------

export function useEndpoints() {
  return useQuery<IntegrationEndpoint[]>({
    queryKey: integrationHealthKeys.endpoints(),
    queryFn: listEndpoints,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useRegisterEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<IntegrationEndpoint, Error, RegisterEndpointData>({
    mutationFn: registerEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.overview() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.stats() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.endpoints() });
    },
  });
}

export function useUpdateEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<IntegrationEndpoint, Error, { id: string; data: Partial<RegisterEndpointData> }>({
    mutationFn: ({ id, data }) => updateEndpoint(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.overview() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.endpoints() });
    },
  });
}

export function useDeleteEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteEndpoint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.overview() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.stats() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.endpoints() });
    },
  });
}

export function useCheckEndpoint() {
  const queryClient = useQueryClient();
  return useMutation<IntegrationHealthCheck, Error, string>({
    mutationFn: checkEndpoint,
    onSuccess: (_result, endpointId) => {
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.overview() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.stats() });
      queryClient.invalidateQueries({ queryKey: integrationHealthKeys.history(endpointId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Hook — History
// ---------------------------------------------------------------------------

export function useEndpointHistory(endpointId: string, limit = 50) {
  return useQuery<IntegrationHealthCheck[]>({
    queryKey: integrationHealthKeys.history(endpointId),
    queryFn: () => getEndpointHistory(endpointId, limit),
    enabled: !!endpointId,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
}

export type {
  IntegrationEndpoint,
  IntegrationHealthCheck,
  IntegrationOverview,
  IntegrationStats,
  RegisterEndpointData,
};
