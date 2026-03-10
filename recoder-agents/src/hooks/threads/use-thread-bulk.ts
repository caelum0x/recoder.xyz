import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bulkDeleteThreads,
  bulkArchiveThreads,
  bulkUnarchiveThreads,
  getArchivedThreads,
  type ArchivedThreadsResponse,
} from '@/lib/api/thread-bulk';
import { threadKeys } from './keys';
import { pinnedThreadKeys } from './use-pinned-threads';

export const archivedThreadKeys = {
  all: ['archived-threads'] as const,
  list: (limit: number, offset: number) => ['archived-threads', 'list', limit, offset] as const,
};

export function useArchivedThreads(limit: number = 50, offset: number = 0) {
  return useQuery({
    queryKey: archivedThreadKeys.list(limit, offset),
    queryFn: (): Promise<ArchivedThreadsResponse> => getArchivedThreads(limit, offset),
    staleTime: 30_000,
  });
}

export function useBulkDeleteThreads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (threadIds: string[]) => bulkDeleteThreads(threadIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadKeys.lists() });
      qc.invalidateQueries({ queryKey: archivedThreadKeys.all });
      qc.invalidateQueries({ queryKey: pinnedThreadKeys.all });
    },
  });
}

export function useBulkArchiveThreads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (threadIds: string[]) => bulkArchiveThreads(threadIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadKeys.lists() });
      qc.invalidateQueries({ queryKey: archivedThreadKeys.all });
    },
  });
}

export function useBulkUnarchiveThreads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (threadIds: string[]) => bulkUnarchiveThreads(threadIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadKeys.lists() });
      qc.invalidateQueries({ queryKey: archivedThreadKeys.all });
    },
  });
}
