import type { ActivityItem } from '@/lib/api/platform';
import { cn } from '@/lib/utils';
import {
  APP_BADGE_STYLES,
  TYPE_LABELS,
  formatTimestamp,
  getInitials,
} from './activity-constants';

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

export function SkeletonCard() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <div className="h-5 w-14 animate-pulse rounded-md bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function SkeletonCardWithAvatar() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail card (for personal activity log page)
// ---------------------------------------------------------------------------

export function ActivityDetailCard({ item }: { item: ActivityItem }) {
  const badgeStyle = APP_BADGE_STYLES[item.app] ?? APP_BADGE_STYLES.web;
  const typeLabel = TYPE_LABELS[item.type] ?? item.type;

  return (
    <div className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40">
      <span
        className={cn(
          'mt-0.5 flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
          badgeStyle,
        )}
      >
        {item.app}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {typeLabel}
          </span>
          <p className="truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="hidden group-hover:block text-[11px] text-muted-foreground/60 mt-1">
            {Object.entries(item.metadata)
              .slice(0, 3)
              .map(([k, v]) => (
                <span key={k} className="mr-3">
                  {k}: {String(v)}
                </span>
              ))}
          </div>
        )}
      </div>
      <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground/70">
        {formatTimestamp(item.timestamp)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin card (with user avatar/name badge)
// ---------------------------------------------------------------------------

export function AdminActivityCard({ item }: { item: ActivityItem }) {
  const badgeStyle = APP_BADGE_STYLES[item.app] ?? APP_BADGE_STYLES.web;
  const typeLabel = TYPE_LABELS[item.type] ?? item.type;
  const userName = (item.metadata?.user_name as string) || 'Team member';

  return (
    <div className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
        {getInitials(userName)}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground">
            {userName}
          </span>
          <span
            className={cn(
              'flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              badgeStyle,
            )}
          >
            {item.app}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {typeLabel}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-foreground">
          {item.title}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        )}
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="hidden group-hover:block text-[11px] text-muted-foreground/60 mt-1">
            {Object.entries(item.metadata)
              .filter(([k]) => k !== 'user_name')
              .slice(0, 3)
              .map(([k, v]) => (
                <span key={k} className="mr-3">
                  {k}: {String(v)}
                </span>
              ))}
          </div>
        )}
      </div>
      <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground/70">
        {formatTimestamp(item.timestamp)}
      </span>
    </div>
  );
}
