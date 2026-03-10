import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

interface PinnedThread {
  thread_id: string;
  pinned_at: string;
  name: string | null;
  agent_id: string | null;
  updated_at: string | null;
}

export const pinnedThreadKeys = {
  all: ['pinned-threads'] as const,
};

export function usePinnedThreads() {
  return useQuery({
    queryKey: pinnedThreadKeys.all,
    queryFn: async (): Promise<PinnedThread[]> => {
      const response = await backendApi.get<PinnedThread[]>('/threads/pinned', { showErrors: false });
      if (response.error) return [];
      return response.data || [];
    },
    staleTime: 30_000,
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, isPinned }: { threadId: string; isPinned: boolean }) => {
      if (isPinned) {
        await backendApi.delete(`/threads/${threadId}/pin`);
      } else {
        await backendApi.post(`/threads/${threadId}/pin`, {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pinnedThreadKeys.all });
    },
  });
}
