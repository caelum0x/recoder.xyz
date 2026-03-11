import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pinThread,
  unpinThread,
  listPinnedThreads,
  updatePin,
  reorderPins,
  createCollection,
  listCollections,
  updateCollection,
  deleteCollection,
  type PinThreadData,
  type UpdatePinData,
  type ReorderPinsData,
  type CreateCollectionData,
  type UpdateCollectionData,
} from '@/lib/api/thread-pinning';

// ============================================================================
// Pin Hooks
// ============================================================================

export function usePinnedThreads() {
  return useQuery({
    queryKey: ['pinned-threads-v2'],
    queryFn: listPinnedThreads,
    staleTime: 30_000,
  });
}

export function usePinThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, data }: { threadId: string; data?: PinThreadData }) =>
      pinThread(threadId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pinned-threads-v2'] });
    },
  });
}

export function useUnpinThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => unpinThread(threadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pinned-threads-v2'] });
    },
  });
}

export function useUpdatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pinId, data }: { pinId: string; data: UpdatePinData }) =>
      updatePin(pinId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pinned-threads-v2'] });
    },
  });
}

export function useReorderPins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReorderPinsData) => reorderPins(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pinned-threads-v2'] });
    },
  });
}

// ============================================================================
// Collection Hooks
// ============================================================================

export function usePinCollections() {
  return useQuery({
    queryKey: ['pin-collections'],
    queryFn: listCollections,
    staleTime: 30_000,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCollectionData) => createCollection(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pin-collections'] });
    },
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, data }: { collectionId: string; data: UpdateCollectionData }) =>
      updateCollection(collectionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pin-collections'] });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => deleteCollection(collectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pin-collections'] });
    },
  });
}
