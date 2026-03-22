import { backendApi } from '@/lib/api-client';

export interface ResponseRating {
  id: string;
  user_id: string;
  thread_id: string;
  message_id: string;
  agent_id: string | null;
  rating: number;
  feedback: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface UpsertRatingData {
  thread_id: string;
  message_id: string;
  agent_id?: string;
  rating: number;
  feedback?: string;
  tags?: string[];
}

export interface RatingsListResponse {
  ratings: ResponseRating[];
  total: number;
  limit: number;
  offset: number;
}

export interface RatingsSummary {
  agent_id: string | null;
  total_ratings: number;
  average_rating: number;
  distribution: Record<string, number>;
  top_tags: Array<{ tag: string; count: number }>;
  recent_feedback: Array<{
    id: string;
    rating: number;
    feedback: string;
    tags: string[];
    created_at: string;
  }>;
}

export interface ListRatingsParams {
  thread_id?: string;
  agent_id?: string;
  min_rating?: number;
  max_rating?: number;
  limit?: number;
  offset?: number;
}

export const upsertRating = async (data: UpsertRatingData): Promise<ResponseRating> => {
  const response = await backendApi.post<ResponseRating>('/ratings', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listRatings = async (params: ListRatingsParams = {}): Promise<RatingsListResponse> => {
  const searchParams = new URLSearchParams();
  if (params.thread_id) searchParams.set('thread_id', params.thread_id);
  if (params.agent_id) searchParams.set('agent_id', params.agent_id);
  if (params.min_rating !== undefined) searchParams.set('min_rating', String(params.min_rating));
  if (params.max_rating !== undefined) searchParams.set('max_rating', String(params.max_rating));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  const response = await backendApi.get<RatingsListResponse>(
    `/ratings${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRatingsSummary = async (agentId?: string): Promise<RatingsSummary> => {
  const qs = agentId ? `?agent_id=${agentId}` : '';
  const response = await backendApi.get<RatingsSummary>(
    `/ratings/summary${qs}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteRating = async (ratingId: string): Promise<void> => {
  const response = await backendApi.delete(`/ratings/${ratingId}`);
  if (response.error) throw new Error(response.error.message);
};
