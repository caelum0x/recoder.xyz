import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---- Types ----

export interface MetricsOverview {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  total_cost: number;
  avg_cost_per_run: number;
  runs_by_day: Array<{ date: string; runs: number; successes: number; failures: number }>;
}

export interface ToolMetrics {
  tools: Array<{
    tool_name: string;
    call_count: number;
    success_count: number;
    failure_count: number;
    avg_duration_ms: number;
  }>;
}

export interface CostBreakdown {
  by_model: Array<{ model: string; total_cost: number; run_count: number; avg_cost: number }>;
  by_day: Array<{ date: string; cost: number }>;
  tokens: {
    total_input: number;
    total_output: number;
    avg_input_per_run: number;
    avg_output_per_run: number;
  };
  projected_monthly_cost: number;
}

// ---- API Functions ----

export async function getMetricsOverview(agentId: string): Promise<MetricsOverview> {
  try {
    const response = await backendApi.get<MetricsOverview>(
      `/agents/${agentId}/metrics/overview`,
      { showErrors: true },
    );
    if (response.error) {
      throw new Error(`Error fetching metrics overview: ${response.error.message}`);
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get metrics overview', resource: 'agent metrics' });
    throw error;
  }
}

export async function getToolMetrics(agentId: string): Promise<ToolMetrics> {
  try {
    const response = await backendApi.get<ToolMetrics>(
      `/agents/${agentId}/metrics/tools`,
      { showErrors: true },
    );
    if (response.error) {
      throw new Error(`Error fetching tool metrics: ${response.error.message}`);
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get tool metrics', resource: 'tool metrics' });
    throw error;
  }
}

export async function getCostBreakdown(agentId: string): Promise<CostBreakdown> {
  try {
    const response = await backendApi.get<CostBreakdown>(
      `/agents/${agentId}/metrics/cost-breakdown`,
      { showErrors: true },
    );
    if (response.error) {
      throw new Error(`Error fetching cost breakdown: ${response.error.message}`);
    }
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get cost breakdown', resource: 'cost breakdown' });
    throw error;
  }
}
