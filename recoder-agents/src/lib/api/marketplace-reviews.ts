import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface ReviewItem {
  id: string;
  user_id: string;
  listing_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_user: boolean;
  helpful_count: number;
  user_voted_helpful: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewListResponse {
  reviews: ReviewItem[];
  total: number;
}

export interface ReviewSummary {
  listing_id: string;
  average_rating: number;
  total_reviews: number;
  distribution: Record<number, number>;
}

export interface CreateReviewRequest {
  rating: number;
  title?: string;
  body?: string;
}

export interface HelpfulResponse {
  review_id: string;
  helpful_count: number;
  user_voted: boolean;
  is_helpful: boolean;
}

export type ReviewSortOption = 'recent' | 'highest' | 'lowest' | 'helpful';

// ============================================================================
// API Functions
// ============================================================================

export async function createOrUpdateReview(
  listingId: string,
  body: CreateReviewRequest,
): Promise<ReviewItem> {
  try {
    const response = await backendApi.post<ReviewItem>(
      `/marketplace/${listingId}/reviews`,
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

export async function getListingReviewsEnhanced(
  listingId: string,
  params?: { sort?: ReviewSortOption; limit?: number; offset?: number },
): Promise<ReviewListResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();

    const response = await backendApi.get<ReviewListResponse>(
      `/marketplace/${listingId}/reviews${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get listing reviews', resource: 'marketplace-reviews' });
    throw error;
  }
}

export async function getReviewSummary(
  listingId: string,
): Promise<ReviewSummary> {
  try {
    const response = await backendApi.get<ReviewSummary>(
      `/marketplace/${listingId}/reviews/summary`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get review summary', resource: 'marketplace-reviews' });
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
  isHelpful: boolean,
): Promise<HelpfulResponse> {
  try {
    const response = await backendApi.post<HelpfulResponse>(
      `/marketplace/reviews/${reviewId}/helpful`,
      { is_helpful: isHelpful },
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'toggle helpful', resource: 'marketplace-reviews' });
    throw error;
  }
}
