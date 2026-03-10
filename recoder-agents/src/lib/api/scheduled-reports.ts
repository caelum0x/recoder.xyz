import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface ScheduledReport {
  id: string;
  user_id: string;
  name: string;
  report_type: string;
  agent_ids: string[];
  schedule_cron: string;
  schedule_description: string | null;
  output_format: string;
  last_generated_at: string | null;
  next_run_at: string | null;
  is_active: boolean;
  config: Record<string, any>;
  created_at: string;
}

export interface CreateScheduledReportRequest {
  name: string;
  report_type: string;
  agent_ids?: string[];
  schedule_cron: string;
  schedule_description?: string;
  output_format?: string;
  config?: Record<string, any>;
}

export interface UpdateScheduledReportRequest {
  name?: string;
  report_type?: string;
  agent_ids?: string[];
  schedule_cron?: string;
  schedule_description?: string;
  output_format?: string;
  is_active?: boolean;
  config?: Record<string, any>;
}

export interface ReportHistory {
  id: string;
  report_id: string;
  user_id: string;
  status: 'completed' | 'failed' | 'partial';
  data: Record<string, any>;
  row_count: number;
  generation_time_ms: number | null;
  error: string | null;
  created_at: string;
}

// ============================================================================
// API Functions
// ============================================================================

export async function listScheduledReports(): Promise<ScheduledReport[]> {
  const response = await backendApi.get<ScheduledReport[]>('/reports/scheduled', { showErrors: false });
  if (response.error) throw new Error(`Failed to list scheduled reports: ${response.error.message}`);
  return response.data || [];
}

export async function createScheduledReport(data: CreateScheduledReportRequest): Promise<ScheduledReport> {
  const response = await backendApi.post<ScheduledReport>('/reports/scheduled', data);
  if (response.error) throw new Error(`Failed to create scheduled report: ${response.error.message}`);
  return response.data!;
}

export async function updateScheduledReport(reportId: string, data: UpdateScheduledReportRequest): Promise<ScheduledReport> {
  const response = await backendApi.patch<ScheduledReport>(`/reports/scheduled/${reportId}`, data);
  if (response.error) throw new Error(`Failed to update scheduled report: ${response.error.message}`);
  return response.data!;
}

export async function deleteScheduledReport(reportId: string): Promise<void> {
  const response = await backendApi.delete(`/reports/scheduled/${reportId}`);
  if (response.error) throw new Error(`Failed to delete scheduled report: ${response.error.message}`);
}

export async function generateReport(reportId: string): Promise<ReportHistory> {
  const response = await backendApi.post<ReportHistory>(`/reports/scheduled/${reportId}/generate`);
  if (response.error) throw new Error(`Failed to generate report: ${response.error.message}`);
  return response.data!;
}

export async function listReportHistory(reportId: string, limit = 20, offset = 0): Promise<ReportHistory[]> {
  const response = await backendApi.get<ReportHistory[]>(
    `/reports/scheduled/${reportId}/history?limit=${limit}&offset=${offset}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(`Failed to list report history: ${response.error.message}`);
  return response.data || [];
}

export async function getReportData(historyId: string): Promise<ReportHistory> {
  const response = await backendApi.get<ReportHistory>(`/reports/scheduled/history/${historyId}`, { showErrors: false });
  if (response.error) throw new Error(`Failed to get report data: ${response.error.message}`);
  return response.data!;
}
