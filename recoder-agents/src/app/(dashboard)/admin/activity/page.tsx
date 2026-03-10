'use client';

import { useState, useCallback } from 'react';
import {
  usePlatformActivity,
  usePlatformStats,
} from '@/hooks/platform/use-platform-activity';
import { cn } from '@/lib/utils';
import {
  Inbox,
  RefreshCw,
  Search,
  Download,
  BarChart3,
  Activity,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import {
  AdminActivityCard,
  SkeletonCardWithAvatar,
} from '@/components/activity/activity-cards';
import { PAGE_SIZE, APP_FILTERS } from '@/components/activity/activity-constants';

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminActivityPage() {
  const [appFilter, setAppFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, refetch } = usePlatformActivity({
    appFilter,
    q: searchQuery || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const { data: stats } = usePlatformStats();

  const handleExport = useCallback(() => {
    const el = document.createElement('div');
    el.className =
      'fixed bottom-4 right-4 z-50 rounded-lg bg-card border px-4 py-3 text-sm shadow-lg';
    el.textContent = 'Export preparing...';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }, []);

  const handleLoadMore = () => setOffset((prev) => prev + PAGE_SIZE);

  const eventsToday = stats?.runs_today ?? 0;
  const mostActiveApp = appFilter ?? 'agents';
  const totalWeek = stats?.threads_7d ?? 0;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Activity</h1>
          <p className="text-sm text-muted-foreground">
            Monitor all platform activity across your team
          </p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Events Today" value={eventsToday} icon={Activity} />
        <StatCard
          label="Most Active App"
          value={mostActiveApp.charAt(0).toUpperCase() + mostActiveApp.slice(1)}
          icon={BarChart3}
        />
        <StatCard
          label="Total Events (This Week)"
          value={totalWeek}
          icon={CalendarDays}
        />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
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

        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="h-9 rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Users</option>
        </select>

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

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCardWithAvatar key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Failed to load team activity.
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
          <p className="text-sm text-muted-foreground">
            No team activity found
          </p>
        </div>
      )}

      {/* Activity list */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <>
          <div className="space-y-2">
            {data.items.map((item) => (
              <AdminActivityCard key={item.id} item={item} />
            ))}
          </div>

          {data.has_more && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 rounded-lg border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Load More
                {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
