import { backendApi } from '@/lib/api-client';

export interface MessageBookmark {
  id: string;
  user_id: string;
  thread_id: string;
  message_index: number;
  bookmark_label: string | null;
  bookmark_note: string | null;
  bookmark_color: string;
  created_at: string;
}

export interface MessageBookmarkCollection {
  id: string;
  user_id: string;
  collection_name: string;
  description: string | null;
  bookmark_ids: string[];
  created_at: string;
}

export interface AllMessageBookmarksResponse {
  bookmarks: MessageBookmark[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateMessageBookmarkData {
  message_index: number;
  bookmark_label?: string;
  bookmark_note?: string;
  bookmark_color?: string;
}

export interface UpdateMessageBookmarkData {
  bookmark_label?: string;
  bookmark_note?: string;
  bookmark_color?: string;
}

export interface CreateMessageBookmarkCollectionData {
  collection_name: string;
  description?: string;
  bookmark_ids?: string[];
}

export interface UpdateMessageBookmarkCollectionData {
  collection_name?: string;
  description?: string;
  bookmark_ids?: string[];
}

export const createMessageBookmark = async (
  threadId: string,
  data: CreateMessageBookmarkData
): Promise<MessageBookmark> => {
  const response = await backendApi.post<MessageBookmark>(
    `/threads/${threadId}/bookmarks`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadMessageBookmarks = async (
  threadId: string
): Promise<MessageBookmark[]> => {
  const response = await backendApi.get<MessageBookmark[]>(
    `/threads/${threadId}/bookmarks`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateMessageBookmark = async (
  bookmarkId: string,
  data: UpdateMessageBookmarkData
): Promise<MessageBookmark> => {
  const response = await backendApi.patch<MessageBookmark>(
    `/bookmarks/${bookmarkId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteMessageBookmark = async (bookmarkId: string): Promise<void> => {
  const response = await backendApi.delete(`/bookmarks/${bookmarkId}`);
  if (response.error) throw new Error(response.error.message);
};

export const getAllMessageBookmarks = async (options?: {
  limit?: number;
  offset?: number;
}): Promise<AllMessageBookmarksResponse> => {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  const qs = params.toString();
  const response = await backendApi.get<AllMessageBookmarksResponse>(
    `/bookmarks${qs ? `?${qs}` : ''}`,
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createMessageBookmarkCollection = async (
  data: CreateMessageBookmarkCollectionData
): Promise<MessageBookmarkCollection> => {
  const response = await backendApi.post<MessageBookmarkCollection>(
    '/bookmark-collections',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getMessageBookmarkCollections = async (): Promise<MessageBookmarkCollection[]> => {
  const response = await backendApi.get<MessageBookmarkCollection[]>(
    '/bookmark-collections',
    { showErrors: true }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateMessageBookmarkCollection = async (
  collectionId: string,
  data: UpdateMessageBookmarkCollectionData
): Promise<MessageBookmarkCollection> => {
  const response = await backendApi.patch<MessageBookmarkCollection>(
    `/bookmark-collections/${collectionId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteMessageBookmarkCollection = async (
  collectionId: string
): Promise<void> => {
  const response = await backendApi.delete(`/bookmark-collections/${collectionId}`);
  if (response.error) throw new Error(response.error.message);
};
