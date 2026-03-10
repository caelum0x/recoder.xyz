import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  moveFolder,
  duplicateFolder,
  bulkMoveEntries,
  bulkDeleteEntries,
  getKbStats,
} from '@/lib/api/kb-folders';

export function useMoveFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ folderId, parentFolderId }: { folderId: string; parentFolderId: string | null }) =>
      moveFolder(folderId, parentFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
    },
  });
}

export function useDuplicateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (folderId: string) => duplicateFolder(folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
    },
  });
}

export function useBulkMoveEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryIds, targetFolderId }: { entryIds: string[]; targetFolderId: string }) =>
      bulkMoveEntries(entryIds, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
    },
  });
}

export function useBulkDeleteEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryIds: string[]) => bulkDeleteEntries(entryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
    },
  });
}

export function useKbStats() {
  return useQuery({
    queryKey: ['kb-stats'],
    queryFn: getKbStats,
    staleTime: 30_000,
  });
}
