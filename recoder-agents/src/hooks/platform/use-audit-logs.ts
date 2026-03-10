import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getAuditLogs,
  getAuditSummary,
  exportAuditLogs,
  type AuditLogFilters,
} from '@/lib/api/audit-logs';

export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => getAuditLogs(filters),
    staleTime: 15_000,
  });
}

export function useAuditSummary() {
  return useQuery({
    queryKey: ['audit-summary'],
    queryFn: () => getAuditSummary(),
    staleTime: 30_000,
  });
}

export function useExportAuditLogs() {
  return useMutation({
    mutationFn: ({ fromDate, toDate }: { fromDate: string; toDate: string }) =>
      exportAuditLogs(fromDate, toDate),
  });
}
