import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgentFavorites,
  addAgentFavorite,
  removeAgentFavorite,
  reorderAgentFavorites,
  updateFavoritePrompt,
} from '@/lib/api/agent-favorites';

const FAVORITES_KEY = ['agent-favorites'];

export function useAgentFavorites() {
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: getAgentFavorites,
    staleTime: 30_000, // 30 seconds
  });
}

export function useAddFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, quickPrompt }: { agentId: string; quickPrompt?: string }) =>
      addAgentFavorite(agentId, quickPrompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => removeAgentFavorite(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });
}

export function useReorderFavorites() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentIds: string[]) => reorderAgentFavorites(agentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });
}

export function useUpdateFavoritePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, quickPrompt }: { agentId: string; quickPrompt: string | null }) =>
      updateFavoritePrompt(agentId, quickPrompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });
}
