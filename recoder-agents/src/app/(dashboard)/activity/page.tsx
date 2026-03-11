'use client';

import { useState, useCallback } from 'react';
import {
  useActivityFeed,
  useActivityFeedStats,
  useMarkActivityRead,
  useMarkAllActivitiesRead,
  useActivityPreferences,
  useUpdateActivityPreferences,
  type ActivityEvent,
  type ActivityFeedFilters,
  type ActivityEventType,
} from '@/hooks/monitoring/use-activity-feed';
import { cn } from '@/lib/utils';
import {
  Bot,
  MessageSquare,
  Rocket,
  Webhook,
  AlertCircle,
  Gauge,
  LayoutTemplate,
  Settings,
  Clock,
  StickyNote,
  Inbox,
  RefreshCw,
  Loader2,
  CheckCheck,
  Filter,
  Eye,
  EyeOff,
  Zap,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Bot; color: string }
> = {
  agent_created: { label: 'Agent Created', icon: Bot, color: 'text-green-500' },
  agent_updated: { label: 'Agent Updated', icon: Bot, color: 'text-blue-500' },
  agent_deleted: { label: 'Agent Deleted', icon: Bot, color: 'text-red-500' },
  thread_started: { label: 'Thread Started', icon: MessageSquare, color: 'text-sky-500' },
  thread_completed: { label: 'Thread Completed', icon: MessageSquare, color: 'text-emerald-500' },
  deployment_created: { label: 'Deployment', icon: Rocket, color: 'text-purple-500' },
  webhook_triggered: { label: 'Webhook', icon: Webhook, color: 'text-orange-500' },
  error_detected: { label: 'Error', icon: AlertCircle, color: 'text-red-500' },
  benchmark_run: { label: 'Benchmark', icon: Gauge, color: 'text-amber-500' },
  template_used: { label: 'Template Used', icon: LayoutTemplate, color: 'text-indigo-500' },
  config_changed: { label: 'Config Changed', icon: Settings, color: 'text-zinc-400' },
  scheduled_task_run: { label: 'Scheduled Task', icon: Clock, color: 'text-teal-500' },
  annotation_added: { label: 'Annotation', icon: StickyNote, color: 'text-yellow-500' },
};

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_CONFIG) as ActivityEventType[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatHour(hour: number | null): string {
  if (hour === null || hour === undefined) return '-';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${suffix}`;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ActivityFeedPage() {
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [resourceType, setResourceType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [showPreferences, setShowPreferences] = useState(false);

  const filters: ActivityFeedFilters = {
    event_type: selectedEventTypes.length === 1 ? selectedEventTypes[0] : undefined,
    resource_type: resourceType || undefined,
    unread_only: unreadOnly,
    limit: PAGE_SIZE,
    offset,
  };

  const { data: feed, isLoading, isError, refetch } = useActivityFeed(filters);
  const { data: stats, isLoading: isStatsLoading } = useActivityFeedStats();
  const { data: preferences } = useActivityPreferences();
  const updatePrefs = useUpdateActivityPreferences();
  const markRead = useMarkActivityRead();
  const markAllRead = useMarkAllActivitiesRead();

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate();
  }, [markAllRead]);

  const handleMarkRead = useCallback(
    (eventId: string) => {
      markRead.mutate(eventId);
    },
    [markRead]
  );

  const toggleEventTypeFilter = useCallback(
    (et: string) => {
      setSelectedEventTypes((prev) =>
        prev.includes(et) ? prev.filter((t) => t !== et) : [...prev, et]
      );
      setOffset(0);
    },
    []
  );

  const clearFilters = useCallback(() => {
    setSelectedEventTypes([]);
    setResourceType('');
    setUnreadOnly(false);
    setOffset(0);
  }, []);

  const toggleMutedType = useCallback(
    (et: string) => {
      const current = preferences?.muted_event_types || [];
      const next = current.includes(et)
        ? current.filter((t) => t !== et)
        : [...current, et];
      updatePrefs.mutate({ muted_event_types: next });
    },
    [preferences, updatePrefs]
  );

  const toggleShowRead = useCallback(() => {
    updatePrefs.mutate({ show_read: !(preferences?.show_read ?? true) });
  }, [preferences, updatePrefs]);

  const handleLoadMore = () => setOffset((prev) => prev + PAGE_SIZE);
  const handleLoadPrev = () => setOffset((prev) => Math.max(0, prev - PAGE_SIZE));

  const hasFilters =
    selectedEventTypes.length > 0 || resourceType || unreadOnly;

  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Activity Feed</h1>
            <p className="text-sm text-muted-foreground">
              Track events across your agents, threads, and deployments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreferences((p) => !p)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              showPreferences
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            Preferences
          </button>
          <button
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending || stats?.unread_count === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {markAllRead.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Mark All Read
          </button>
        </div>
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Unread"
          value={stats?.unread_count ?? 0}
          icon={<Inbox className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
          highlight={!!stats && stats.unread_count > 0}
        />
        <StatCard
          label="Events Today"
          value={stats?.events_today ?? 0}
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
        />
        <StatCard
          label="Most Active Hour"
          value={formatHour(stats?.most_active_hour ?? null)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          isLoading={isStatsLoading}
          isText
        />
      </div>

      {/* Preferences panel */}
      {showPreferences && (
        <div className="rounded-xl border bg-card p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Feed Preferences</h2>
            <button
              onClick={() => setShowPreferences(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                onClick={toggleShowRead}
                className={cn(
                  'h-5 w-9 rounded-full transition-colors relative',
                  preferences?.show_read !== false
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    preferences?.show_read !== false
                      ? 'translate-x-4'
                      : 'translate-x-0.5'
                  )}
                />
              </button>
              <span className="text-sm">Show read events</span>
            </label>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Mute event types (muted events will be hidden from your feed):
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENT_TYPES.map((et) => {
                const cfg = EVENT_TYPE_CONFIG[et];
                const isMuted = preferences?.muted_event_types?.includes(et);
                return (
                  <button
                    key={et}
                    onClick={() => toggleMutedType(et)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      isMuted
                        ? 'bg-muted text-muted-foreground line-through opacity-60'
                        : 'hover:bg-accent'
                    )}
                  >
                    {isMuted ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-wrap gap-1.5">
            {ALL_EVENT_TYPES.map((et) => {
              const cfg = EVENT_TYPE_CONFIG[et];
              const IconComponent = cfg.icon;
              const isSelected = selectedEventTypes.includes(et);
              return (
                <button
                  key={et}
                  onClick={() => toggleEventTypeFilter(et)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                  title={cfg.label}
                >
                  <IconComponent className="h-3 w-3" />
                  <span className="hidden sm:inline">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter by resource type..."
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setOffset(0);
            }}
            className="h-8 rounded-lg border bg-card px-3 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/30 w-48"
          />
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={() => {
                setUnreadOnly((v) => !v);
                setOffset(0);
              }}
              className="rounded border-muted-foreground/30"
            />
            Unread only
          </label>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonEventCard key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-red-500/60" />
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
      {!isLoading && !isError && feed && feed.events.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activity found</p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Activity timeline */}
      {!isLoading && !isError && feed && feed.events.length > 0 && (
        <>
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-1">
              {feed.events.map((event) => (
                <ActivityEventCard
                  key={event.id}
                  event={event}
                  onMarkRead={handleMarkRead}
                  isMarkingRead={
                    markRead.isPending &&
                    markRead.variables === event.id
                  }
                />
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <button
              disabled={offset === 0}
              onClick={handleLoadPrev}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                offset === 0
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-accent'
              )}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Showing {offset + 1}&ndash;
              {Math.min(offset + feed.events.length, feed.total)} of{' '}
              {feed.total}
            </span>
            {feed.has_more ? (
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Load More
                <ChevronDown className="h-3.5 w-3.5" />
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
// Activity event card
// ---------------------------------------------------------------------------

function ActivityEventCard({
  event,
  onMarkRead,
  isMarkingRead,
}: {
  event: ActivityEvent;
  onMarkRead: (id: string) => void;
  isMarkingRead: boolean;
}) {
  const cfg = EVENT_TYPE_CONFIG[event.event_type] || {
    label: event.event_type,
    icon: Clock,
    color: 'text-muted-foreground',
  };
  const IconComponent = cfg.icon;

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-accent/40 ml-2',
        !event.is_read && 'bg-card border-primary/20'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border bg-background',
          cfg.color
        )}
      >
        <IconComponent className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unread indicator */}
          {!event.is_read && (
            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
          )}
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              'bg-muted text-muted-foreground'
            )}
          >
            {cfg.label}
          </span>
          <p className="truncate text-sm font-medium text-foreground">
            {event.title}
          </p>
        </div>

        {event.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Resource link */}
        {event.resource_id && (
          <p className="text-[11px] text-muted-foreground/70">
            <span className="font-medium">{event.resource_type}</span>
            {': '}
            <span className="font-mono">{event.resource_id}</span>
          </p>
        )}

        {/* Metadata */}
        {event.metadata && Object.keys(event.metadata).length > 0 && (
          <div className="hidden group-hover:flex flex-wrap gap-x-3 text-[11px] text-muted-foreground/60 mt-1">
            {Object.entries(event.metadata)
              .slice(0, 4)
              .map(([k, v]) => (
                <span key={k}>
                  {k}: {String(v)}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Right side: timestamp + mark read */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {formatRelativeTime(event.created_at)}
        </span>
        {!event.is_read && (
          <button
            onClick={() => onMarkRead(event.id)}
            disabled={isMarkingRead}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary hover:underline disabled:opacity-50"
          >
            {isMarkingRead ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Mark read'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  isLoading: loading,
  isText,
  highlight,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  isLoading: boolean;
  isText?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3',
        highlight && 'border-primary/30'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <p
          className={cn(
            'font-semibold',
            isText ? 'text-sm truncate' : 'text-lg',
            highlight && 'text-primary'
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonEventCard() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 ml-2">
      <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}
