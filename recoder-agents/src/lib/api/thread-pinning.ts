import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface PinnedThread {
  id: string;
  user_id: string;
  thread_id: string;
  pin_label: string | null;
  pin_note: string | null;
  pin_color: string;
  display_order: number;
  created_at: string;
}

export interface PinCollection {
  id: string;
  user_id: string;
  collection_name: string;
  description: string | null;
  thread_ids: string[];
  is_shared: boolean;
  created_at: string;
}

export interface PinThreadData {
  pin_label?: string;
  pin_note?: string;
  pin_color?: string;
}

export interface UpdatePinData {
  pin_label?: string;
  pin_note?: string;
  pin_color?: string;
}

export interface ReorderPinsData {
  pin_ids: string[];
}

export interface CreateCollectionData {
  collection_name: string;
  description?: string;
  thread_ids?: string[];
  is_shared?: boolean;
}

export interface UpdateCollectionData {
  collection_name?: string;
  description?: string;
  thread_ids?: string[];
  is_shared?: boolean;
}

// ============================================================================
// Pin API
// ============================================================================

export const pinThread = async (
  threadId: string,
  data: PinThreadData = {}
): Promise<PinnedThread> => {
  const response = await backendApi.post<PinnedThread>(`/threads/${threadId}/pin`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const unpinThread = async (
  threadId: string
): Promise<{ deleted: boolean; thread_id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; thread_id: string }>(
    `/threads/${threadId}/pin`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listPinnedThreads = async (): Promise<PinnedThread[]> => {
  const response = await backendApi.get<PinnedThread[]>('/pinned-threads', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePin = async (
  pinId: string,
  data: UpdatePinData
): Promise<PinnedThread> => {
  const response = await backendApi.patch<PinnedThread>(`/pinned-threads/${pinId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const reorderPins = async (
  data: ReorderPinsData
): Promise<{ reordered: boolean; count: number }> => {
  const response = await backendApi.post<{ reordered: boolean; count: number }>(
    '/pinned-threads/reorder',
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Collection API
// ============================================================================

export const createCollection = async (data: CreateCollectionData): Promise<PinCollection> => {
  const response = await backendApi.post<PinCollection>('/pin-collections', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listCollections = async (): Promise<PinCollection[]> => {
  const response = await backendApi.get<PinCollection[]>('/pin-collections', {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateCollection = async (
  collectionId: string,
  data: UpdateCollectionData
): Promise<PinCollection> => {
  const response = await backendApi.patch<PinCollection>(
    `/pin-collections/${collectionId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteCollection = async (
  collectionId: string
): Promise<{ deleted: boolean; collection_id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; collection_id: string }>(
    `/pin-collections/${collectionId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
