import { backendApi } from '@/lib/api-client';

export interface ThreadSummary {
  id: string;
  user_id: string;
  thread_id: string;
  summary: string;
  key_points: string[];
  action_items: string[];
  message_count: number;
  word_count: number;
  summary_type: 'auto' | 'manual' | 'periodic';
  created_at: string;
  thread_name?: string;
}

export interface SummaryStats {
  total_summaries: number;
  avg_key_points: number;
  avg_action_items: number;
}

export const summarizeThread = async (
  threadId: string,
  summaryType: string = 'auto'
): Promise<ThreadSummary> => {
  const response = await backendApi.post<ThreadSummary>(
    `/threads/${threadId}/summarize?summary_type=${summaryType}`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadSummary = async (
  threadId: string
): Promise<ThreadSummary | null> => {
  const response = await backendApi.get<ThreadSummary | null>(
    `/threads/${threadId}/summary`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data ?? null;
};

export const getRecentSummaries = async (
  limit: number = 20
): Promise<ThreadSummary[]> => {
  const response = await backendApi.get<ThreadSummary[]>(
    `/summaries/recent?limit=${limit}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteSummary = async (summaryId: string): Promise<void> => {
  const response = await backendApi.delete(`/summaries/${summaryId}`);
  if (response.error) throw new Error(response.error.message);
};

export const getSummaryStats = async (): Promise<SummaryStats> => {
  const response = await backendApi.get<SummaryStats>(
    `/summaries/stats`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
