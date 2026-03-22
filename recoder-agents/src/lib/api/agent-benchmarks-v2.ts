import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkDefinition {
  id: string;
  user_id: string;
  agent_id: string;
  benchmark_name: string;
  benchmark_type: string;
  config: Record<string, any>;
  created_at: string;
  // Joined fields from list query
  latest_score: number | null;
  latest_status: string | null;
  latest_duration_ms: number | null;
  latest_run_at: string | null;
  latest_metrics: Record<string, any> | null;
  run_count: number;
  best_score: number | null;
}

export interface BenchmarkListResponse {
  benchmarks: BenchmarkDefinition[];
}

export interface BenchmarkResult {
  id: string;
  benchmark_id: string;
  user_id: string;
  agent_id: string;
  score: number;
  metrics: Record<string, any>;
  duration_ms: number | null;
  status: string;
  run_at: string;
}

export interface BenchmarkResultsResponse {
  results: BenchmarkResult[];
}

export interface BenchmarkSummaryEntry {
  benchmark_id: string;
  benchmark_name: string;
  benchmark_type: string;
  run_count: number;
  best_score: number | null;
  worst_score: number | null;
  avg_score: number | null;
  improvement_pct: number | null;
}

export interface BenchmarkSummaryResponse {
  agent_id: string;
  summaries: BenchmarkSummaryEntry[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getAgentBenchmarksV2 = async (
  agentId: string
): Promise<BenchmarkListResponse> => {
  const response = await backendApi.get<BenchmarkListResponse>(
    `/agents/${agentId}/benchmarks/v2`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch benchmarks: ${response.error.message}`);
  }

  return response.data!;
};

export const createBenchmarkV2 = async (
  agentId: string,
  data: { benchmark_name: string; benchmark_type?: string; config?: Record<string, any> }
): Promise<BenchmarkDefinition> => {
  const response = await backendApi.post<BenchmarkDefinition>(
    `/agents/${agentId}/benchmarks/v2`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create benchmark: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteBenchmarkV2 = async (
  agentId: string,
  benchmarkId: string
): Promise<void> => {
  const response = await backendApi.delete(
    `/agents/${agentId}/benchmarks/v2/${benchmarkId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete benchmark: ${response.error.message}`);
  }
};

export const runBenchmarkV2 = async (
  agentId: string,
  benchmarkId: string
): Promise<BenchmarkResult> => {
  const response = await backendApi.post<BenchmarkResult>(
    `/agents/${agentId}/benchmarks/v2/${benchmarkId}/run`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to run benchmark: ${response.error.message}`);
  }

  return response.data!;
};

export const getBenchmarkResultsV2 = async (
  agentId: string,
  benchmarkId: string,
  limit: number = 20
): Promise<BenchmarkResultsResponse> => {
  const response = await backendApi.get<BenchmarkResultsResponse>(
    `/agents/${agentId}/benchmarks/v2/${benchmarkId}/results?limit=${limit}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch benchmark results: ${response.error.message}`);
  }

  return response.data!;
};

export const getBenchmarkSummaryV2 = async (
  agentId: string
): Promise<BenchmarkSummaryResponse> => {
  const response = await backendApi.get<BenchmarkSummaryResponse>(
    `/agents/${agentId}/benchmark-summary/v2`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch benchmark summary: ${response.error.message}`);
  }

  return response.data!;
};
