import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCollection,
  getCollections,
  updateCollection,
  deleteCollection,
  createThreadBookmark,
  getThreadBookmarks,
  deleteThreadBookmark,
  updateThreadBookmark,
  type CreateCollectionData,
  type UpdateCollectionData,
  type CreateBookmarkData,
  type UpdateBookmarkData,
} from '@/lib/api/thread-bookmarks';

const bookmarkKeys = {
  all: ['thread-bookmarks'] as const,
  collections: () => [...bookmarkKeys.all, 'collections'] as const,
  bookmarks: (collectionId?: string) =>
    [...bookmarkKeys.all, 'list', collectionId] as const,
};

// ============================================================================
// Collection Hooks
// ============================================================================

export function useBookmarkCollections() {
  return useQuery({
    queryKey: bookmarkKeys.collections(),
    queryFn: getCollections,
    staleTime: 60_000,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCollectionData) => createCollection(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.collections() });
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
      data: UpdateCollectionData;
    }) => updateCollection(collectionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.collections() });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => deleteCollection(collectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

// ============================================================================
// Bookmark Hooks
// ============================================================================

export function useThreadBookmarksList(collectionId?: string) {
  return useQuery({
    queryKey: bookmarkKeys.bookmarks(collectionId),
    queryFn: () => getThreadBookmarks(collectionId),
    staleTime: 30_000,
  });
}

export function useToggleThreadBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookmarkData) => createThreadBookmark(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

export function useDeleteThreadBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookmarkId: string) => deleteThreadBookmark(bookmarkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

export function useUpdateThreadBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookmarkId,
      data,
    }: {
      bookmarkId: string;
      data: UpdateBookmarkData;
    }) => updateThreadBookmark(bookmarkId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}
