import { backendApi } from '@/lib/api-client';

export interface ThreadAnalytics {
  id: string | null;
  thread_id: string;
  account_id: string;
  total_messages: number;
  user_messages: number;
  assistant_messages: number;
  tool_messages: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost: number;
  avg_response_time_ms: number;
  tool_call_count: number;
  tool_breakdown: Record<string, number>;
  model_breakdown: Record<string, number>;
  first_message_at: string | null;
  last_message_at: string | null;
  duration_seconds: number;
  sentiment_score: number | null;
  computed_at: string | null;
}

export interface ThreadAnalyticsOverview {
  total_threads: number;
  total_messages: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost: number;
  avg_messages_per_thread: number;
  avg_cost_per_thread: number;
  top_tools: Record<string, number>;
  top_models: Record<string, number>;
}

export interface TopThread {
  thread_id: string;
  thread_name: string | null;
  value: number;
  total_messages: number;
  total_cost: number;
  last_message_at: string | null;
}

export interface TopThreadsResponse {
  threads: TopThread[];
  metric: string;
}

export const getThreadAnalytics = async (
  threadId: string
): Promise<ThreadAnalytics> => {
  const response = await backendApi.get<ThreadAnalytics>(
    `/threads/${threadId}/analytics`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch thread analytics: ${response.error.message}`);
  }

  return response.data!;
};

export const calculateThreadAnalytics = async (
  threadId: string
): Promise<ThreadAnalytics> => {
  const response = await backendApi.post<ThreadAnalytics>(
    `/threads/${threadId}/analytics/calculate`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to calculate thread analytics: ${response.error.message}`);
  }

  return response.data!;
};

export const getThreadsAnalyticsOverview = async (): Promise<ThreadAnalyticsOverview> => {
  const response = await backendApi.get<ThreadAnalyticsOverview>(
    `/threads/analytics/overview`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch thread analytics overview: ${response.error.message}`);
  }

  return response.data!;
};

export const getTopThreads = async (
  metric: string = 'total_messages',
  limit: number = 10
): Promise<TopThreadsResponse> => {
  const response = await backendApi.get<TopThreadsResponse>(
    `/threads/analytics/top?metric=${metric}&limit=${limit}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch top threads: ${response.error.message}`);
  }

  return response.data!;
};
