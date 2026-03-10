import { backendApi } from '@/lib/api-client';

export interface BookmarkCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
  bookmark_count?: number;
  created_at: string;
}

export interface ThreadBookmark {
  id: string;
  user_id: string;
  thread_id: string;
  collection_id: string | null;
  note: string | null;
  collection_name?: string | null;
  collection_color?: string | null;
  created_at: string;
}

export interface BookmarkListResponse {
  bookmarks: ThreadBookmark[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateCollectionData {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface UpdateCollectionData {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  sort_order?: number;
}

export interface CreateBookmarkData {
  thread_id: string;
  collection_id?: string;
  note?: string;
}

export interface UpdateBookmarkData {
  note?: string;
  collection_id?: string;
}

// ============================================================================
// Collection API
// ============================================================================

export const createCollection = async (
  data: CreateCollectionData
): Promise<BookmarkCollection> => {
  const response = await backendApi.post<BookmarkCollection>(
    '/bookmarks/collections',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getCollections = async (): Promise<BookmarkCollection[]> => {
  const response = await backendApi.get<BookmarkCollection[]>(
    '/bookmarks/collections',
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateCollection = async (
  collectionId: string,
  data: UpdateCollectionData
): Promise<BookmarkCollection> => {
  const response = await backendApi.patch<BookmarkCollection>(
    `/bookmarks/collections/${collectionId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteCollection = async (collectionId: string) => {
  const response = await backendApi.delete(
    `/bookmarks/collections/${collectionId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

// ============================================================================
// Bookmark API
// ============================================================================

export const createThreadBookmark = async (
  data: CreateBookmarkData
): Promise<ThreadBookmark> => {
  const response = await backendApi.post<ThreadBookmark>(
    '/bookmarks/threads',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getThreadBookmarks = async (
  collectionId?: string,
  limit?: number,
  offset?: number
): Promise<BookmarkListResponse> => {
  const params = new URLSearchParams();
  if (collectionId && collectionId !== 'all')
    params.set('collection_id', collectionId);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  const response = await backendApi.get<BookmarkListResponse>(
    `/bookmarks/threads${qs ? `?${qs}` : ''}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteThreadBookmark = async (bookmarkId: string) => {
  const response = await backendApi.delete(
    `/bookmarks/threads/${bookmarkId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const updateThreadBookmark = async (
  bookmarkId: string,
  data: UpdateBookmarkData
): Promise<ThreadBookmark> => {
  const response = await backendApi.patch<ThreadBookmark>(
    `/bookmarks/threads/${bookmarkId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
