import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export type ReportPeriod = 'this_month' | 'last_month' | 'last_90_days';
export type ReportType = 'summary' | 'agents' | 'models' | 'daily';
export type Granularity = 'day' | 'week';

export interface TopItem {
  name: string;
  value: number;
}

export interface UsageSummary {
  total_runs: number;
  total_cost: number;
  total_tokens: number;
  unique_agents_used: number;
  avg_runs_per_day: number;
  top_agent: TopItem;
  top_model: TopItem;
}

export interface AgentUsage {
  agent_name: string;
  agent_id: string;
  total_runs: number;
  total_cost: number;
  avg_latency_ms: number;
  success_rate: number;
}

export interface ModelUsage {
  model: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost: number;
  run_count: number;
}

export interface DailyUsage {
  date: string;
  runs: number;
  cost: number;
  tokens: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function getUsageSummary(period: ReportPeriod): Promise<UsageSummary> {
  try {
    const response = await backendApi.get<UsageSummary>(
      `/reports/usage-summary?period=${period}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get usage summary', resource: 'reports' });
    throw error;
  }
}

export async function getUsageByAgent(period: ReportPeriod): Promise<AgentUsage[]> {
  try {
    const response = await backendApi.get<AgentUsage[]>(
      `/reports/usage-by-agent?period=${period}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get usage by agent', resource: 'reports' });
    throw error;
  }
}

export async function getUsageByModel(period: ReportPeriod): Promise<ModelUsage[]> {
  try {
    const response = await backendApi.get<ModelUsage[]>(
      `/reports/usage-by-model?period=${period}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get usage by model', resource: 'reports' });
    throw error;
  }
}

export async function getUsageByDay(
  period: ReportPeriod,
  granularity: Granularity = 'day',
): Promise<DailyUsage[]> {
  try {
    const response = await backendApi.get<DailyUsage[]>(
      `/reports/usage-by-day?period=${period}&granularity=${granularity}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get usage by day', resource: 'reports' });
    throw error;
  }
}

export async function exportReportCsv(
  period: ReportPeriod,
  reportType: ReportType,
): Promise<string> {
  try {
    const response = await backendApi.get<Blob>(
      `/reports/export/csv?period=${period}&report_type=${reportType}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    const blob = response.data!;
    return URL.createObjectURL(blob);
  } catch (error) {
    handleApiError(error, { operation: 'export report csv', resource: 'reports' });
    throw error;
  }
}
