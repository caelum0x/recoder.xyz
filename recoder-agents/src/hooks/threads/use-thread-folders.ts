'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getThreadFolders,
  createThreadFolder,
  updateThreadFolder,
  deleteThreadFolder,
  assignThreadToFolder,
  removeThreadFromFolder,
  getFolderThreads,
  type CreateFolderData,
  type UpdateFolderData,
} from '@/lib/api/thread-folders';

const folderKeys = {
  all: ['thread-folders'] as const,
  lists: () => [...folderKeys.all, 'list'] as const,
  threads: (folderId: string) => [...folderKeys.all, 'threads', folderId] as const,
};

export function useThreadFolders() {
  return useQuery({
    queryKey: folderKeys.lists(),
    queryFn: getThreadFolders,
    staleTime: 60_000,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFolderData) => createThreadFolder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.lists() });
    },
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, data }: { folderId: string; data: UpdateFolderData }) =>
      updateThreadFolder(folderId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.lists() });
    },
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) => deleteThreadFolder(folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

export function useAssignThreadToFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, folderId }: { threadId: string; folderId: string }) =>
      assignThreadToFolder(threadId, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

export function useRemoveThreadFromFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, folderId }: { threadId: string; folderId: string }) =>
      removeThreadFromFolder(threadId, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

export function useFolderThreads(folderId: string) {
  return useQuery({
    queryKey: folderKeys.threads(folderId),
    queryFn: () => getFolderThreads(folderId),
    enabled: !!folderId,
    staleTime: 30_000,
  });
}
