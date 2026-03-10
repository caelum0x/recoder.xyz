'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getThreadAnalytics,
  calculateThreadAnalytics,
  getThreadsAnalyticsOverview,
  getTopThreads,
  type ThreadAnalytics,
  type ThreadAnalyticsOverview,
  type TopThreadsResponse,
} from '@/lib/api/thread-analytics';

export const threadAnalyticsKeys = {
  all: ['thread-analytics'] as const,
  detail: (threadId: string) =>
    [...threadAnalyticsKeys.all, 'detail', threadId] as const,
  overview: () => [...threadAnalyticsKeys.all, 'overview'] as const,
  top: (metric: string, limit: number) =>
    [...threadAnalyticsKeys.all, 'top', metric, limit] as const,
};

export function useThreadAnalytics(
  threadId: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ThreadAnalytics>({
    queryKey: threadAnalyticsKeys.detail(threadId),
    queryFn: () => getThreadAnalytics(threadId),
    enabled: options?.enabled !== false && !!threadId,
    staleTime: 60_000,
  });
}

export function useCalculateThreadAnalytics(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => calculateThreadAnalytics(threadId),
    onSuccess: (data) => {
      queryClient.setQueryData(
        threadAnalyticsKeys.detail(threadId),
        data
      );
      queryClient.invalidateQueries({
        queryKey: threadAnalyticsKeys.overview(),
      });
    },
  });
}

export function useThreadsAnalyticsOverview(options?: { enabled?: boolean }) {
  return useQuery<ThreadAnalyticsOverview>({
    queryKey: threadAnalyticsKeys.overview(),
    queryFn: () => getThreadsAnalyticsOverview(),
    enabled: options?.enabled !== false,
    staleTime: 60_000,
  });
}

export function useTopThreads(
  metric: string = 'total_messages',
  limit: number = 10,
  options?: { enabled?: boolean }
) {
  return useQuery<TopThreadsResponse>({
    queryKey: threadAnalyticsKeys.top(metric, limit),
    queryFn: () => getTopThreads(metric, limit),
    enabled: options?.enabled !== false,
    staleTime: 60_000,
  });
}
