'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  exportThreadV2,
  getThreadExports,
  getExportDetail,
  deleteExport,
  getRecentExports,
  type ExportRecord,
  type CreateExportRequest,
} from '@/lib/api/thread-export-system';

export const threadExportKeys = {
  all: ['thread-exports-v2'] as const,
  thread: (threadId: string) => [...threadExportKeys.all, 'thread', threadId] as const,
  detail: (exportId: string) => [...threadExportKeys.all, 'detail', exportId] as const,
  recent: () => [...threadExportKeys.all, 'recent'] as const,
};

export function useExportThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, request }: { threadId: string; request: CreateExportRequest }) =>
      exportThreadV2(threadId, request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: threadExportKeys.thread(variables.threadId) });
      queryClient.invalidateQueries({ queryKey: threadExportKeys.recent() });
    },
  });
}

export function useThreadExports(threadId: string) {
  return useQuery<ExportRecord[]>({
    queryKey: threadExportKeys.thread(threadId),
    queryFn: () => getThreadExports(threadId),
    enabled: !!threadId,
    staleTime: 15_000,
  });
}

export function useExportDetail(exportId: string) {
  return useQuery<ExportRecord>({
    queryKey: threadExportKeys.detail(exportId),
    queryFn: () => getExportDetail(exportId),
    enabled: !!exportId,
    staleTime: 10_000,
  });
}

export function useDeleteExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (exportId: string) => deleteExport(exportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadExportKeys.all });
    },
  });
}

export function useRecentExports() {
  return useQuery<ExportRecord[]>({
    queryKey: threadExportKeys.recent(),
    queryFn: () => getRecentExports(),
    staleTime: 15_000,
  });
}
