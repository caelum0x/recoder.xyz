'use client';

import { useState } from 'react';
import { usePlatformActivity } from '@/hooks/platform/use-platform-activity';
import type { ActivityItem } from '@/lib/api/platform';
import { cn } from '@/lib/utils';
import { Inbox, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_FILTERS = [
  { key: undefined, label: 'All' },
  { key: 'agents', label: 'Agents' },
  { key: 'agency', label: 'Agency' },
  { key: 'pm', label: 'PM' },
] as const;

const APP_BADGE_STYLES: Record<string, string> = {
  agents: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  agency: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  pm: 'bg-green-500/15 text-green-600 dark:text-green-400',
  web: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
};

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActivityCard({ item }: { item: ActivityItem }) {
  const badgeStyle = APP_BADGE_STYLES[item.app] ?? APP_BADGE_STYLES.web;

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40">
      {/* App badge */}
      <span
        className={cn(
          'mt-0.5 flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
          badgeStyle,
        )}
      >
        {item.app}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground/70">
        {relativeTime(item.timestamp)}
      </span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
      <div className="h-5 w-14 animate-pulse rounded-md bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-10 animate-pulse rounded bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ActivityFeed() {
  const [activeFilter, setActiveFilter] = useState<string | undefined>(
    undefined,
  );
  const { data, isLoading, isError, refetch } = usePlatformActivity(activeFilter);

  return (
    <div className="w-full">
      {/* Filter tabs */}
      <div className="mb-3 flex items-center gap-1">
        {APP_FILTERS.map(({ key, label }) => (
          <button
            key={label}
            onClick={() => setActiveFilter(key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              activeFilter === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Failed to load activity feed.
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No activity yet</p>
        </div>
      )}

      {/* Activity list */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="space-y-2">
          {data.items.map((item) => (
            <ActivityCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
