import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getPlaygroundEndpoints,
  executePlaygroundRequest,
  getPlaygroundHistory,
  savePlaygroundEntry,
  deletePlaygroundEntry,
  type ExecuteRequestData,
  type PlaygroundHistoryEntry,
  type UpdateHistoryData,
} from '@/lib/api/api-playground';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const playgroundKeys = {
  all: ['api-playground'] as const,
  endpoints: () => [...playgroundKeys.all, 'endpoints'] as const,
  history: (savedOnly?: boolean) =>
    [...playgroundKeys.all, 'history', { savedOnly }] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePlaygroundEndpoints() {
  return useQuery({
    queryKey: playgroundKeys.endpoints(),
    queryFn: getPlaygroundEndpoints,
    staleTime: 5 * 60_000, // endpoints don't change often
  });
}

export function useExecutePlaygroundRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ExecuteRequestData) => executePlaygroundRequest(data),
    onSuccess: () => {
      // Invalidate history so the new entry shows up
      queryClient.invalidateQueries({ queryKey: [...playgroundKeys.all, 'history'] });
    },
  });
}

export function usePlaygroundHistory(savedOnly: boolean = false) {
  return useQuery<PlaygroundHistoryEntry[]>({
    queryKey: playgroundKeys.history(savedOnly),
    queryFn: () => getPlaygroundHistory(savedOnly),
    staleTime: 15000,
    refetchOnMount: 'always',
  });
}

export function useSavePlaygroundEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    PlaygroundHistoryEntry,
    Error,
    { entryId: string; data: UpdateHistoryData }
  >({
    mutationFn: ({ entryId, data }) => savePlaygroundEntry(entryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...playgroundKeys.all, 'history'] });
      toast.success('Entry saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save entry');
    },
  });
}

export function useDeletePlaygroundEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; id: string },
    Error,
    string
  >({
    mutationFn: (entryId) => deletePlaygroundEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...playgroundKeys.all, 'history'] });
      toast.success('Entry deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete entry');
    },
  });
}

export type { PlaygroundHistoryEntry, ExecuteRequestData, UpdateHistoryData };
