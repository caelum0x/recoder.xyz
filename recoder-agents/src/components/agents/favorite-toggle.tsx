'use client';

import { useCallback, useMemo } from 'react';
import { Star } from 'lucide-react';
import {
  useAgentFavorites,
  useAddFavorite,
  useRemoveFavorite,
} from '@/hooks/agents/use-agent-favorites';
import { cn } from '@/lib/utils';

interface FavoriteToggleProps {
  agentId: string;
  size?: 'sm' | 'md';
}

export function FavoriteToggle({ agentId, size = 'md' }: FavoriteToggleProps) {
  const { data: favorites } = useAgentFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const isFavorited = useMemo(() => {
    if (!favorites) return false;
    return favorites.some((f) => f.agent_id === agentId);
  }, [favorites, agentId]);

  const isPending = addFavorite.isPending || removeFavorite.isPending;

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isPending) return;

      try {
        if (isFavorited) {
          await removeFavorite.mutateAsync(agentId);
        } else {
          await addFavorite.mutateAsync({ agentId });
        }
      } catch {
        // Error handled by mutation
      }
    },
    [agentId, isFavorited, isPending, addFavorite, removeFavorite]
  );

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50',
        buttonSize,
        isFavorited
          ? 'text-amber-500 hover:text-amber-600'
          : 'text-muted-foreground hover:text-amber-500'
      )}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star
        className={cn(iconSize, isFavorited && 'fill-amber-500')}
      />
    </button>
  );
}
