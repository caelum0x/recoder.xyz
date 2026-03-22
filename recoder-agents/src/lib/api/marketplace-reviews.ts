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
      { showErrors: true },
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
      { showErrors: true },
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
      { showErrors: true },
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
      { showErrors: true },
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
      { showErrors: true },
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
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get rating summary', resource: 'marketplace-reviews' });
    throw error;
  }
}

// ============================================================================
// Listing-based marketplace API (Sprint 73 Phase 4)
// ============================================================================

export interface MarketplaceListing {
  id: string;
  user_id: string;
  agent_id: string;
  listing_title: string;
  listing_description: string | null;
  category: string;
  tags: string[];
  price_type: 'free' | 'paid' | 'freemium';
  is_published: boolean;
  install_count: number;
  view_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListingReview {
  id: string;
  listing_id: string;
  reviewer_user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
}

export interface CreateListingData {
  agent_id: string;
  listing_title: string;
  listing_description?: string;
  category?: string;
  tags?: string[];
  price_type?: 'free' | 'paid' | 'freemium';
  is_published?: boolean;
}

export interface UpdateListingData {
  listing_title?: string;
  listing_description?: string;
  category?: string;
  tags?: string[];
  price_type?: 'free' | 'paid' | 'freemium';
  is_published?: boolean;
}

export interface SubmitReviewData {
  rating: number;
  title?: string;
  body?: string;
}

export interface MarketplaceFilters {
  category?: string;
  price_type?: string;
  search?: string;
  limit?: number;
}

export const listListings = async (filters?: MarketplaceFilters): Promise<MarketplaceListing[]> => {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.price_type) params.set('price_type', filters.price_type);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const response = await backendApi.get<MarketplaceListing[]>(
    `/marketplace/listings${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createListing = async (data: CreateListingData): Promise<MarketplaceListing> => {
  const response = await backendApi.post<MarketplaceListing>('/marketplace/listings', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getListing = async (id: string): Promise<MarketplaceListing> => {
  const response = await backendApi.get<MarketplaceListing>(`/marketplace/listings/${id}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateListing = async (
  id: string,
  data: UpdateListingData
): Promise<MarketplaceListing> => {
  const response = await backendApi.patch<MarketplaceListing>(`/marketplace/listings/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteListing = async (id: string): Promise<void> => {
  const response = await backendApi.delete(`/marketplace/listings/${id}`);
  if (response.error) throw new Error(response.error.message);
};

export const installListing = async (
  id: string
): Promise<{ success: boolean; listing_id: string }> => {
  const response = await backendApi.post<{ success: boolean; listing_id: string }>(
    `/marketplace/listings/${id}/install`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const submitListingReview = async (
  listingId: string,
  data: SubmitReviewData
): Promise<ListingReview> => {
  const response = await backendApi.post<ListingReview>(
    `/marketplace/listings/${listingId}/reviews`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getListingReviews = async (listingId: string): Promise<ListingReview[]> => {
  const response = await backendApi.get<ListingReview[]>(
    `/marketplace/listings/${listingId}/reviews`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const markReviewHelpful = async (
  reviewId: string
): Promise<{ success: boolean; review_id: string }> => {
  const response = await backendApi.post<{ success: boolean; review_id: string }>(
    `/marketplace/reviews/${reviewId}/helpful`,
    {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
