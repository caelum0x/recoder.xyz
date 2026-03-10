'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMarketplaceListings,
  getMarketplaceListing,
  publishAgent,
  installAgent,
  reviewListing,
  getListingReviews,
  getMyListings,
  updateListing,
  deleteListing,
  type ListingsResponse,
  type MarketplaceListing,
  type ListingsQueryParams,
  type PublishRequest,
  type ReviewRequest,
  type ReviewsResponse,
  type UpdateListingRequest,
} from '@/lib/api/marketplace';

export function useMarketplaceListings(params?: ListingsQueryParams) {
  const { category, search, sort = 'popular', limit = 20, offset = 0 } = params ?? {};

  return useQuery<ListingsResponse>({
    queryKey: ['marketplace-listings', category, search, sort, limit, offset],
    queryFn: () =>
      getMarketplaceListings({ category, search, sort, limit, offset }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarketplaceListing(listingId: string | null) {
  return useQuery<MarketplaceListing>({
    queryKey: ['marketplace-listing', listingId],
    queryFn: () => getMarketplaceListing(listingId!),
    enabled: !!listingId,
    staleTime: 30_000,
  });
}

export function useListingReviews(listingId: string | null) {
  return useQuery<ReviewsResponse>({
    queryKey: ['marketplace-reviews', listingId],
    queryFn: () => getListingReviews(listingId!),
    enabled: !!listingId,
    staleTime: 30_000,
  });
}

export function useMyListings() {
  return useQuery<ListingsResponse>({
    queryKey: ['marketplace-my-listings'],
    queryFn: getMyListings,
    staleTime: 30_000,
  });
}

export function usePublishAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PublishRequest) => publishAgent(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-my-listings'] });
    },
  });
}

export function useInstallAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) => installAgent(listingId),
    onSuccess: (_data, listingId) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}

export function useReviewAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, body }: { listingId: string; body: ReviewRequest }) =>
      reviewListing(listingId, body),
    onSuccess: (_data, { listingId }) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-reviews', listingId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listing', listingId] });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, body }: { listingId: string; body: UpdateListingRequest }) =>
      updateListing(listingId, body),
    onSuccess: (_data, { listingId }) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
    },
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) => deleteListing(listingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-my-listings'] });
    },
  });
}
