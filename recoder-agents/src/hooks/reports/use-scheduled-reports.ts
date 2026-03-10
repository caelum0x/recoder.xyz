'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  listScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  generateReport,
  listReportHistory,
  getReportData,
  type CreateScheduledReportRequest,
  type UpdateScheduledReportRequest,
  type ScheduledReport,
  type ReportHistory,
} from '@/lib/api/scheduled-reports';

// ============================================================================
// Query Keys
// ============================================================================

export const scheduledReportKeys = {
  all: ['scheduled-reports'] as const,
  list: () => [...scheduledReportKeys.all, 'list'] as const,
  history: (reportId: string) => [...scheduledReportKeys.all, 'history', reportId] as const,
  historyItem: (historyId: string) => [...scheduledReportKeys.all, 'history-item', historyId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export function useScheduledReports() {
  return useQuery({
    queryKey: scheduledReportKeys.list(),
    queryFn: listScheduledReports,
    staleTime: 30_000,
  });
}

export function useCreateScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScheduledReportRequest) => createScheduledReport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scheduledReportKeys.list() });
      toast.success('Scheduled report created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create report: ${error.message}`);
    },
  });
}

export function useUpdateScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, data }: { reportId: string; data: UpdateScheduledReportRequest }) =>
      updateScheduledReport(reportId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scheduledReportKeys.list() });
      toast.success('Report updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update report: ${error.message}`);
    },
  });
}

export function useDeleteScheduledReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => deleteScheduledReport(reportId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scheduledReportKeys.list() });
      toast.success('Report deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete report: ${error.message}`);
    },
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => generateReport(reportId),
    onSuccess: (_data, reportId) => {
      qc.invalidateQueries({ queryKey: scheduledReportKeys.list() });
      qc.invalidateQueries({ queryKey: scheduledReportKeys.history(reportId) });
      toast.success('Report generated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate report: ${error.message}`);
    },
  });
}

export function useReportHistory(reportId: string | null) {
  return useQuery({
    queryKey: scheduledReportKeys.history(reportId ?? ''),
    queryFn: () => listReportHistory(reportId!),
    enabled: !!reportId,
    staleTime: 15_000,
  });
}

export function useReportData(historyId: string | null) {
  return useQuery({
    queryKey: scheduledReportKeys.historyItem(historyId ?? ''),
    queryFn: () => getReportData(historyId!),
    enabled: !!historyId,
    staleTime: 60_000,
  });
}
