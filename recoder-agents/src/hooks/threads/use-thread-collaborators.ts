'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getThreadCollaborators,
  shareThread,
  removeThreadCollaborator,
  type Collaborator,
} from '@/lib/api/collaboration';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const collaboratorKeys = {
  all: ['collaborators'] as const,
  thread: (threadId: string) => ['collaborators', 'thread', threadId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useThreadCollaborators(threadId: string) {
  return useQuery<Collaborator[]>({
    queryKey: collaboratorKeys.thread(threadId),
    queryFn: () => getThreadCollaborators(threadId),
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useShareThread() {
  const queryClient = useQueryClient();

  return useMutation<
    Collaborator,
    Error,
    { threadId: string; email: string; role: 'viewer' | 'editor' }
  >({
    mutationFn: ({ threadId, email, role }) => shareThread(threadId, email, role),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaboratorKeys.thread(variables.threadId),
      });
      toast.info(`Invited ${variables.email} as ${variables.role}`);
    },
    onError: (error) => {
      toast.warning(error.message || 'Failed to share thread');
    },
  });
}

export function useRemoveCollaborator() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { threadId: string; collaboratorId: string }>({
    mutationFn: ({ threadId, collaboratorId }) =>
      removeThreadCollaborator(threadId, collaboratorId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: collaboratorKeys.thread(variables.threadId),
      });
      toast.info('Collaborator removed');
    },
    onError: (error) => {
      toast.warning(error.message || 'Failed to remove collaborator');
    },
  });
}
