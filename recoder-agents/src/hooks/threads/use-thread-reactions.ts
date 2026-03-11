'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addReaction,
  removeReaction,
  getMessageReactions,
  getThreadReactions,
  getFrequentEmojis,
  type ReactionGroup,
} from '@/lib/api/thread-reactions';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const reactionKeys = {
  all: ['thread-reactions'] as const,
  message: (threadId: string, messageIndex: number) =>
    [...reactionKeys.all, 'message', threadId, messageIndex] as const,
  thread: (threadId: string) =>
    [...reactionKeys.all, 'thread', threadId] as const,
  frequent: () => [...reactionKeys.all, 'frequent'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useMessageReactions(threadId: string, messageIndex: number) {
  return useQuery({
    queryKey: reactionKeys.message(threadId, messageIndex),
    queryFn: () => getMessageReactions(threadId, messageIndex),
    enabled: !!threadId && messageIndex >= 0,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useThreadReactions(threadId: string) {
  return useQuery({
    queryKey: reactionKeys.thread(threadId),
    queryFn: () => getThreadReactions(threadId),
    enabled: !!threadId,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useFrequentEmojis() {
  return useQuery({
    queryKey: reactionKeys.frequent(),
    queryFn: () => getFrequentEmojis(10),
    staleTime: 60_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useAddReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      messageIndex,
      emoji,
    }: {
      threadId: string;
      messageIndex: number;
      emoji: string;
    }) => addReaction(threadId, messageIndex, emoji),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: reactionKeys.message(variables.threadId, variables.messageIndex),
      });
      queryClient.invalidateQueries({
        queryKey: reactionKeys.thread(variables.threadId),
      });
    },
  });
}

export function useRemoveReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      messageIndex,
      emoji,
    }: {
      threadId: string;
      messageIndex: number;
      emoji: string;
    }) => removeReaction(threadId, messageIndex, emoji),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: reactionKeys.message(variables.threadId, variables.messageIndex),
      });
      queryClient.invalidateQueries({
        queryKey: reactionKeys.thread(variables.threadId),
      });
    },
  });
}
