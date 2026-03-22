import { backendApi } from '@/lib/api-client';

export interface MessageBookmark {
  id: string;
  user_id: string;
  thread_id: string;
  message_index: number;
  message_preview: string | null;
  note: string | null;
  created_at: string;
}

export interface CreateBookmarkData {
  thread_id: string;
  message_index: number;
  message_preview?: string;
  note?: string;
}

export interface UpdateBookmarkNoteData {
  note?: string | null;
}

export const createBookmark = async (
  data: CreateBookmarkData
): Promise<MessageBookmark> => {
  const response = await backendApi.post<MessageBookmark>('/bookmarks', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getBookmarks = async (
  threadId?: string
): Promise<MessageBookmark[]> => {
  const params = threadId ? `?thread_id=${encodeURIComponent(threadId)}` : '';
  const response = await backendApi.get<MessageBookmark[]>(
    `/bookmarks${params}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteBookmark = async (bookmarkId: string) => {
  const response = await backendApi.delete(`/bookmarks/${bookmarkId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const updateBookmarkNote = async (
  bookmarkId: string,
  data: UpdateBookmarkNoteData
): Promise<MessageBookmark> => {
  const response = await backendApi.patch<MessageBookmark>(
    `/bookmarks/${bookmarkId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
