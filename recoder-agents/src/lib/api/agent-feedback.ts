import { backendApi } from '@/lib/api-client';

export type FeedbackType = 'general' | 'accuracy' | 'speed' | 'helpfulness' | 'formatting' | 'bug_report';

export interface AgentFeedback {
  id: string;
  user_id: string;
  agent_id: string;
  thread_id: string | null;
  message_index: number | null;
  rating: number | null;
  feedback_type: FeedbackType;
  comment: string | null;
  tags: string[];
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface FeedbackCategory {
  id: string;
  user_id: string;
  category_name: string;
  description: string | null;
  color: string;
  feedback_count: number;
  created_at: string;
}

export interface CreateFeedbackData {
  thread_id?: string;
  message_index?: number;
  rating?: number;
  feedback_type?: FeedbackType;
  comment?: string;
  tags?: string[];
}

export interface FeedbackStats {
  avg_rating: number;
  count_by_type: Record<string, number>;
  rating_histogram: Record<string, number>;
  resolution_rate: number;
  total: number;
  resolved: number;
}

export interface FeedbackFilters {
  feedback_type?: FeedbackType;
  rating?: number;
  is_resolved?: boolean;
  limit?: number;
}

export const submitFeedback = async (
  agentId: string,
  data: CreateFeedbackData
): Promise<AgentFeedback> => {
  const response = await backendApi.post<AgentFeedback>(
    `/agents/${agentId}/feedback`,
    data,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listFeedback = async (
  agentId: string,
  filters?: FeedbackFilters
): Promise<AgentFeedback[]> => {
  const params = new URLSearchParams();
  if (filters?.feedback_type) params.set('feedback_type', filters.feedback_type);
  if (filters?.rating !== undefined) params.set('rating', String(filters.rating));
  if (filters?.is_resolved !== undefined) params.set('is_resolved', String(filters.is_resolved));
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<AgentFeedback[]>(
    `/agents/${agentId}/feedback${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getFeedbackStats = async (agentId: string): Promise<FeedbackStats> => {
  const response = await backendApi.get<FeedbackStats>(
    `/agents/${agentId}/feedback/stats`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listAllFeedback = async (filters?: {
  agent_id?: string;
  feedback_type?: FeedbackType;
  limit?: number;
}): Promise<AgentFeedback[]> => {
  const params = new URLSearchParams();
  if (filters?.agent_id) params.set('agent_id', filters.agent_id);
  if (filters?.feedback_type) params.set('feedback_type', filters.feedback_type);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<AgentFeedback[]>(
    `/feedback/all${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateFeedback = async (
  id: string,
  data: { is_resolved?: boolean; comment?: string }
): Promise<AgentFeedback> => {
  const response = await backendApi.patch<AgentFeedback>(`/feedback/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteFeedback = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/feedback/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const createCategory = async (data: {
  category_name: string;
  description?: string;
  color?: string;
}): Promise<FeedbackCategory> => {
  const response = await backendApi.post<FeedbackCategory>('/feedback-categories', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listCategories = async (): Promise<FeedbackCategory[]> => {
  const response = await backendApi.get<FeedbackCategory[]>('/feedback-categories', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteCategory = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/feedback-categories/${id}`);
  if (response.error) throw new Error(response.error.message);
};
