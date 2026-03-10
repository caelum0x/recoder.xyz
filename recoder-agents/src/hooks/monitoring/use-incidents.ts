'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getIncidents,
  getIncident,
  createIncident,
  updateIncident,
  getIncidentStats,
  type Incident,
  type IncidentStats,
  type IncidentFilters,
  type CreateIncidentData,
  type UpdateIncidentData,
} from '@/lib/api/incidents';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const incidentKeys = {
  all: ['incidents'] as const,
  list: (filters?: IncidentFilters) => [...incidentKeys.all, 'list', filters] as const,
  detail: (id: string) => [...incidentKeys.all, 'detail', id] as const,
  stats: () => [...incidentKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch incidents with optional filters. Polls every 30 seconds.
 */
export function useIncidents(filters?: IncidentFilters, options?: { enabled?: boolean }) {
  return useQuery<Incident[]>({
    queryKey: incidentKeys.list(filters),
    queryFn: () => getIncidents(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch a single incident by ID.
 */
export function useIncident(id: string | null, options?: { enabled?: boolean }) {
  return useQuery<Incident>({
    queryKey: incidentKeys.detail(id ?? ''),
    queryFn: () => getIncident(id!),
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!id && options?.enabled !== false,
  });
}

/**
 * Create a new incident. Invalidates list and stats on success.
 */
export function useCreateIncident() {
  const queryClient = useQueryClient();

  return useMutation<Incident, Error, CreateIncidentData>({
    mutationFn: createIncident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.all });
    },
  });
}

/**
 * Update an existing incident. Invalidates list, detail, and stats on success.
 */
export function useUpdateIncident() {
  const queryClient = useQueryClient();

  return useMutation<Incident, Error, { incidentId: string; data: UpdateIncidentData }>({
    mutationFn: ({ incidentId, data }) => updateIncident(incidentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.all });
      queryClient.invalidateQueries({
        queryKey: incidentKeys.detail(variables.incidentId),
      });
    },
  });
}

/**
 * Fetch incident stats. Polls every 30 seconds.
 */
export function useIncidentStats(options?: { enabled?: boolean }) {
  return useQuery<IncidentStats>({
    queryKey: incidentKeys.stats(),
    queryFn: getIncidentStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}
