'use client';

import { useState, useCallback, useMemo } from 'react';
import { usePlatformActivity } from '@/hooks/platform/use-platform-activity';
import {
  useActivityStats,
  useActivityHeatmap,
} from '@/hooks/platform/use-unified-activity';
import { cn } from '@/lib/utils';
import { Inbox, RefreshCw, Search, Clock, Loader2, Activity, Zap, Calendar, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ActivityDetailCard,
  SkeletonCard,
} from '@/components/activity/activity-cards';
import {
  PAGE_SIZE,
  APP_FILTERS,
  DATE_FILTERS,
} from '@/components/activity/activity-constants';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ActivityLogPage() {
  const [appFilter, setAppFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, refetch } = usePlatformActivity({
    appFilter,
    q: searchQuery || undefined,
    dateRange: dateRange === 'all' ? undefined : dateRange,
    limit: PAGE_SIZE,
    offset,
  });

  // Unified activity stats and heatmap
  const { data: stats, isLoading: isStatsLoading } = useActivityStats();
  const { data: heatmap, isLoading: isHeatmapLoading } = useActivityHeatmap(7);

  const resetFilters = useCallback(() => {
    setAppFilter(undefined);
    setDateRange('all');
    setSearchQuery('');
    setOffset(0);
  }, []);

  const handleLoadMore = () => setOffset((prev) => prev + PAGE_SIZE);
  const handleLoadPrev = () => setOffset((prev) => Math.max(0, prev - PAGE_SIZE));

  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Clock className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-sm text-muted-foreground">
            Track activity across all Recoder apps
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Today"
          value={stats?.events_today ?? 0}
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
        />
        <StatCard
          label="This Week"
          value={stats?.events_this_week ?? 0}
          icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
        />
        <StatCard
          label="Most Active"
          value={stats?.most_active_resource ?? '-'}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
          isText
        />
        <StatCard
          label="Peak Hour"
          value={stats?.peak_hour != null ? `${stats.peak_hour}:00` : '-'}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
          isText
        />
      </div>

      {/* Heatmap */}
      <div className="rounded-xl border bg-card p-4 mb-6">
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Activity Heatmap (Last 7 days)
        </h2>
        {isHeatmapLoading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : (
          <InlineHeatmap cells={heatmap?.cells || []} />
        )}
      </div>

      {/* Daily activity bar chart */}
      {stats && stats.daily_stats.length > 0 && (
        <div className="rounded-xl border bg-card p-4 mb-6">
          <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Daily Activity (Last 30 days)
          </h2>
          <InlineDailyChart stats={stats.daily_stats} />
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            {APP_FILTERS.map(({ key, label }) => (
              <button
                key={label}
                onClick={() => { setAppFilter(key); setOffset(0); }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  appFilter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setOffset(0); }}
              className="h-9 w-full rounded-lg border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {DATE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setDateRange(key); setOffset(0); }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                dateRange === key
                  ? 'bg-accent text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Failed to load activity feed.
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activity found</p>
          {(appFilter || searchQuery || dateRange !== 'all') && (
            <button
              onClick={resetFilters}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Activity list */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <>
          <div className="space-y-2">
            {data.items.map((item) => (
              <ActivityDetailCard key={item.id} item={item} />
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <button
              disabled={offset === 0}
              onClick={handleLoadPrev}
              className={cn(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                offset === 0
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-accent',
              )}
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Showing {offset + 1}&ndash;{offset + data.items.length} of{' '}
              {data.total}
            </span>
            {data.has_more ? (
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Load More
                {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">End</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline helper components
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
);

function StatCard({
  label,
  value,
  icon,
  isLoading: loading,
  isText,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  isLoading: boolean;
  isText?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <p className={cn('font-semibold', isText ? 'text-sm truncate' : 'text-lg')}>
          {value}
        </p>
      )}
    </div>
  );
}

function InlineHeatmap({ cells }: { cells: Array<{ day: number; hour: number; count: number }> }) {
  const { map, maxCount } = useMemo(() => {
    const m: Record<string, number> = {};
    let mx = 1;
    for (const c of cells) {
      const key = `${c.day}-${c.hour}`;
      m[key] = c.count;
      if (c.count > mx) mx = c.count;
    }
    return { map: m, maxCount: mx };
  }, [cells]);

  const intensity = (day: number, hour: number) => {
    const count = map[`${day}-${hour}`] || 0;
    if (count === 0) return 'bg-muted/30';
    const ratio = count / maxCount;
    if (ratio > 0.75) return 'bg-emerald-500/80';
    if (ratio > 0.5) return 'bg-emerald-500/55';
    if (ratio > 0.25) return 'bg-emerald-500/35';
    return 'bg-emerald-500/15';
  };

  const displayHours = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="flex items-center ml-10 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center">
              {displayHours.includes(h) && (
                <span className="text-[9px] text-muted-foreground">{HOUR_LABELS[h]}</span>
              )}
            </div>
          ))}
        </div>
        {DAY_LABELS.map((dl, di) => (
          <div key={di} className="flex items-center gap-1 mb-0.5">
            <span className="text-[10px] text-muted-foreground w-8 text-right flex-shrink-0">{dl}</span>
            <div className="flex-1 flex gap-[2px]">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className={cn('flex-1 h-4 rounded-[2px]', intensity(di, h))}
                  title={`${dl} ${HOUR_LABELS[h]}: ${map[`${di}-${h}`] || 0} events`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-10 mt-2">
          <span className="text-[9px] text-muted-foreground">Less</span>
          <div className="h-3 w-3 rounded-[2px] bg-muted/30" />
          <div className="h-3 w-3 rounded-[2px] bg-emerald-500/15" />
          <div className="h-3 w-3 rounded-[2px] bg-emerald-500/35" />
          <div className="h-3 w-3 rounded-[2px] bg-emerald-500/55" />
          <div className="h-3 w-3 rounded-[2px] bg-emerald-500/80" />
          <span className="text-[9px] text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

function InlineDailyChart({ stats: dailyStats }: { stats: Array<{ date: string; count: number }> }) {
  const maxCount = useMemo(
    () => Math.max(...dailyStats.map((s) => s.count), 1),
    [dailyStats]
  );

  return (
    <div className="flex items-end gap-[2px] h-20">
      {dailyStats.map((stat) => {
        const height = Math.max((stat.count / maxCount) * 100, 2);
        return (
          <div key={stat.date} className="flex-1 group relative" title={`${stat.date}: ${stat.count} events`}>
            <div
              className="w-full bg-primary/60 rounded-t-sm group-hover:bg-primary transition-colors"
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
