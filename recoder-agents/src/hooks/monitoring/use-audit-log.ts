import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAuditLogs,
  getAuditSummary,
  exportAuditLogs,
  getAuditTimeline,
  type AuditLogListResponse,
  type AuditLogFilters,
  type AuditSummaryResponse,
  type AuditLogEntry,
  type AuditTimelineEntry,
} from '@/lib/api/audit-log';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const auditLogKeys = {
  all: ['audit-log'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (filters?: AuditLogFilters) =>
    [...auditLogKeys.lists(), filters] as const,
  summary: (days?: number) =>
    [...auditLogKeys.all, 'summary', days] as const,
  timeline: (days?: number) =>
    [...auditLogKeys.all, 'timeline', days] as const,
  export: (filters?: AuditLogFilters) =>
    [...auditLogKeys.all, 'export', filters] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const useAuditLogs = (filters?: AuditLogFilters) => {
  return useQuery<AuditLogListResponse>({
    queryKey: auditLogKeys.list(filters),
    queryFn: () => getAuditLogs(filters),
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
};

export const useAuditSummary = (days: number = 7) => {
  return useQuery<AuditSummaryResponse>({
    queryKey: auditLogKeys.summary(days),
    queryFn: () => getAuditSummary(days),
    staleTime: 60000,
    refetchOnMount: 'always',
  });
};

export const useExportAuditLogs = (filters?: AuditLogFilters) => {
  return useQuery<AuditLogEntry[]>({
    queryKey: auditLogKeys.export(filters),
    queryFn: () => exportAuditLogs(filters),
    enabled: false, // Only fetch on demand
  });
};

export const useAuditTimeline = (days: number = 30) => {
  return useQuery<AuditTimelineEntry[]>({
    queryKey: auditLogKeys.timeline(days),
    queryFn: () => getAuditTimeline(days),
    staleTime: 60000,
    refetchOnMount: 'always',
  });
};

export type {
  AuditLogEntry,
  AuditLogListResponse,
  AuditLogFilters,
  AuditSummaryResponse,
  AuditTimelineEntry,
};
