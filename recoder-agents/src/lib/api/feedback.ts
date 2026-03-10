import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

export interface FeedbackRequest {
  rating: number;
  feedback_text?: string;
  help_improve?: boolean;
  thread_id?: string;
  message_id?: string;
  context?: Record<string, unknown>;
}

export interface FeedbackResponse {
  feedback_id: string;
  thread_id?: string;
  message_id?: string;
  account_id: string;
  rating: number;
  feedback_text?: string;
  help_improve: boolean;
  context?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function submitFeedback(data: FeedbackRequest): Promise<FeedbackResponse> {
  const response = await backendApi.post<unknown>('/feedback', data, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'submit feedback' });
    throw new Error(response.error.message || 'Failed to submit feedback');
  }

  return response.data as FeedbackResponse;
}

export async function getFeedback(params?: {
  thread_id?: string;
  message_id?: string;
}): Promise<FeedbackResponse[]> {
  const searchParams = new URLSearchParams();
  if (params?.thread_id) searchParams.append('thread_id', params.thread_id);
  if (params?.message_id) searchParams.append('message_id', params.message_id);

  const query = searchParams.toString();
  const url = query ? `/feedback?${query}` : '/feedback';

  const response = await backendApi.get<unknown>(url, { showErrors: true });

  if (response.error) {
    handleApiError(response.error, { operation: 'get feedback' });
    throw new Error(response.error.message || 'Failed to get feedback');
  }

  return response.data as FeedbackResponse[];
}
