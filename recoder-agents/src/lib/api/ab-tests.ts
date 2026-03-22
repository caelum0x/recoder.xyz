import { backendApi } from '@/lib/api-client';

export interface AbTest {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  agent_a_id: string;
  agent_b_id: string;
  metric: 'success_rate' | 'latency' | 'cost' | 'user_rating';
  status: 'draft' | 'running' | 'completed' | 'cancelled';
  total_trials: number;
  completed_trials: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AbTestTrial {
  id: string;
  test_id: string;
  variant: 'A' | 'B';
  agent_id: string;
  thread_id: string | null;
  input_message: string | null;
  success: boolean | null;
  latency_ms: number | null;
  cost: number | null;
  tokens_used: number | null;
  user_rating: number | null;
  created_at: string;
}

export interface AbTestDetail extends AbTest {
  trials: AbTestTrial[];
}

export interface VariantResults {
  trial_count: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
  avg_cost: number | null;
  avg_tokens: number | null;
  avg_rating: number | null;
  successes: number;
}

export interface AbTestResults {
  test_id: string;
  metric: string;
  status: string;
  variant_a: VariantResults;
  variant_b: VariantResults;
  winner: 'A' | 'B' | null;
  confidence: number;
  statistical_test: {
    z_score: number;
    p_value: number;
    significant: boolean;
  };
  total_trials: number;
  completed_trials: number;
}

export interface CreateAbTestData {
  name: string;
  description?: string;
  agent_a_id: string;
  agent_b_id: string;
  metric?: string;
  total_trials?: number;
}

export interface UpdateAbTestData {
  status?: string;
  name?: string;
  description?: string;
}

export interface RecordTrialData {
  variant: 'A' | 'B';
  agent_id: string;
  thread_id?: string;
  input_message?: string;
  success?: boolean;
  latency_ms?: number;
  cost?: number;
  tokens_used?: number;
  user_rating?: number;
}

export const createAbTest = async (data: CreateAbTestData): Promise<AbTest> => {
  const response = await backendApi.post<AbTest>('/ab-tests', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAbTests = async (status?: string): Promise<AbTest[]> => {
  const params = status ? `?status=${status}` : '';
  const response = await backendApi.get<AbTest[]>(
    `/ab-tests${params}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAbTest = async (testId: string): Promise<AbTestDetail> => {
  const response = await backendApi.get<AbTestDetail>(
    `/ab-tests/${testId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateAbTest = async (
  testId: string,
  data: UpdateAbTestData
): Promise<AbTest> => {
  const response = await backendApi.patch<AbTest>(
    `/ab-tests/${testId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteAbTest = async (testId: string) => {
  const response = await backendApi.delete(`/ab-tests/${testId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const recordTrial = async (
  testId: string,
  data: RecordTrialData
) => {
  const response = await backendApi.post(
    `/ab-tests/${testId}/trials`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const getAbTestResults = async (
  testId: string
): Promise<AbTestResults> => {
  const response = await backendApi.get<AbTestResults>(
    `/ab-tests/${testId}/results`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
