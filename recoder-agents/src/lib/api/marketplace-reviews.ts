import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface MarketplaceReview {
  id: string;
  user_id: string;
  agent_id: string;
  rating: number;
  title: string | null;
  content: string | null;
  pros: string[];
  cons: string[];
  is_verified: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewListResponse {
  reviews: MarketplaceReview[];
  total: number;
}

export interface RatingSummary {
  agent_id: string;
  average_rating: number;
  total_reviews: number;
  distribution: Record<number, number>;
}

export interface CreateReviewRequest {
  agent_id: string;
  rating: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
}

export interface UpdateReviewRequest {
  rating?: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
}

export interface HelpfulToggleResponse {
  review_id: string;
  helpful_count: number;
  voted: boolean;
}

export type ReviewSortOption = 'recent' | 'highest' | 'most_helpful';

export interface ReviewFilters {
  agent_id?: string;
  rating?: number;
  sort_by?: ReviewSortOption;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function createReview(
  body: CreateReviewRequest,
): Promise<MarketplaceReview> {
  try {
    const response = await backendApi.post<MarketplaceReview>(
      '/marketplace/reviews',
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'create review', resource: 'marketplace-reviews' });
    throw error;
  }
}

export async function getMarketplaceReviews(
  filters?: ReviewFilters,
): Promise<ReviewListResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (filters?.agent_id) searchParams.set('agent_id', filters.agent_id);
    if (filters?.rating) searchParams.set('rating', String(filters.rating));
    if (filters?.sort_by) searchParams.set('sort_by', filters.sort_by);
    if (filters?.limit) searchParams.set('limit', String(filters.limit));
    if (filters?.offset) searchParams.set('offset', String(filters.offset));
    const qs = searchParams.toString();

    const response = await backendApi.get<ReviewListResponse>(
      `/marketplace/reviews${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get reviews', resource: 'marketplace-reviews' });
    throw error;
  }
}

export async function updateReview(
  reviewId: string,
  body: UpdateReviewRequest,
): Promise<MarketplaceReview> {
  try {
    const response = await backendApi.patch<MarketplaceReview>(
      `/marketplace/reviews/${reviewId}`,
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'update review', resource: 'marketplace-reviews' });
    throw error;
  }
}

export async function deleteReview(
  reviewId: string,
): Promise<{ deleted: boolean; review_id: string }> {
  try {
    const response = await backendApi.delete<{ deleted: boolean; review_id: string }>(
      `/marketplace/reviews/${reviewId}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'delete review', resource: 'marketplace-reviews' });
    throw error;
  }
}

export async function toggleHelpful(
  reviewId: string,
): Promise<HelpfulToggleResponse> {
  try {
    const response = await backendApi.post<HelpfulToggleResponse>(
      `/marketplace/reviews/${reviewId}/helpful`,
      {},
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'toggle helpful', resource: 'marketplace-reviews' });
    throw error;
  }
}

export async function getRatingSummary(
  agentId: string,
): Promise<RatingSummary> {
  try {
    const response = await backendApi.get<RatingSummary>(
      `/marketplace/agents/${agentId}/rating-summary`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get rating summary', resource: 'marketplace-reviews' });
    throw error;
  }
}
