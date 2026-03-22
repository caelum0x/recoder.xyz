import { backendApi } from '@/lib/api-client';

export type SummaryType = 'auto' | 'manual' | 'checkpoint';
export type SummaryLength = 'brief' | 'medium' | 'detailed';

export interface ThreadSummary {
  id: string;
  user_id: string;
  thread_id: string;
  summary_text: string;
  key_points: string[];
  action_items: string[];
  message_count: number;
  tokens_summarized: number;
  summary_type: SummaryType;
  created_at: string;
}

export interface SummarizationConfig {
  id?: string;
  user_id: string;
  auto_summarize_threshold: number;
  include_key_points: boolean;
  include_action_items: boolean;
  summary_length: SummaryLength;
  created_at?: string;
}

export interface SummarizeData {
  messages: Array<{ role: string; content: string }>;
  summary_type?: SummaryType;
  summary_length?: SummaryLength;
}

export interface SummarizationStats {
  total_summaries: number;
  threads_summarized: number;
  avg_message_count: number;
}

export const summarizeThread = async (
  threadId: string,
  data: SummarizeData,
): Promise<ThreadSummary> => {
  const response = await backendApi.post<ThreadSummary>(`/threads/${threadId}/summarize`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadSummary = async (threadId: string): Promise<ThreadSummary> => {
  const response = await backendApi.get<ThreadSummary>(`/threads/${threadId}/summary`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listThreadSummaries = async (threadId: string): Promise<ThreadSummary[]> => {
  const response = await backendApi.get<ThreadSummary[]>(`/threads/${threadId}/summaries`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteThreadSummary = async (
  threadId: string,
  summaryId: string,
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete(`/threads/${threadId}/summaries/${summaryId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean };
};

export const getSummarizationConfig = async (): Promise<SummarizationConfig> => {
  const response = await backendApi.get<SummarizationConfig>('/summarization/config', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateSummarizationConfig = async (
  data: Partial<SummarizationConfig>,
): Promise<SummarizationConfig> => {
  const response = await backendApi.put<SummarizationConfig>('/summarization/config', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getSummarizationStats = async (): Promise<SummarizationStats> => {
  const response = await backendApi.get<SummarizationStats>('/summarization/stats', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
