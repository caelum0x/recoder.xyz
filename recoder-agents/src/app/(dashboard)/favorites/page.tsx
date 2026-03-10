'use client';

import { useState } from 'react';
import { Star, Bot, MessageCircle, Workflow, BookOpen, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavorites, useToggleFavorite } from '@/hooks/platform/use-favorites';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { Favorite } from '@/lib/api/favorites';

const TABS = [
  { key: undefined, label: 'All' },
  { key: 'agent', label: 'Agents' },
  { key: 'thread', label: 'Threads' },
  { key: 'workflow', label: 'Workflows' },
  { key: 'knowledge_entry', label: 'Knowledge' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Bot; color: string; badgeClass: string; linkPrefix: string }
> = {
  agent: {
    icon: Bot,
    color: 'text-blue-500',
    badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    linkPrefix: '/agents',
  },
  thread: {
    icon: MessageCircle,
    color: 'text-green-500',
    badgeClass: 'bg-green-500/10 text-green-500 border-green-500/20',
    linkPrefix: '/projects',
  },
  workflow: {
    icon: Workflow,
    color: 'text-purple-500',
    badgeClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    linkPrefix: '/workflows',
  },
  knowledge_entry: {
    icon: BookOpen,
    color: 'text-orange-500',
    badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    linkPrefix: '/knowledge',
  },
};

function FavoriteItemCard({ favorite }: { favorite: Favorite }) {
  const toggleFavorite = useToggleFavorite();
  const config = TYPE_CONFIG[favorite.item_type] ?? TYPE_CONFIG.agent;
  const Icon = config.icon;

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite.mutate({
      itemType: favorite.item_type,
      itemId: favorite.item_id,
      isFavorited: true,
    });
  };

  const displayName = favorite.item_name || favorite.item_id;
  const dateAdded = new Date(favorite.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Build a reasonable link for the item
  let href = `${config.linkPrefix}/${favorite.item_id}`;
  if (favorite.item_type === 'thread') {
    // threads live under projects/<projectId>/thread/<threadId>
    href = `/projects/${favorite.item_id}/thread/new`;
  }

  return (
    <div className="group relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40">
      <div className={cn('mt-0.5 rounded-lg p-2', config.badgeClass)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5 shrink-0', config.badgeClass)}>
            {favorite.item_type.replace('_', ' ')}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Added {dateAdded}</p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
          <Link href={href}>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRemove}
          disabled={toggleFavorite.isPending}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const label = tab ? TABS.find((t) => t.key === tab)?.label ?? tab : 'items';
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Star className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium mb-1">No favorites yet</h3>
      <p className="text-xs text-muted-foreground max-w-xs">
        Star {label.toLowerCase()} to see them here for quick access.
      </p>
    </div>
  );
}

export default function FavoritesPage() {
  const [selectedTab, setSelectedTab] = useState<TabKey>(undefined);
  const { data: favorites, isLoading } = useFavorites(selectedTab);

  return (
    <div className="min-h-[100dvh] pb-12">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-yellow-500/10">
            <Star className="h-5 w-5 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Favorites</h1>
            <p className="text-sm text-muted-foreground">
              Quick access to your starred items
            </p>
          </div>
        </div>

        {/* Tab filter */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          {TABS.map(({ key, label }) => (
            <button
              key={label}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                selectedTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              onClick={() => setSelectedTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : !favorites || favorites.length === 0 ? (
          <EmptyState tab={selectedTab} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((fav) => (
              <FavoriteItemCard key={fav.id} favorite={fav} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
