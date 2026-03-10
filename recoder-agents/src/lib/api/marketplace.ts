import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface MarketplaceListing {
  id: string;
  agent_id: string;
  publisher_id: string;
  title: string;
  description: string;
  short_description: string;
  category: string;
  tags: string[];
  icon_url: string | null;
  is_public: boolean;
  install_count: number;
  avg_rating: number;
  review_count: number;
  status: 'draft' | 'published' | 'under_review' | 'rejected';
  agent_config: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingsResponse {
  listings: MarketplaceListing[];
  total: number;
  has_more: boolean;
}

export interface PublishRequest {
  agent_id: string;
  title: string;
  short_description: string;
  description: string;
  category: string;
  tags: string[];
}

export interface PublishResponse {
  id: string;
  status: string;
  published_at: string;
}

export interface InstallResponse {
  installed: boolean;
  new_agent_id: string | null;
}

export interface ReviewRequest {
  rating: number;
  comment: string;
}

export interface ReviewItem {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewsResponse {
  reviews: ReviewItem[];
  total: number;
}

export interface ListingsQueryParams {
  category?: string;
  search?: string;
  sort?: 'popular' | 'newest' | 'top_rated';
  limit?: number;
  offset?: number;
}

export interface UpdateListingRequest {
  title?: string;
  description?: string;
  short_description?: string;
  category?: string;
  tags?: string[];
}

// ============================================================================
// API Functions
// ============================================================================

export async function getMarketplaceListings(
  params?: ListingsQueryParams,
): Promise<ListingsResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sort) searchParams.set('sort', params.sort);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    const response = await backendApi.get<ListingsResponse>(
      `/marketplace/listings${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get marketplace listings', resource: 'marketplace' });
    throw error;
  }
}

export async function getMarketplaceListing(
  listingId: string,
): Promise<MarketplaceListing> {
  try {
    const response = await backendApi.get<MarketplaceListing>(
      `/marketplace/listings/${listingId}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get marketplace listing', resource: 'marketplace' });
    throw error;
  }
}

export async function publishAgent(
  body: PublishRequest,
): Promise<PublishResponse> {
  try {
    const response = await backendApi.post<PublishResponse>(
      '/marketplace/publish',
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'publish agent', resource: 'marketplace' });
    throw error;
  }
}

export async function installAgent(
  listingId: string,
): Promise<InstallResponse> {
  try {
    const response = await backendApi.post<InstallResponse>(
      `/marketplace/listings/${listingId}/install`,
      {},
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'install agent', resource: 'marketplace' });
    throw error;
  }
}

export async function reviewListing(
  listingId: string,
  body: ReviewRequest,
): Promise<ReviewItem> {
  try {
    const response = await backendApi.post<ReviewItem>(
      `/marketplace/listings/${listingId}/review`,
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'review listing', resource: 'marketplace' });
    throw error;
  }
}

export async function getListingReviews(
  listingId: string,
  params?: { limit?: number; offset?: number },
): Promise<ReviewsResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    const response = await backendApi.get<ReviewsResponse>(
      `/marketplace/listings/${listingId}/reviews${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get listing reviews', resource: 'marketplace' });
    throw error;
  }
}

export async function getMyListings(): Promise<ListingsResponse> {
  try {
    const response = await backendApi.get<ListingsResponse>(
      '/marketplace/my-listings',
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get my listings', resource: 'marketplace' });
    throw error;
  }
}

export async function updateListing(
  listingId: string,
  body: UpdateListingRequest,
): Promise<MarketplaceListing> {
  try {
    const response = await backendApi.patch<MarketplaceListing>(
      `/marketplace/listings/${listingId}`,
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'update listing', resource: 'marketplace' });
    throw error;
  }
}

export async function deleteListing(
  listingId: string,
): Promise<{ deleted: boolean }> {
  try {
    const response = await backendApi.delete<{ deleted: boolean }>(
      `/marketplace/listings/${listingId}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'delete listing', resource: 'marketplace' });
    throw error;
  }
}
