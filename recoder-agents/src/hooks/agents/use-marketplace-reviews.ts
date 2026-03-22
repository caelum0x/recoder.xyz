'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listListings,
  createListing,
  getListing,
  updateListing,
  deleteListing,
  installListing,
  submitListingReview,
  getListingReviews,
  markReviewHelpful,
  type MarketplaceListing,
  type ListingReview,
  type CreateListingData,
  type UpdateListingData,
  type SubmitReviewData,
  type MarketplaceFilters,
} from '@/lib/api/marketplace-reviews';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  listings: (filters?: MarketplaceFilters) =>
    [...marketplaceKeys.all, 'listings', filters] as const,
  listing: (id: string) => [...marketplaceKeys.all, 'listing', id] as const,
  reviews: (listingId: string) => [...marketplaceKeys.all, 'reviews', listingId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useListings(filters?: MarketplaceFilters) {
  return useQuery<MarketplaceListing[]>({
    queryKey: marketplaceKeys.listings(filters),
    queryFn: () => listListings(filters),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation<MarketplaceListing, Error, CreateListingData>({
    mutationFn: createListing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation<MarketplaceListing, Error, { id: string; data: UpdateListingData }>({
    mutationFn: ({ id, data }) => updateListing(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.listing(variables.id) });
    },
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteListing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

export function useInstallListing() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean; listing_id: string }, Error, string>({
    mutationFn: installListing,
    onSuccess: (_result, listingId) => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.listing(listingId) });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

export function useListingDetail(id: string) {
  return useQuery<MarketplaceListing>({
    queryKey: marketplaceKeys.listing(id),
    queryFn: () => getListing(id),
    enabled: Boolean(id),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useSubmitReview(listingId: string) {
  const queryClient = useQueryClient();
  return useMutation<ListingReview, Error, SubmitReviewData>({
    mutationFn: (data) => submitListingReview(listingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.reviews(listingId) });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.listing(listingId) });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

export function useListingReviews(listingId: string) {
  return useQuery<ListingReview[]>({
    queryKey: marketplaceKeys.reviews(listingId),
    queryFn: () => getListingReviews(listingId),
    enabled: Boolean(listingId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useMarkReviewHelpful() {
  const queryClient = useQueryClient();
  return useMutation<
    { success: boolean; review_id: string },
    Error,
    { reviewId: string; listingId: string }
  >({
    mutationFn: ({ reviewId }) => markReviewHelpful(reviewId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.reviews(variables.listingId),
      });
    },
  });
}

export type {
  MarketplaceListing,
  ListingReview,
  CreateListingData,
  UpdateListingData,
  SubmitReviewData,
  MarketplaceFilters,
};
