import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentBenchmark {
  id: string;
  user_id: string;
  agent_id: string;
  benchmark_name: string;
  model: string | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_tokens_in: number | null;
  avg_tokens_out: number | null;
  avg_cost: number | null;
  success_rate: number | null;
  total_runs: number;
  period_start: string | null;
  period_end: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface BenchmarkListResponse {
  benchmarks: AgentBenchmark[];
  total: number;
  limit: number;
  offset: number;
}

export interface BenchmarkComparisonModel {
  model: string;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_tokens_in: number | null;
  avg_tokens_out: number | null;
  avg_cost: number | null;
  success_rate: number | null;
  total_runs: number;
  benchmark_count: number;
}

export interface BenchmarkComparisonResponse {
  agent_id: string;
  models: BenchmarkComparisonModel[];
}

export interface LeaderboardEntry {
  agent_id: string;
  benchmark_name: string;
  model: string | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_cost: number | null;
  success_rate: number | null;
  total_runs: number;
  created_at: string;
  cost_efficiency: number | null;
}

export interface LeaderboardResponse {
  metric: string;
  leaderboard: LeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getAgentBenchmarks = async (
  agentId: string,
  filters?: { model?: string; limit?: number; offset?: number }
): Promise<BenchmarkListResponse> => {
  const params = new URLSearchParams();
  if (filters?.model) params.set('model', filters.model);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await backendApi.get<BenchmarkListResponse>(
    `/agents/${agentId}/benchmarks${qs}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch benchmarks: ${response.error.message}`);
  }

  return response.data!;
};

export const generateBenchmark = async (
  agentId: string,
  period: string = '7d'
): Promise<AgentBenchmark> => {
  const response = await backendApi.post<AgentBenchmark>(
    `/agents/${agentId}/benchmarks/generate`,
    { period },
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to generate benchmark: ${response.error.message}`);
  }

  return response.data!;
};

export const getBenchmarkComparison = async (
  agentId: string
): Promise<BenchmarkComparisonResponse> => {
  const response = await backendApi.get<BenchmarkComparisonResponse>(
    `/agents/${agentId}/benchmarks/compare`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch benchmark comparison: ${response.error.message}`);
  }

  return response.data!;
};

export const getBenchmarkLeaderboard = async (
  metric: string = 'success_rate',
  limit: number = 10
): Promise<LeaderboardResponse> => {
  const response = await backendApi.get<LeaderboardResponse>(
    `/benchmarks/leaderboard?metric=${metric}&limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch leaderboard: ${response.error.message}`);
  }

  return response.data!;
};
