import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestCase {
  id: string;
  user_id: string;
  agent_id: string;
  name: string;
  input_message: string;
  expected_behavior: string | null;
  expected_contains: string[];
  expected_not_contains: string[];
  max_latency_ms: number | null;
  max_cost: number | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestCaseListResponse {
  test_cases: TestCase[];
}

export interface CreateTestCaseRequest {
  name: string;
  input_message: string;
  expected_behavior?: string;
  expected_contains?: string[];
  expected_not_contains?: string[];
  max_latency_ms?: number;
  max_cost?: number;
  tags?: string[];
}

export interface UpdateTestCaseRequest {
  name?: string;
  input_message?: string;
  expected_behavior?: string;
  expected_contains?: string[];
  expected_not_contains?: string[];
  max_latency_ms?: number;
  max_cost?: number;
  tags?: string[];
  is_active?: boolean;
}

export interface TestRun {
  id: string;
  user_id: string;
  agent_id: string;
  suite_name: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  total_cases: number;
  passed: number;
  failed: number;
  skipped: number;
  started_at: string;
  completed_at: string | null;
}

export interface TestResult {
  id: string;
  test_run_id: string;
  test_case_id: string;
  test_case_name: string;
  input_message: string;
  expected_behavior: string | null;
  passed: boolean | null;
  actual_output: string | null;
  latency_ms: number | null;
  cost: number | null;
  tokens_used: number | null;
  failure_reason: string | null;
  created_at: string;
}

export interface TestRunListResponse {
  test_runs: TestRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface TestRunDetailResponse extends TestRun {
  results: TestResult[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const getTestCases = async (agentId: string): Promise<TestCaseListResponse> => {
  const response = await backendApi.get<TestCaseListResponse>(
    `/agents/${agentId}/test-cases`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(`Failed to fetch test cases: ${response.error.message}`);
  }
  return response.data!;
};

export const createTestCase = async (
  agentId: string,
  data: CreateTestCaseRequest
): Promise<TestCase> => {
  const response = await backendApi.post<TestCase>(
    `/agents/${agentId}/test-cases`,
    data,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to create test case: ${response.error.message}`);
  }
  return response.data!;
};

export const updateTestCase = async (
  agentId: string,
  caseId: string,
  data: UpdateTestCaseRequest
): Promise<TestCase> => {
  const response = await backendApi.patch<TestCase>(
    `/agents/${agentId}/test-cases/${caseId}`,
    data,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to update test case: ${response.error.message}`);
  }
  return response.data!;
};

export const deleteTestCase = async (
  agentId: string,
  caseId: string
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete<{ deleted: boolean }>(
    `/agents/${agentId}/test-cases/${caseId}`,
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to delete test case: ${response.error.message}`);
  }
  return response.data!;
};

export const startTestRun = async (agentId: string): Promise<TestRun> => {
  const response = await backendApi.post<TestRun>(
    `/agents/${agentId}/test-runs`,
    {},
    { showErrors: true }
  );
  if (response.error) {
    throw new Error(`Failed to start test run: ${response.error.message}`);
  }
  return response.data!;
};

export const getTestRuns = async (
  agentId: string,
  params?: { limit?: number; offset?: number }
): Promise<TestRunListResponse> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : '';

  const response = await backendApi.get<TestRunListResponse>(
    `/agents/${agentId}/test-runs${query}`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(`Failed to fetch test runs: ${response.error.message}`);
  }
  return response.data!;
};

export const getTestRunDetail = async (
  agentId: string,
  runId: string
): Promise<TestRunDetailResponse> => {
  const response = await backendApi.get<TestRunDetailResponse>(
    `/agents/${agentId}/test-runs/${runId}`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(`Failed to fetch test run detail: ${response.error.message}`);
  }
  return response.data!;
};
