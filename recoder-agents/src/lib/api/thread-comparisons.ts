import { backendApi } from '@/lib/api-client';

export interface ThreadComparison {
  id: string;
  user_id: string;
  comparison_name: string | null;
  thread_ids: string[];
  comparison_config: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  evaluation_count?: number;
}

export interface ComparisonEvaluation {
  id: string;
  comparison_id: string;
  user_id: string;
  thread_id: string;
  quality_score: number | null;
  criteria_scores: Record<string, unknown>;
  strengths: string[];
  weaknesses: string[];
  preferred: boolean;
  notes: string | null;
  created_at: string;
}

export interface ThreadComparisonDetail extends ThreadComparison {
  evaluations: ComparisonEvaluation[];
}

export interface ComparisonStats {
  total_comparisons: number;
  avg_quality_score: number;
  most_compared_thread: string | null;
}

export interface CreateComparisonData {
  thread_ids: string[];
  comparison_name?: string;
  notes?: string;
  comparison_config?: Record<string, unknown>;
}

export interface SubmitEvaluationData {
  thread_id: string;
  quality_score?: number;
  criteria_scores?: Record<string, unknown>;
  strengths?: string[];
  weaknesses?: string[];
  preferred?: boolean;
  notes?: string;
}

// ── API functions ──────────────────────────────────────────────────────────

export const createComparison = async (
  data: CreateComparisonData
): Promise<ThreadComparison> => {
  const response = await backendApi.post<ThreadComparison>(
    '/thread-comparisons',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getComparisons = async (limit = 50): Promise<ThreadComparison[]> => {
  const response = await backendApi.get<ThreadComparison[]>(
    `/thread-comparisons?limit=${limit}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getComparisonDetail = async (
  comparisonId: string
): Promise<ThreadComparisonDetail> => {
  const response = await backendApi.get<ThreadComparisonDetail>(
    `/thread-comparisons/${comparisonId}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteComparison = async (comparisonId: string): Promise<void> => {
  const response = await backendApi.delete(
    `/thread-comparisons/${comparisonId}`
  );
  if (response.error) throw new Error(response.error.message);
};

export const submitEvaluation = async (
  comparisonId: string,
  data: SubmitEvaluationData
): Promise<ComparisonEvaluation> => {
  const response = await backendApi.post<ComparisonEvaluation>(
    `/thread-comparisons/${comparisonId}/evaluate`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getComparisonEvaluations = async (
  comparisonId: string
): Promise<ComparisonEvaluation[]> => {
  const response = await backendApi.get<ComparisonEvaluation[]>(
    `/thread-comparisons/${comparisonId}/evaluations`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getComparisonStats = async (): Promise<ComparisonStats> => {
  const response = await backendApi.get<ComparisonStats>(
    '/thread-comparisons/stats',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
