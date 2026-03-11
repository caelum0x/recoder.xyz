'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSlaDefinitions,
  createSlaDefinition,
  updateSlaDefinition,
  deleteSlaDefinition,
  measureSla,
  getSlaMeasurements,
  getSlaDashboard,
  type SlaDefinition,
  type SlaMeasurement,
  type SlaDashboard,
  type CreateSlaData,
  type UpdateSlaData,
  type MeasureResult,
  type MeasurementFilters,
} from '@/lib/api/sla-monitoring';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const slaKeys = {
  all: ['sla'] as const,
  definitions: () => [...slaKeys.all, 'definitions'] as const,
  measurements: (slaId: string, filters?: MeasurementFilters) =>
    [...slaKeys.all, 'measurements', slaId, filters] as const,
  dashboard: () => [...slaKeys.all, 'dashboard'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch all SLA definitions with compliance rates.
 */
export function useSlaDefinitions(options?: { enabled?: boolean }) {
  return useQuery<SlaDefinition[]>({
    queryKey: slaKeys.definitions(),
    queryFn: getSlaDefinitions,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Create a new SLA definition. Invalidates definitions and dashboard on success.
 */
export function useCreateSla() {
  const queryClient = useQueryClient();

  return useMutation<SlaDefinition, Error, CreateSlaData>({
    mutationFn: createSlaDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaKeys.definitions() });
      queryClient.invalidateQueries({ queryKey: slaKeys.dashboard() });
    },
  });
}

/**
 * Update an SLA definition. Invalidates definitions and dashboard on success.
 */
export function useUpdateSla() {
  const queryClient = useQueryClient();

  return useMutation<SlaDefinition, Error, { slaId: string; data: UpdateSlaData }>({
    mutationFn: ({ slaId, data }) => updateSlaDefinition(slaId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaKeys.definitions() });
      queryClient.invalidateQueries({ queryKey: slaKeys.dashboard() });
    },
  });
}

/**
 * Delete an SLA definition. Invalidates definitions and dashboard on success.
 */
export function useDeleteSla() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: deleteSlaDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaKeys.definitions() });
      queryClient.invalidateQueries({ queryKey: slaKeys.dashboard() });
    },
  });
}

/**
 * Trigger SLA measurement for all active SLAs.
 * Invalidates all SLA queries on success.
 */
export function useMeasureSla() {
  const queryClient = useQueryClient();

  return useMutation<MeasureResult, Error, void>({
    mutationFn: measureSla,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaKeys.all });
    },
  });
}

/**
 * Fetch measurements for a specific SLA with optional filters.
 */
export function useSlaMeasurements(
  slaId: string | null,
  filters?: MeasurementFilters,
  options?: { enabled?: boolean }
) {
  return useQuery<SlaMeasurement[]>({
    queryKey: slaKeys.measurements(slaId ?? '', filters),
    queryFn: () => getSlaMeasurements(slaId!, filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!slaId && options?.enabled !== false,
  });
}

/**
 * Fetch the SLA dashboard with overall compliance metrics.
 */
export function useSlaDashboard(options?: { enabled?: boolean }) {
  return useQuery<SlaDashboard>({
    queryKey: slaKeys.dashboard(),
    queryFn: getSlaDashboard,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
