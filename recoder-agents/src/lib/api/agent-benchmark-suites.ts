import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScoringMethod = 'average' | 'weighted' | 'min' | 'max';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface TestCase {
  name: string;
  prompt?: string;
  expected_keywords?: string[];
  [key: string]: unknown;
}

export interface TestResult {
  name: string;
  score: number;
  passed: boolean;
  latency_ms: number;
}

export interface BenchmarkSuite {
  id: string;
  user_id: string;
  suite_name: string;
  description: string | null;
  test_cases: TestCase[];
  scoring_method: ScoringMethod;
  created_at: string;
  updated_at: string;
}

export interface BenchmarkRun {
  id: string;
  suite_id: string;
  suite_name?: string;
  user_id: string;
  agent_id: string;
  status: RunStatus;
  overall_score: number | null;
  test_results: TestResult[];
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface BenchmarkLeaderboard {
  suite_id: string;
  leaderboard: Array<{
    id: string;
    agent_id: string;
    overall_score: number | null;
    passed_tests: number;
    total_tests: number;
    duration_ms: number | null;
    status: RunStatus;
    started_at: string;
    completed_at: string | null;
  }>;
}

export interface CreateBenchmarkSuiteData {
  suite_name: string;
  description?: string;
  test_cases: TestCase[];
  scoring_method?: ScoringMethod;
}

export interface BenchmarkRunFilters {
  agent_id?: string;
  suite_id?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const listBenchmarkSuites = async (): Promise<BenchmarkSuite[]> => {
  const response = await backendApi.get<BenchmarkSuite[]>('/benchmarks/suites', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createBenchmarkSuite = async (data: CreateBenchmarkSuiteData): Promise<BenchmarkSuite> => {
  const response = await backendApi.post<BenchmarkSuite>('/benchmarks/suites', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getBenchmarkSuite = async (suiteId: string): Promise<BenchmarkSuite> => {
  const response = await backendApi.get<BenchmarkSuite>(`/benchmarks/suites/${suiteId}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateBenchmarkSuite = async (
  suiteId: string,
  data: Partial<CreateBenchmarkSuiteData>
): Promise<BenchmarkSuite> => {
  const response = await backendApi.patch<BenchmarkSuite>(`/benchmarks/suites/${suiteId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteBenchmarkSuite = async (suiteId: string): Promise<void> => {
  const response = await backendApi.delete(`/benchmarks/suites/${suiteId}`);
  if (response.error) throw new Error(response.error.message);
};

export const runBenchmark = async (suiteId: string, agentId: string): Promise<BenchmarkRun> => {
  const response = await backendApi.post<BenchmarkRun>(`/benchmarks/suites/${suiteId}/run`, {
    agent_id: agentId,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listBenchmarkRuns = async (
  filters?: BenchmarkRunFilters
): Promise<BenchmarkRun[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.suite_id) params.set('suite_id', filters.suite_id);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<BenchmarkRun[]>(
    `/benchmarks/runs${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getBenchmarkRun = async (runId: string): Promise<BenchmarkRun> => {
  const response = await backendApi.get<BenchmarkRun>(`/benchmarks/runs/${runId}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getBenchmarkLeaderboard = async (suiteId: string): Promise<BenchmarkLeaderboard> => {
  const response = await backendApi.get<BenchmarkLeaderboard>(
    `/benchmarks/suites/${suiteId}/leaderboard`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
