'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createOrUpdateReview,
  getListingReviewsEnhanced,
  getReviewSummary,
  deleteReview,
  toggleHelpful,
  type ReviewListResponse,
  type ReviewSummary,
  type ReviewItem,
  type CreateReviewRequest,
  type HelpfulResponse,
  type ReviewSortOption,
} from '@/lib/api/marketplace-reviews';

export function useListingReviewsEnhanced(
  listingId: string | null,
  sort: ReviewSortOption = 'recent',
  limit: number = 20,
) {
  return useQuery<ReviewListResponse>({
    queryKey: ['marketplace-reviews-enhanced', listingId, sort, limit],
    queryFn: () => getListingReviewsEnhanced(listingId!, { sort, limit }),
    enabled: !!listingId,
    staleTime: 30_000,
  });
}

export function useReviewSummary(listingId: string | null) {
  return useQuery<ReviewSummary>({
    queryKey: ['marketplace-review-summary', listingId],
    queryFn: () => getReviewSummary(listingId!),
    enabled: !!listingId,
    staleTime: 30_000,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation<
    ReviewItem,
    Error,
    { listingId: string; body: CreateReviewRequest }
  >({
    mutationFn: ({ listingId, body }) => createOrUpdateReview(listingId, body),
    onSuccess: (_data, { listingId }) => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews-enhanced', listingId],
      });
      queryClient.invalidateQueries({
        queryKey: ['marketplace-review-summary', listingId],
      });
      queryClient.invalidateQueries({
        queryKey: ['marketplace-listing', listingId],
      });
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews', listingId],
      });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; review_id: string },
    Error,
    { reviewId: string; listingId: string }
  >({
    mutationFn: ({ reviewId }) => deleteReview(reviewId),
    onSuccess: (_data, { listingId }) => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews-enhanced', listingId],
      });
      queryClient.invalidateQueries({
        queryKey: ['marketplace-review-summary', listingId],
      });
      queryClient.invalidateQueries({
        queryKey: ['marketplace-listing', listingId],
      });
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews', listingId],
      });
    },
  });
}

export function useMarkHelpful() {
  const queryClient = useQueryClient();

  return useMutation<
    HelpfulResponse,
    Error,
    { reviewId: string; isHelpful: boolean; listingId: string }
  >({
    mutationFn: ({ reviewId, isHelpful }) => toggleHelpful(reviewId, isHelpful),
    onSuccess: (_data, { listingId }) => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews-enhanced', listingId],
      });
    },
  });
}
