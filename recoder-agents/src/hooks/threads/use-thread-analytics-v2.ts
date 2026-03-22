import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAnalyticsSummary,
  getAnalyticsTrends,
  getTopThreadsV2,
  upsertThreadAnalytics,
  getThreadAnalyticsV2,
  recordThreadEvent,
  listThreadEvents,
} from '@/lib/api/thread-analytics-v2';

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: ['thread-analytics-v2', 'summary'],
    queryFn: getAnalyticsSummary,
  });
}

export function useAnalyticsTrends() {
  return useQuery({
    queryKey: ['thread-analytics-v2', 'trends'],
    queryFn: getAnalyticsTrends,
  });
}

export function useTopThreadsV2(limit = 10) {
  return useQuery({
    queryKey: ['thread-analytics-v2', 'top-threads', limit],
    queryFn: () => getTopThreadsV2(limit),
  });
}

export function useThreadAnalyticsV2(threadId: string) {
  return useQuery({
    queryKey: ['thread-analytics-v2', threadId],
    queryFn: () => getThreadAnalyticsV2(threadId),
    enabled: !!threadId,
  });
}

export function useUpsertThreadAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      data,
    }: {
      threadId: string;
      data: Parameters<typeof upsertThreadAnalytics>[1];
    }) => upsertThreadAnalytics(threadId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thread-analytics-v2'] }),
  });
}

export function useRecordThreadEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      data,
    }: {
      threadId: string;
      data: Parameters<typeof recordThreadEvent>[1];
    }) => recordThreadEvent(threadId, data),
    onSuccess: (_data, { threadId }) =>
      qc.invalidateQueries({ queryKey: ['thread-analytics-v2', threadId, 'events'] }),
  });
}

export function useThreadEvents(threadId: string) {
  return useQuery({
    queryKey: ['thread-analytics-v2', threadId, 'events'],
    queryFn: () => listThreadEvents(threadId),
    enabled: !!threadId,
  });
}
