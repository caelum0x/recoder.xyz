'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsFavorited, useToggleFavorite } from '@/hooks/platform/use-favorites';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface FavoriteButtonProps {
  itemType: 'agent' | 'thread' | 'workflow' | 'knowledge_entry';
  itemId: string;
  itemName?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function FavoriteButton({ itemType, itemId, itemName, size = 'sm', className }: FavoriteButtonProps) {
  const { data: isFavorited, isLoading } = useIsFavorited(itemType, itemId);
  const toggleFavorite = useToggleFavorite();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite.mutate({
      itemType,
      itemId,
      itemName,
      isFavorited: !!isFavorited,
    });
  };

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', className)}
          onClick={handleClick}
          disabled={isLoading || toggleFavorite.isPending}
        >
          <Star
            className={cn(
              iconSize,
              isFavorited
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground hover:text-yellow-400'
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      </TooltipContent>
    </Tooltip>
  );
}
