import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AbTestReport {
  test_id: string;
  user_id: string;
  agent_id: string;
  report_name: string;
  variant_a: Record<string, any>;
  variant_b: Record<string, any>;
  metrics: Record<string, any>;
  winner: 'a' | 'b' | null;
  confidence_level: number;
  sample_size_a: number;
  sample_size_b: number;
  status: 'running' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface CreateReportData {
  agent_id: string;
  report_name: string;
  variant_a?: Record<string, any>;
  variant_b?: Record<string, any>;
  metrics?: Record<string, any>;
}

export interface RecordSampleData {
  variant: 'a' | 'b';
  metrics: Record<string, any>;
}

export interface AbTestSummary {
  total_tests: number;
  completed_tests: number;
  running_tests: number;
  win_rate_a: number;
  win_rate_b: number;
  avg_confidence: number;
}

export interface ReportFilters {
  agent_id?: string;
  status?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const createAbTestReport = async (
  data: CreateReportData,
): Promise<AbTestReport> => {
  const response = await backendApi.post<AbTestReport>(
    '/ab-tests/reports',
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to create report: ${response.error.message}`);
  }
  return response.data!;
};

export const getAbTestReports = async (
  filters?: ReportFilters,
): Promise<AbTestReport[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const response = await backendApi.get<AbTestReport[]>(
    `/ab-tests/reports${qs ? `?${qs}` : ''}`,
    { showErrors: false, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch reports: ${response.error.message}`);
  }
  return response.data!;
};

export const getAbTestReport = async (
  reportId: string,
): Promise<AbTestReport> => {
  const response = await backendApi.get<AbTestReport>(
    `/ab-tests/reports/${reportId}`,
    { showErrors: false, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch report: ${response.error.message}`);
  }
  return response.data!;
};

export const recordAbTestSample = async (
  reportId: string,
  data: RecordSampleData,
): Promise<AbTestReport> => {
  const response = await backendApi.post<AbTestReport>(
    `/ab-tests/reports/${reportId}/record`,
    data,
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to record sample: ${response.error.message}`);
  }
  return response.data!;
};

export const completeAbTestReport = async (
  reportId: string,
): Promise<AbTestReport> => {
  const response = await backendApi.post<AbTestReport>(
    `/ab-tests/reports/${reportId}/complete`,
    {},
    { showErrors: true },
  );
  if (response.error) {
    throw new Error(`Failed to complete report: ${response.error.message}`);
  }
  return response.data!;
};

export const getAbTestSummary = async (): Promise<AbTestSummary> => {
  const response = await backendApi.get<AbTestSummary>(
    '/ab-tests/reports/summary',
    { showErrors: false, cache: 'no-store' },
  );
  if (response.error) {
    throw new Error(`Failed to fetch summary: ${response.error.message}`);
  }
  return response.data!;
};
