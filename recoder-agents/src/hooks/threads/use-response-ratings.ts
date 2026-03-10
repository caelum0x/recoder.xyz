import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  upsertRating,
  listRatings,
  getRatingsSummary,
  deleteRating,
  type UpsertRatingData,
  type ListRatingsParams,
} from '@/lib/api/response-ratings';

const ratingKeys = {
  all: ['response-ratings'] as const,
  list: (params?: ListRatingsParams) => ['response-ratings', 'list', params] as const,
  thread: (threadId: string) => ['response-ratings', 'thread', threadId] as const,
  summary: (agentId?: string) => ['response-ratings', 'summary', agentId] as const,
};

export function useRatings(params: ListRatingsParams = {}) {
  return useQuery({
    queryKey: ratingKeys.list(params),
    queryFn: () => listRatings(params),
    staleTime: 30_000,
  });
}

export function useThreadRatings(threadId: string) {
  return useQuery({
    queryKey: ratingKeys.thread(threadId),
    queryFn: () => listRatings({ thread_id: threadId, limit: 200 }),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useRatingsSummary(agentId?: string) {
  return useQuery({
    queryKey: ratingKeys.summary(agentId),
    queryFn: () => getRatingsSummary(agentId),
    enabled: agentId !== undefined,
    staleTime: 60_000,
  });
}

export function useUpsertRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertRatingData) => upsertRating(data),
    onSuccess: (_, variables) => {
      // Invalidate thread-level ratings
      qc.invalidateQueries({ queryKey: ratingKeys.thread(variables.thread_id) });
      // Invalidate all rating lists and summaries
      qc.invalidateQueries({ queryKey: ratingKeys.all });
    },
  });
}

export function useDeleteRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ratingId: string) => deleteRating(ratingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ratingKeys.all });
    },
  });
}
