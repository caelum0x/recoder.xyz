'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createReview,
  getMarketplaceReviews,
  updateReview,
  deleteReview,
  toggleHelpful,
  getRatingSummary,
  type MarketplaceReview,
  type ReviewListResponse,
  type RatingSummary,
  type CreateReviewRequest,
  type UpdateReviewRequest,
  type HelpfulToggleResponse,
  type ReviewFilters,
} from '@/lib/api/marketplace-reviews';

export function useMarketplaceReviews(filters?: ReviewFilters) {
  return useQuery<ReviewListResponse>({
    queryKey: ['marketplace-reviews', filters],
    queryFn: () => getMarketplaceReviews(filters),
    staleTime: 30_000,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation<MarketplaceReview, Error, CreateReviewRequest>({
    mutationFn: (body) => createReview(body),
    onSuccess: (_data, body) => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews'],
      });
      queryClient.invalidateQueries({
        queryKey: ['rating-summary', body.agent_id],
      });
    },
  });
}

export function useUpdateReview() {
  const queryClient = useQueryClient();

  return useMutation<
    MarketplaceReview,
    Error,
    { reviewId: string; body: UpdateReviewRequest; agentId: string }
  >({
    mutationFn: ({ reviewId, body }) => updateReview(reviewId, body),
    onSuccess: (_data, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews'],
      });
      queryClient.invalidateQueries({
        queryKey: ['rating-summary', agentId],
      });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; review_id: string },
    Error,
    { reviewId: string; agentId: string }
  >({
    mutationFn: ({ reviewId }) => deleteReview(reviewId),
    onSuccess: (_data, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews'],
      });
      queryClient.invalidateQueries({
        queryKey: ['rating-summary', agentId],
      });
    },
  });
}

export function useVoteHelpful() {
  const queryClient = useQueryClient();

  return useMutation<HelpfulToggleResponse, Error, { reviewId: string }>({
    mutationFn: ({ reviewId }) => toggleHelpful(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['marketplace-reviews'],
      });
    },
  });
}

export function useRatingSummary(agentId: string | null) {
  return useQuery<RatingSummary>({
    queryKey: ['rating-summary', agentId],
    queryFn: () => getRatingSummary(agentId!),
    enabled: !!agentId,
    staleTime: 30_000,
  });
}
