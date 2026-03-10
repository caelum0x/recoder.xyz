'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Star,
  Plus,
  Zap,
  GripHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  useAgentFavorites,
  useRemoveFavorite,
  useReorderFavorites,
  useAddFavorite,
} from '@/hooks/agents/use-agent-favorites';
import { cn } from '@/lib/utils';
import type { AgentFavorite } from '@/lib/api/agent-favorites';

// ---------------------------------------------------------------------------
// Add Favorite Dialog
// ---------------------------------------------------------------------------

function AddFavoriteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [agentId, setAgentId] = useState('');
  const addFavorite = useAddFavorite();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!agentId.trim()) return;
      try {
        await addFavorite.mutateAsync({ agentId: agentId.trim() });
        setAgentId('');
        onClose();
      } catch {
        // Error handled by mutation
      }
    },
    [agentId, addFavorite, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Add Favorite Agent</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="agent-id-input"
              className="block text-xs text-muted-foreground mb-1"
            >
              Agent ID
            </label>
            <input
              id="agent-id-input"
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Enter agent ID..."
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!agentId.trim() || addFavorite.isPending}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {addFavorite.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Favorite Item
// ---------------------------------------------------------------------------

function FavoriteItem({
  favorite,
  isEditing,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onRemove,
  onClick,
}: {
  favorite: AgentFavorite;
  isEditing: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
  onClick: () => void;
}) {
  const initial = favorite.agent_id.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-1 relative group shrink-0">
      {/* Remove button in edit mode */}
      {isEditing && (
        <button
          onClick={onRemove}
          className="absolute -top-1 -right-1 z-10 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}

      {/* Avatar circle */}
      <button
        onClick={isEditing ? undefined : onClick}
        className={cn(
          'relative h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
          isEditing
            ? 'bg-muted text-muted-foreground cursor-default'
            : 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer'
        )}
      >
        {initial}
        {/* Quick prompt indicator */}
        {favorite.quick_prompt && (
          <Zap className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-amber-500 fill-amber-500" />
        )}
      </button>

      {/* Agent name */}
      <span className="text-[10px] text-muted-foreground max-w-[56px] truncate text-center">
        {favorite.agent_id.length > 8
          ? `${favorite.agent_id.slice(0, 8)}...`
          : favorite.agent_id}
      </span>

      {/* Reorder controls in edit mode */}
      {isEditing && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveLeft}
            disabled={!canMoveLeft}
            className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <GripHorizontal className="h-3 w-3 text-muted-foreground" />
          <button
            onClick={onMoveRight}
            disabled={!canMoveRight}
            className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Favorites Bar
// ---------------------------------------------------------------------------

export function FavoritesBar() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: favorites, isLoading } = useAgentFavorites();
  const removeFavorite = useRemoveFavorite();
  const reorderFavorites = useReorderFavorites();

  // Local reorder state for optimistic updates
  const orderedFavorites = useMemo(() => {
    if (!favorites) return [];
    return [...favorites].sort((a, b) => a.display_order - b.display_order);
  }, [favorites]);

  const handleMoveLeft = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const ids = orderedFavorites.map((f) => f.agent_id);
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      reorderFavorites.mutate(ids);
    },
    [orderedFavorites, reorderFavorites]
  );

  const handleMoveRight = useCallback(
    (index: number) => {
      if (index >= orderedFavorites.length - 1) return;
      const ids = orderedFavorites.map((f) => f.agent_id);
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      reorderFavorites.mutate(ids);
    },
    [orderedFavorites, reorderFavorites]
  );

  const handleRemove = useCallback(
    (agentId: string) => {
      removeFavorite.mutate(agentId);
    },
    [removeFavorite]
  );

  const handleLaunch = useCallback(
    (favorite: AgentFavorite) => {
      // Navigate to new thread page with the agent
      const params = new URLSearchParams({ agent: favorite.agent_id });
      if (favorite.quick_prompt) {
        params.set('prompt', favorite.quick_prompt);
      }
      router.push(`/projects/new/thread/new?${params.toString()}`);
    },
    [router]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <Star className="h-4 w-4 text-muted-foreground" />
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!orderedFavorites.length && !isEditing) {
    return null; // Don't show empty bar
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/50 overflow-x-auto">
        {/* Label */}
        <div className="flex items-center gap-1 shrink-0">
          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          <span className="text-xs font-medium text-muted-foreground">
            Quick Launch
          </span>
        </div>

        {/* Favorite items */}
        <div className="flex items-center gap-3 overflow-x-auto py-1">
          {orderedFavorites.map((fav, index) => (
            <FavoriteItem
              key={fav.id}
              favorite={fav}
              isEditing={isEditing}
              canMoveLeft={index > 0}
              canMoveRight={index < orderedFavorites.length - 1}
              onMoveLeft={() => handleMoveLeft(index)}
              onMoveRight={() => handleMoveRight(index)}
              onRemove={() => handleRemove(fav.agent_id)}
              onClick={() => handleLaunch(fav)}
            />
          ))}

          {/* Add button */}
          <button
            onClick={() => setDialogOpen(true)}
            className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Edit toggle */}
        <button
          onClick={() => setIsEditing((v) => !v)}
          className={cn(
            'text-xs px-2 py-1 rounded-md transition-colors shrink-0',
            isEditing
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      <AddFavoriteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
