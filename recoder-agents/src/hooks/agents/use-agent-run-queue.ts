'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  enqueueRun,
  listQueueEntries,
  cancelQueueEntry,
  updateQueuePriority,
  getQueueStats,
  getQueueSettings,
  updateQueueSettings,
  processNextEntry,
  type QueueEntry,
  type QueueStats,
  type QueueSettings,
  type QueueFilters,
  type EnqueueRequest,
  type UpdateQueueSettingsRequest,
} from '@/lib/api/agent-run-queue';

export const runQueueKeys = {
  all: ['run-queue'] as const,
  list: (filters?: QueueFilters) => [...runQueueKeys.all, 'list', filters] as const,
  stats: () => [...runQueueKeys.all, 'stats'] as const,
  settings: () => [...runQueueKeys.all, 'settings'] as const,
};

export function useRunQueue(filters?: QueueFilters) {
  return useQuery<QueueEntry[]>({
    queryKey: runQueueKeys.list(filters),
    queryFn: () => listQueueEntries(filters),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useEnqueueRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EnqueueRequest) => enqueueRun(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runQueueKeys.all });
    },
  });
}

export function useCancelQueueEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) => cancelQueueEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runQueueKeys.all });
    },
  });
}

export function useUpdatePriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, priority }: { entryId: string; priority: number }) =>
      updateQueuePriority(entryId, priority),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runQueueKeys.list() });
    },
  });
}

export function useQueueStats() {
  return useQuery<QueueStats>({
    queryKey: runQueueKeys.stats(),
    queryFn: () => getQueueStats(),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useQueueSettings() {
  return useQuery<QueueSettings>({
    queryKey: runQueueKeys.settings(),
    queryFn: () => getQueueSettings(),
    staleTime: 30_000,
  });
}

export function useUpdateQueueSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateQueueSettingsRequest) => updateQueueSettings(data),
    onSuccess: (data) => {
      queryClient.setQueryData(runQueueKeys.settings(), data);
    },
  });
}

export function useProcessNext() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => processNextEntry(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runQueueKeys.all });
    },
  });
}
