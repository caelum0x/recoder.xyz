import { backendApi } from '@/lib/api-client';

export interface AgentComparison {
  id: string;
  comparison_name: string;
  agent_ids: string[];
  comparison_metrics: string[];
  notes?: string;
  created_at: string;
  snapshots?: ComparisonMetricSnapshot[];
}

export interface ComparisonMetricSnapshot {
  id: string;
  comparison_id: string;
  agent_id: string;
  metric_name: string;
  metric_value: number;
  captured_at: string;
}

export interface ComparisonMetricSummary {
  [agent_id: string]: number | string;
  best_agent_id: string;
}

export interface ComparisonSummary {
  [metric_name: string]: ComparisonMetricSummary;
}

export async function listComparisons() {
  const response = await backendApi.get<AgentComparison[]>('/agent-comparisons');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getComparison(id: string) {
  const response = await backendApi.get<AgentComparison>(`/agent-comparisons/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function createComparison(data: {
  comparison_name: string;
  agent_ids: string[];
  comparison_metrics?: string[];
  notes?: string;
}) {
  const response = await backendApi.post<AgentComparison>('/agent-comparisons', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function updateComparison(id: string, data: Partial<AgentComparison>) {
  const response = await backendApi.patch<AgentComparison>(`/agent-comparisons/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function deleteComparison(id: string) {
  const response = await backendApi.delete(`/agent-comparisons/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function recordComparisonMetric(
  comparisonId: string,
  data: { agent_id: string; metric_name: string; metric_value: number }
) {
  const response = await backendApi.post<ComparisonMetricSnapshot>(
    `/agent-comparisons/${comparisonId}/metrics`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getComparisonSummary(comparisonId: string) {
  const response = await backendApi.get<ComparisonSummary>(
    `/agent-comparisons/${comparisonId}/summary`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
