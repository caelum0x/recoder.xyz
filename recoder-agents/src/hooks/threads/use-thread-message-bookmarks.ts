import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createMessageBookmark,
  getThreadMessageBookmarks,
  updateMessageBookmark,
  deleteMessageBookmark,
  getAllMessageBookmarks,
  createMessageBookmarkCollection,
  getMessageBookmarkCollections,
  updateMessageBookmarkCollection,
  deleteMessageBookmarkCollection,
  type CreateMessageBookmarkData,
  type UpdateMessageBookmarkData,
  type CreateMessageBookmarkCollectionData,
  type UpdateMessageBookmarkCollectionData,
} from '@/lib/api/thread-message-bookmarks';

export function useThreadBookmarks(threadId: string) {
  return useQuery({
    queryKey: ['thread-message-bookmarks', threadId],
    queryFn: () => getThreadMessageBookmarks(threadId),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useAllBookmarks(options?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['all-message-bookmarks', options],
    queryFn: () => getAllMessageBookmarks(options),
    staleTime: 30_000,
  });
}

export function useCreateBookmark(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMessageBookmarkData) =>
      createMessageBookmark(threadId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-message-bookmarks', threadId] });
      qc.invalidateQueries({ queryKey: ['all-message-bookmarks'] });
    },
  });
}

export function useUpdateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookmarkId,
      data,
    }: {
      bookmarkId: string;
      data: UpdateMessageBookmarkData;
    }) => updateMessageBookmark(bookmarkId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-message-bookmarks'] });
      qc.invalidateQueries({ queryKey: ['all-message-bookmarks'] });
    },
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookmarkId: string) => deleteMessageBookmark(bookmarkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread-message-bookmarks'] });
      qc.invalidateQueries({ queryKey: ['all-message-bookmarks'] });
    },
  });
}

export function useBookmarkCollections() {
  return useQuery({
    queryKey: ['message-bookmark-collections'],
    queryFn: getMessageBookmarkCollections,
    staleTime: 60_000,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMessageBookmarkCollectionData) =>
      createMessageBookmarkCollection(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-bookmark-collections'] });
    },
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      data,
    }: {
      collectionId: string;
      data: UpdateMessageBookmarkCollectionData;
    }) => updateMessageBookmarkCollection(collectionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-bookmark-collections'] });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => deleteMessageBookmarkCollection(collectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-bookmark-collections'] });
    },
  });
}
