import { backendApi } from '@/lib/api-client';

export interface ThreadAnalyticsV2 {
  id: string;
  thread_id: string;
  agent_id?: string;
  total_messages: number;
  user_messages: number;
  agent_messages: number;
  total_tokens: number;
  avg_response_time_ms: number;
  session_duration_ms: number;
  user_satisfaction_score?: number;
  completion_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ThreadEvent {
  id: string;
  thread_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  occurred_at: string;
}

export interface AnalyticsSummary {
  total_threads: number;
  avg_messages: number;
  avg_tokens: number;
  avg_response_time: number;
  avg_satisfaction: number;
  agent_breakdown: Array<{ agent_id: string; thread_count: number; avg_messages: number }>;
}

export interface AnalyticsTrend {
  date: string;
  thread_count: number;
  avg_satisfaction: number;
}

export async function getAnalyticsSummary() {
  const response = await backendApi.get<AnalyticsSummary>('/analytics/summary');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getAnalyticsTrends() {
  const response = await backendApi.get<AnalyticsTrend[]>('/analytics/trends');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getTopThreadsV2(limit = 10) {
  const response = await backendApi.get<ThreadAnalyticsV2[]>(
    `/analytics/top-threads?limit=${limit}`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function upsertThreadAnalytics(
  threadId: string,
  data: Partial<
    Omit<ThreadAnalyticsV2, 'id' | 'thread_id' | 'created_at' | 'updated_at'>
  >,
) {
  const response = await backendApi.post<ThreadAnalyticsV2>(
    `/threads/${threadId}/analytics`,
    data,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getThreadAnalyticsV2(threadId: string) {
  const response = await backendApi.get<ThreadAnalyticsV2>(
    `/threads/${threadId}/analytics`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function recordThreadEvent(
  threadId: string,
  data: { event_type: string; event_data?: Record<string, unknown> },
) {
  const response = await backendApi.post<ThreadEvent>(`/threads/${threadId}/events`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function listThreadEvents(threadId: string) {
  const response = await backendApi.get<ThreadEvent[]>(`/threads/${threadId}/events`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
