'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  listPinnedMessages,
  pinMessage,
  unpinMessage,
  updatePin,
  getRecentPins,
  type PinMessageRequest,
  type UpdatePinRequest,
  type PinnedMessage,
} from '@/lib/api/pinned-messages';

// ============================================================================
// Query Keys
// ============================================================================

export const pinnedMessageKeys = {
  all: ['pinned-messages'] as const,
  thread: (threadId: string) => [...pinnedMessageKeys.all, 'thread', threadId] as const,
  recent: () => [...pinnedMessageKeys.all, 'recent'] as const,
};

// ============================================================================
// Hooks
// ============================================================================

export function usePinnedMessages(threadId: string | null) {
  return useQuery({
    queryKey: pinnedMessageKeys.thread(threadId ?? ''),
    queryFn: () => listPinnedMessages(threadId!),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function usePinMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, data }: { threadId: string; data: PinMessageRequest }) =>
      pinMessage(threadId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: pinnedMessageKeys.thread(variables.threadId) });
      qc.invalidateQueries({ queryKey: pinnedMessageKeys.recent() });
      toast.success('Message pinned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to pin message: ${error.message}`);
    },
  });
}

export function useUnpinMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, pinId }: { threadId: string; pinId: string }) =>
      unpinMessage(threadId, pinId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: pinnedMessageKeys.thread(variables.threadId) });
      qc.invalidateQueries({ queryKey: pinnedMessageKeys.recent() });
      toast.success('Message unpinned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to unpin message: ${error.message}`);
    },
  });
}

export function useUpdatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, pinId, data }: { threadId: string; pinId: string; data: UpdatePinRequest }) =>
      updatePin(threadId, pinId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: pinnedMessageKeys.thread(variables.threadId) });
      qc.invalidateQueries({ queryKey: pinnedMessageKeys.recent() });
      toast.success('Pin updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update pin: ${error.message}`);
    },
  });
}

export function useRecentPins() {
  return useQuery({
    queryKey: pinnedMessageKeys.recent(),
    queryFn: () => getRecentPins(),
    staleTime: 30_000,
  });
}
