import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface AgentComparisonData {
  agent_id: string;
  name: string;
  total_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  total_cost: number;
  avg_cost_per_run: number;
  total_tokens: number;
  most_used_tool: string;
  model: string;
}

export interface LeaderboardEntry extends AgentComparisonData {
  rank: number;
}

export interface AgentMetricsSummary {
  agent_id: string;
  name: string;
  success_rate: number;
  avg_latency_ms: number;
  avg_cost: number;
  total_runs: number;
  avg_tokens: number;
  health_score: number;
}

export interface SavedComparison {
  id: string;
  user_id: string;
  name: string | null;
  agent_ids: string[];
  metrics: Record<string, AgentMetricsSummary>;
  created_at: string;
  snapshots?: ComparisonSnapshot[];
}

export interface ComparisonSnapshot {
  id: string;
  comparison_id: string;
  agent_id: string;
  metric_name: string;
  metric_value: number | null;
  period: string;
  captured_at: string;
}

export interface CreateComparisonRequest {
  name?: string;
  agent_ids: string[];
}

export interface CreateComparisonResponse extends SavedComparison {
  agents: AgentMetricsSummary[];
}

export interface LiveComparisonResponse {
  period: string;
  agents: AgentMetricsSummary[];
}

// ============================================================================
// Legacy API functions
// ============================================================================

export const compareAgents = async (agentIds: string[]): Promise<AgentComparisonData[]> => {
  const response = await backendApi.get<AgentComparisonData[]>(
    `/agents/compare?agent_ids=${agentIds.join(',')}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentLeaderboard = async (
  metric: string = 'runs',
  limit: number = 10
): Promise<LeaderboardEntry[]> => {
  const response = await backendApi.get<LeaderboardEntry[]>(
    `/agents/leaderboard?metric=${metric}&limit=${limit}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Saved Comparison CRUD
// ============================================================================

export async function createComparison(
  data: CreateComparisonRequest
): Promise<CreateComparisonResponse> {
  const response = await backendApi.post<CreateComparisonResponse>(
    '/agents/compare',
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'create agent comparison' });
    throw new Error(response.error.message || 'Failed to create comparison');
  }

  return response.data as CreateComparisonResponse;
}

export async function listSavedComparisons(): Promise<SavedComparison[]> {
  const response = await backendApi.get<SavedComparison[]>(
    '/agents/comparisons',
    { showErrors: false }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'list saved comparisons' });
    throw new Error(response.error.message || 'Failed to list comparisons');
  }

  return response.data as SavedComparison[];
}

export async function getComparison(comparisonId: string): Promise<SavedComparison> {
  const response = await backendApi.get<SavedComparison>(
    `/agents/comparisons/${comparisonId}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'get comparison' });
    throw new Error(response.error.message || 'Failed to get comparison');
  }

  return response.data as SavedComparison;
}

export async function deleteComparison(
  comparisonId: string
): Promise<{ deleted: boolean; comparison_id: string }> {
  const response = await backendApi.delete<{ deleted: boolean; comparison_id: string }>(
    `/agents/comparisons/${comparisonId}`,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'delete comparison' });
    throw new Error(response.error.message || 'Failed to delete comparison');
  }

  return response.data as { deleted: boolean; comparison_id: string };
}

export async function liveCompare(
  agentIds: string[],
  period: string = '30d'
): Promise<LiveComparisonResponse> {
  const response = await backendApi.post<LiveComparisonResponse>(
    '/agents/compare/live',
    { agent_ids: agentIds, period },
    { showErrors: false }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'live agent comparison' });
    throw new Error(response.error.message || 'Failed to compare agents');
  }

  return response.data as LiveComparisonResponse;
}
