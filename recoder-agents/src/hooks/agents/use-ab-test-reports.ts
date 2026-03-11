import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAbTestReport,
  getAbTestReports,
  getAbTestReport,
  recordAbTestSample,
  completeAbTestReport,
  getAbTestSummary,
  type CreateReportData,
  type RecordSampleData,
  type ReportFilters,
} from '@/lib/api/ab-test-reports';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const abTestReportKeys = {
  all: ['ab-test-reports'] as const,
  lists: () => [...abTestReportKeys.all, 'list'] as const,
  list: (filters?: ReportFilters) => [...abTestReportKeys.lists(), filters] as const,
  detail: (id: string) => [...abTestReportKeys.all, 'detail', id] as const,
  summary: () => [...abTestReportKeys.all, 'summary'] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAbTestReports(filters?: ReportFilters) {
  return useQuery({
    queryKey: abTestReportKeys.list(filters),
    queryFn: () => getAbTestReports(filters),
    staleTime: 30_000,
  });
}

export function useAbTestReportDetail(reportId: string) {
  return useQuery({
    queryKey: abTestReportKeys.detail(reportId),
    queryFn: () => getAbTestReport(reportId),
    enabled: !!reportId,
    staleTime: 15_000,
  });
}

export function useCreateAbTestReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReportData) => createAbTestReport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: abTestReportKeys.lists() });
      qc.invalidateQueries({ queryKey: abTestReportKeys.summary() });
    },
  });
}

export function useRecordSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      data,
    }: {
      reportId: string;
      data: RecordSampleData;
    }) => recordAbTestSample(reportId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: abTestReportKeys.lists() });
      qc.invalidateQueries({ queryKey: abTestReportKeys.detail(variables.reportId) });
      qc.invalidateQueries({ queryKey: abTestReportKeys.summary() });
    },
  });
}

export function useCompleteTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => completeAbTestReport(reportId),
    onSuccess: (_data, reportId) => {
      qc.invalidateQueries({ queryKey: abTestReportKeys.lists() });
      qc.invalidateQueries({ queryKey: abTestReportKeys.detail(reportId) });
      qc.invalidateQueries({ queryKey: abTestReportKeys.summary() });
    },
  });
}

export function useAbTestSummary() {
  return useQuery({
    queryKey: abTestReportKeys.summary(),
    queryFn: () => getAbTestSummary(),
    staleTime: 30_000,
  });
}
