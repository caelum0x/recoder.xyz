'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  analyzeSentiment,
  getThreadSentiment,
  getSentimentTrend,
  getSentimentOverview,
  type SentimentScore,
  type SentimentTrendPoint,
  type SentimentOverview,
  type AnalyzeResult,
} from '@/lib/api/thread-sentiment';

export const sentimentKeys = {
  all: ['thread-sentiment'] as const,
  thread: (threadId: string) => [...sentimentKeys.all, 'thread', threadId] as const,
  trend: (threadId: string) => [...sentimentKeys.all, 'trend', threadId] as const,
  overview: () => [...sentimentKeys.all, 'overview'] as const,
};

export function useAnalyzeSentiment() {
  const queryClient = useQueryClient();

  return useMutation<AnalyzeResult, Error, string>({
    mutationFn: (threadId: string) => analyzeSentiment(threadId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: sentimentKeys.thread(data.thread_id),
      });
      queryClient.invalidateQueries({
        queryKey: sentimentKeys.trend(data.thread_id),
      });
      queryClient.invalidateQueries({
        queryKey: sentimentKeys.overview(),
      });
    },
  });
}

export function useThreadSentiment(
  threadId: string,
  options?: { enabled?: boolean }
) {
  return useQuery<SentimentScore[]>({
    queryKey: sentimentKeys.thread(threadId),
    queryFn: () => getThreadSentiment(threadId),
    enabled: options?.enabled !== false && !!threadId,
    staleTime: 60_000,
  });
}

export function useSentimentTrend(
  threadId: string,
  options?: { enabled?: boolean }
) {
  return useQuery<SentimentTrendPoint[]>({
    queryKey: sentimentKeys.trend(threadId),
    queryFn: () => getSentimentTrend(threadId),
    enabled: options?.enabled !== false && !!threadId,
    staleTime: 60_000,
  });
}

export function useSentimentOverview(options?: { enabled?: boolean }) {
  return useQuery<SentimentOverview>({
    queryKey: sentimentKeys.overview(),
    queryFn: () => getSentimentOverview(),
    enabled: options?.enabled !== false,
    staleTime: 60_000,
  });
}
