import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  summarizeThread,
  getThreadSummary,
  getRecentSummaries,
  deleteSummary,
  getSummaryStats,
} from '@/lib/api/thread-summaries';

const summaryKeys = {
  all: ['thread-summaries'] as const,
  thread: (threadId: string) => ['thread-summaries', threadId] as const,
  recent: () => ['thread-summaries', 'recent'] as const,
  stats: () => ['thread-summaries', 'stats'] as const,
};

export function useSummarizeThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, summaryType }: { threadId: string; summaryType?: string }) =>
      summarizeThread(threadId, summaryType),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: summaryKeys.thread(variables.threadId) });
      qc.invalidateQueries({ queryKey: summaryKeys.recent() });
      qc.invalidateQueries({ queryKey: summaryKeys.stats() });
    },
  });
}

export function useThreadSummary(threadId: string) {
  return useQuery({
    queryKey: summaryKeys.thread(threadId),
    queryFn: () => getThreadSummary(threadId),
    enabled: !!threadId,
    staleTime: 60_000,
  });
}

export function useRecentSummaries(limit: number = 20) {
  return useQuery({
    queryKey: summaryKeys.recent(),
    queryFn: () => getRecentSummaries(limit),
    staleTime: 30_000,
  });
}

export function useDeleteSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (summaryId: string) => deleteSummary(summaryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: summaryKeys.all });
    },
  });
}

export function useSummaryStats() {
  return useQuery({
    queryKey: summaryKeys.stats(),
    queryFn: () => getSummaryStats(),
    staleTime: 60_000,
  });
}
