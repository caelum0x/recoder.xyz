import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createBookmark,
  getBookmarks,
  deleteBookmark,
  updateBookmarkNote,
  type CreateBookmarkData,
  type UpdateBookmarkNoteData,
} from '@/lib/api/message-bookmarks';

const bookmarkKeys = {
  all: ['message-bookmarks'] as const,
  lists: () => [...bookmarkKeys.all, 'list'] as const,
  thread: (threadId: string) =>
    [...bookmarkKeys.all, 'thread', threadId] as const,
};

export function useBookmarks(threadId?: string) {
  return useQuery({
    queryKey: threadId
      ? bookmarkKeys.thread(threadId)
      : bookmarkKeys.lists(),
    queryFn: () => getBookmarks(threadId),
    staleTime: 30_000,
  });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookmarkData) => createBookmark(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: bookmarkKeys.thread(variables.thread_id),
      });
      qc.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookmarkId: string) => deleteBookmark(bookmarkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

export function useUpdateBookmarkNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookmarkId,
      data,
    }: {
      bookmarkId: string;
      data: UpdateBookmarkNoteData;
    }) => updateBookmarkNote(bookmarkId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}
