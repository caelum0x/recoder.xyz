'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  createIncident,
  listIncidents,
  getIncident,
  acknowledgeIncident,
  escalateIncident,
  resolveIncident,
  getEscalationStats,
  type EscalationPolicy,
  type EscalationIncident,
  type EscalationStats,
  type CreatePolicyData,
  type UpdatePolicyData,
  type CreateIncidentData,
  type IncidentFilters,
} from '@/lib/api/alert-escalation';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const escalationKeys = {
  all: ['alert-escalation'] as const,
  policies: () => [...escalationKeys.all, 'policies'] as const,
  incidents: (filters?: IncidentFilters) =>
    [...escalationKeys.all, 'incidents', filters] as const,
  incident: (id: string) => [...escalationKeys.all, 'incident', id] as const,
  stats: () => [...escalationKeys.all, 'stats'] as const,
} as const;

// ---------------------------------------------------------------------------
// Policy hooks
// ---------------------------------------------------------------------------

export function usePolicies() {
  return useQuery<EscalationPolicy[]>({
    queryKey: escalationKeys.policies(),
    queryFn: listPolicies,
    staleTime: 30_000,
    gcTime: 120_000,
  });
}

export function useCreatePolicy() {
  const queryClient = useQueryClient();
  return useMutation<EscalationPolicy, Error, CreatePolicyData>({
    mutationFn: createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.policies() });
    },
  });
}

export function useUpdatePolicy() {
  const queryClient = useQueryClient();
  return useMutation<EscalationPolicy, Error, { id: string; data: UpdatePolicyData }>({
    mutationFn: ({ id, data }) => updatePolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.policies() });
    },
  });
}

export function useDeletePolicy() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.policies() });
    },
  });
}

// ---------------------------------------------------------------------------
// Incident hooks
// ---------------------------------------------------------------------------

export function useIncidents(filters?: IncidentFilters) {
  return useQuery<EscalationIncident[]>({
    queryKey: escalationKeys.incidents(filters),
    queryFn: () => listIncidents(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useIncidentDetail(id: string | null) {
  return useQuery<EscalationIncident>({
    queryKey: escalationKeys.incident(id ?? ''),
    queryFn: () => getIncident(id!),
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: !!id,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation<EscalationIncident, Error, CreateIncidentData>({
    mutationFn: createIncident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.all });
    },
  });
}

export function useAcknowledgeIncident() {
  const queryClient = useQueryClient();
  return useMutation<EscalationIncident, Error, string>({
    mutationFn: acknowledgeIncident,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.all });
      queryClient.invalidateQueries({ queryKey: escalationKeys.incident(id) });
    },
  });
}

export function useEscalateIncident() {
  const queryClient = useQueryClient();
  return useMutation<EscalationIncident, Error, { id: string; notes?: string }>({
    mutationFn: ({ id, notes }) => escalateIncident(id, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.all });
      queryClient.invalidateQueries({ queryKey: escalationKeys.incident(variables.id) });
    },
  });
}

export function useResolveIncident() {
  const queryClient = useQueryClient();
  return useMutation<EscalationIncident, Error, { id: string; notes?: string }>({
    mutationFn: ({ id, notes }) => resolveIncident(id, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: escalationKeys.all });
      queryClient.invalidateQueries({ queryKey: escalationKeys.incident(variables.id) });
    },
  });
}

export function useEscalationStats() {
  return useQuery<EscalationStats>({
    queryKey: escalationKeys.stats(),
    queryFn: getEscalationStats,
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
