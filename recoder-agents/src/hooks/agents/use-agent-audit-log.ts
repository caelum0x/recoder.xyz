'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  logEvent,
  batchLogEvents,
  listAuditEvents,
  getAuditEvent,
  getAuditStats,
  getRetentionPolicy,
  updateRetentionPolicy,
  cleanupOldEvents,
  type AuditEvent,
  type AuditStats,
  type AuditRetentionPolicy,
  type LogEventData,
  type AuditFilters,
} from '@/lib/api/agent-audit-log';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const auditKeys = {
  all: ['agent-audit-log'] as const,
  events: (filters?: AuditFilters) => [...auditKeys.all, 'events', filters] as const,
  event: (id: string) => [...auditKeys.all, 'event', id] as const,
  stats: () => [...auditKeys.all, 'stats'] as const,
  retention: () => [...auditKeys.all, 'retention'] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAuditEvents(filters?: AuditFilters) {
  return useQuery<AuditEvent[]>({
    queryKey: auditKeys.events(filters),
    queryFn: () => listAuditEvents(filters),
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useAuditStats() {
  return useQuery<AuditStats>({
    queryKey: auditKeys.stats(),
    queryFn: getAuditStats,
    refetchInterval: 60_000,
    staleTime: 15_000,
    gcTime: 120_000,
    refetchOnWindowFocus: true,
  });
}

export function useLogEvent() {
  const queryClient = useQueryClient();
  return useMutation<AuditEvent, Error, LogEventData>({
    mutationFn: logEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

export function useBatchLogEvents() {
  const queryClient = useQueryClient();
  return useMutation<{ inserted: number; events: AuditEvent[] }, Error, LogEventData[]>({
    mutationFn: batchLogEvents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}

export function useRetentionPolicy() {
  return useQuery<AuditRetentionPolicy>({
    queryKey: auditKeys.retention(),
    queryFn: getRetentionPolicy,
    staleTime: 60_000,
    gcTime: 120_000,
  });
}

export function useUpdateRetentionPolicy() {
  const queryClient = useQueryClient();
  return useMutation<
    AuditRetentionPolicy,
    Error,
    { retention_days: number; export_before_delete?: boolean }
  >({
    mutationFn: updateRetentionPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditKeys.retention() });
    },
  });
}

export function useCleanupAuditEvents() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted_count: number }, Error, void>({
    mutationFn: cleanupOldEvents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditKeys.all });
    },
  });
}
