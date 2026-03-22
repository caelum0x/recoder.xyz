'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  summarizeThread,
  getThreadSummary,
  listThreadSummaries,
  deleteThreadSummary,
  getSummarizationConfig,
  updateSummarizationConfig,
  getSummarizationStats,
  type ThreadSummary,
  type SummarizationConfig,
  type SummarizeData,
  type SummarizationStats,
} from '@/lib/api/thread-summarization';

const summaryKey = (threadId: string) => ['thread-summary', threadId] as const;
const summariesKey = (threadId: string) => ['thread-summaries', threadId] as const;
const configKey = ['summarization-config'] as const;
const statsKey = ['summarization-stats'] as const;

export function useSummarizeThread() {
  const queryClient = useQueryClient();

  return useMutation<ThreadSummary, Error, { threadId: string; data: SummarizeData }>({
    mutationFn: ({ threadId, data }) => summarizeThread(threadId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: summaryKey(result.thread_id) });
      queryClient.invalidateQueries({ queryKey: summariesKey(result.thread_id) });
      queryClient.invalidateQueries({ queryKey: statsKey });
    },
  });
}

export function useThreadSummary(threadId: string) {
  return useQuery<ThreadSummary>({
    queryKey: summaryKey(threadId),
    queryFn: () => getThreadSummary(threadId),
    staleTime: 60_000,
    enabled: !!threadId,
    retry: false,
  });
}

export function useThreadSummaries(threadId: string) {
  return useQuery<ThreadSummary[]>({
    queryKey: summariesKey(threadId),
    queryFn: () => listThreadSummaries(threadId),
    staleTime: 30_000,
    enabled: !!threadId,
  });
}

export function useDeleteThreadSummary(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (summaryId) => deleteThreadSummary(threadId, summaryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: summaryKey(threadId) });
      queryClient.invalidateQueries({ queryKey: summariesKey(threadId) });
      queryClient.invalidateQueries({ queryKey: statsKey });
    },
  });
}

export function useSummarizationConfig() {
  return useQuery<SummarizationConfig>({
    queryKey: configKey,
    queryFn: () => getSummarizationConfig(),
    staleTime: 60_000,
  });
}

export function useUpdateSummarizationConfig() {
  const queryClient = useQueryClient();

  return useMutation<SummarizationConfig, Error, Partial<SummarizationConfig>>({
    mutationFn: (data) => updateSummarizationConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configKey });
    },
  });
}

export function useSummarizationStats() {
  return useQuery<SummarizationStats>({
    queryKey: statsKey,
    queryFn: () => getSummarizationStats(),
    staleTime: 60_000,
  });
}
