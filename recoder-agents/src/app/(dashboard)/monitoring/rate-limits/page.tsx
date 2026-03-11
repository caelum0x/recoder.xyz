'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  BarChart3,
  Percent,
  Zap,
  Clock,
  Filter,
  Plus,
  Save,
  Loader2,
  RefreshCw,
  Settings2,
  Activity,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRateLimitEvents,
  useRateLimitSummary,
  useRateLimitTimeline,
  useRateLimitConfigs,
  useUpdateRateLimitConfig,
} from '@/hooks/monitoring/use-rate-limit-dashboard';
import type {
  RateLimitEvent,
  RateLimitConfig,
  TimelineBucket,
  TopEndpointSummary,
  UpdateConfigRequest,
} from '@/lib/api/rate-limit-dashboard';

// ============================================================================
// Constants
// ============================================================================

const LIMIT_TYPE_LABELS: Record<string, string> = {
  per_minute: 'Per Minute',
  per_hour: 'Per Hour',
  per_day: 'Per Day',
  concurrent: 'Concurrent',
  burst: 'Burst',
};

const LIMIT_TYPE_OPTIONS = Object.entries(LIMIT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// ============================================================================
// Summary Cards
// ============================================================================

function SummaryCards({
  totalEvents,
  blockedCount,
  blockRate,
  topEndpoint,
}: {
  totalEvents: number;
  blockedCount: number;
  blockRate: number;
  topEndpoint: string;
}) {
  const cards = [
    {
      label: 'Total Events (24h)',
      value: totalEvents.toLocaleString(),
      icon: Activity,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Blocked Requests',
      value: blockedCount.toLocaleString(),
      icon: ShieldAlert,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Block Rate',
      value: `${blockRate.toFixed(1)}%`,
      icon: Percent,
      color: blockRate > 10 ? 'text-red-500' : blockRate > 5 ? 'text-amber-500' : 'text-green-500',
      bg: blockRate > 10 ? 'bg-red-500/10' : blockRate > 5 ? 'bg-amber-500/10' : 'bg-green-500/10',
    },
    {
      label: 'Most Hit Endpoint',
      value: topEndpoint || 'N/A',
      icon: Zap,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      truncate: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border bg-card p-4 flex items-start gap-3"
        >
          <div className={cn('rounded-lg p-2', card.bg)}>
            <card.icon className={cn('h-5 w-5', card.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                'text-lg font-semibold mt-0.5',
                card.truncate && 'truncate text-sm'
              )}
              title={card.truncate ? card.value : undefined}
            >
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Timeline Chart (CSS-based stacked bar chart)
// ============================================================================

function TimelineChart({ data }: { data: TimelineBucket[] }) {
  const maxTotal = useMemo(
    () => Math.max(1, ...data.map((d) => d.total)),
    [data]
  );

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Events Timeline
        </h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          No timeline data available
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Events Timeline (Hourly)
        </h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            Allowed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
            Blocked
          </span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-48">
        {data.map((bucket, i) => {
          const allowedPct = (bucket.allowed / maxTotal) * 100;
          const blockedPct = (bucket.blocked / maxTotal) * 100;
          const hourLabel = new Date(bucket.hour).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1 group relative"
            >
              <div className="w-full flex flex-col justify-end h-40">
                <div
                  className="w-full bg-red-500 rounded-t-sm transition-all"
                  style={{ height: `${blockedPct}%` }}
                />
                <div
                  className="w-full bg-blue-500 transition-all"
                  style={{ height: `${allowedPct}%` }}
                />
              </div>
              {i % Math.max(1, Math.floor(data.length / 8)) === 0 && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {hourLabel}
                </span>
              )}
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-popover border border-border rounded-md p-2 text-xs shadow-md whitespace-nowrap">
                <p className="font-medium">{hourLabel}</p>
                <p>Total: {bucket.total}</p>
                <p className="text-blue-400">Allowed: {bucket.allowed}</p>
                <p className="text-red-400">Blocked: {bucket.blocked}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Top Endpoints Table
// ============================================================================

function TopEndpointsTable({ endpoints }: { endpoints: TopEndpointSummary[] }) {
  if (endpoints.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Top Endpoints
        </h3>
      </div>
      <div className="divide-y divide-border">
        {endpoints.map((ep) => {
          const blockRate =
            ep.total_hits > 0
              ? ((ep.blocked_hits / ep.total_hits) * 100).toFixed(1)
              : '0.0';
          const utilization = Math.min(100, (ep.total_hits / Math.max(1, endpoints[0].total_hits)) * 100);

          return (
            <div key={ep.endpoint} className="p-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono truncate" title={ep.endpoint}>
                  {ep.endpoint}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>{ep.total_hits} hits</span>
                  <span className="text-red-400">{ep.blocked_hits} blocked</span>
                  <span>{blockRate}% block rate</span>
                </div>
              </div>
              <div className="w-32 flex-shrink-0">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Event Log
// ============================================================================

function EventLog({
  events,
  isLoading,
  filterEndpoint,
  setFilterEndpoint,
  blockedOnly,
  setBlockedOnly,
}: {
  events: RateLimitEvent[];
  isLoading: boolean;
  filterEndpoint: string;
  setFilterEndpoint: (v: string) => void;
  blockedOnly: boolean;
  setBlockedOnly: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Event Log
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by endpoint..."
              value={filterEndpoint}
              onChange={(e) => setFilterEndpoint(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={(e) => setBlockedOnly(e.target.checked)}
              className="rounded border-border"
            />
            Blocked only
          </label>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No events found
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="p-3 flex items-center gap-3">
              {event.was_blocked ? (
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono truncate" title={event.endpoint}>
                  {event.endpoint}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span>
                    {new Date(event.occurred_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>{LIMIT_TYPE_LABELS[event.limit_type] || event.limit_type}</span>
                  <span>
                    {event.current_count}/{event.max_allowed}
                  </span>
                </div>
              </div>
              {event.was_blocked && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                  Blocked
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Config Editor
// ============================================================================

function ConfigEditor({
  configs,
  isLoading,
  onSave,
  isSaving,
}: {
  configs: RateLimitConfig[];
  isLoading: boolean;
  onSave: (data: UpdateConfigRequest) => void;
  isSaving: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState<UpdateConfigRequest>({
    endpoint_pattern: '',
    limit_type: 'per_minute',
    max_allowed: 100,
    window_seconds: 60,
  });

  const handleSave = useCallback(() => {
    if (!formData.endpoint_pattern.trim()) return;
    onSave(formData);
    setShowAdd(false);
    setFormData({
      endpoint_pattern: '',
      limit_type: 'per_minute',
      max_allowed: 100,
      window_seconds: 60,
    });
  }, [formData, onSave]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Rate Limit Rules
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Rule
        </button>
      </div>

      {/* Add Rule Form */}
      {showAdd && (
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Endpoint Pattern
              </label>
              <input
                type="text"
                placeholder="/v1/agents/*"
                value={formData.endpoint_pattern}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, endpoint_pattern: e.target.value }))
                }
                className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Limit Type
              </label>
              <select
                value={formData.limit_type}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, limit_type: e.target.value }))
                }
                className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
              >
                {LIMIT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Max Allowed
              </label>
              <input
                type="number"
                min={1}
                value={formData.max_allowed}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_allowed: parseInt(e.target.value) || 1,
                  }))
                }
                className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Window (seconds)
              </label>
              <input
                type="number"
                min={1}
                value={formData.window_seconds}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    window_seconds: parseInt(e.target.value) || 1,
                  }))
                }
                className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formData.endpoint_pattern.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Rule
            </button>
          </div>
        </div>
      )}

      {/* Existing Rules */}
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : configs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No rate limit rules configured
          </div>
        ) : (
          configs.map((config) => (
            <div key={config.id} className="p-3 flex items-center gap-3">
              <div
                className={cn(
                  'h-2 w-2 rounded-full flex-shrink-0',
                  config.is_active ? 'bg-green-500' : 'bg-muted-foreground'
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono truncate" title={config.endpoint_pattern}>
                  {config.endpoint_pattern}
                </p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span>{LIMIT_TYPE_LABELS[config.limit_type] || config.limit_type}</span>
                  <span>Max: {config.max_allowed}</span>
                  <span>Window: {config.window_seconds}s</span>
                </div>
              </div>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  config.is_active
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {config.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function RateLimitDashboardPage() {
  const [filterEndpoint, setFilterEndpoint] = useState('');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [hours] = useState(24);

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useRateLimitSummary(hours);

  const { data: timeline, isLoading: timelineLoading } = useRateLimitTimeline(hours);

  const { data: events, isLoading: eventsLoading } = useRateLimitEvents({
    endpoint: filterEndpoint || undefined,
    blocked_only: blockedOnly || undefined,
    hours,
    limit: 100,
  });

  const { data: configs, isLoading: configsLoading } = useRateLimitConfigs();

  const updateConfig = useUpdateRateLimitConfig();

  const handleSaveConfig = useCallback(
    (data: UpdateConfigRequest) => {
      updateConfig.mutate(data);
    },
    [updateConfig]
  );

  const topEndpoint =
    summary?.top_endpoints?.[0]?.endpoint || '';

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Rate Limit Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and configure API rate limits
          </p>
        </div>
        <button
          onClick={() => refetchSummary()}
          disabled={summaryLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw
            className={cn('h-4 w-4', summaryLoading && 'animate-spin')}
          />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        totalEvents={summary?.total_events || 0}
        blockedCount={summary?.blocked_count || 0}
        blockRate={summary?.block_rate_pct || 0}
        topEndpoint={topEndpoint}
      />

      {/* Timeline Chart */}
      {timelineLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TimelineChart data={timeline || []} />
      )}

      {/* Two columns: Top Endpoints + Event Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopEndpointsTable endpoints={summary?.top_endpoints || []} />
        <EventLog
          events={events || []}
          isLoading={eventsLoading}
          filterEndpoint={filterEndpoint}
          setFilterEndpoint={setFilterEndpoint}
          blockedOnly={blockedOnly}
          setBlockedOnly={setBlockedOnly}
        />
      </div>

      {/* Config Editor */}
      <ConfigEditor
        configs={configs || []}
        isLoading={configsLoading}
        onSave={handleSaveConfig}
        isSaving={updateConfig.isPending}
      />
    </div>
  );
}
