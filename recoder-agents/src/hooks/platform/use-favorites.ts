import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavorites, checkFavorite, addFavorite, removeFavorite } from '@/lib/api/favorites';

export function useFavorites(type?: string) {
  return useQuery({
    queryKey: ['favorites', type],
    queryFn: () => getFavorites(type),
    staleTime: 30_000,
  });
}

export function useIsFavorited(itemType: string, itemId: string) {
  return useQuery({
    queryKey: ['favorite-check', itemType, itemId],
    queryFn: () => checkFavorite(itemType, itemId),
    enabled: !!itemType && !!itemId,
    staleTime: 30_000,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemType,
      itemId,
      itemName,
      isFavorited,
    }: {
      itemType: string;
      itemId: string;
      itemName?: string;
      isFavorited: boolean;
    }) => {
      if (isFavorited) {
        return removeFavorite(itemType, itemId);
      } else {
        return addFavorite(itemType, itemId, itemName);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({
        queryKey: ['favorite-check', variables.itemType, variables.itemId],
      });
    },
  });
}
