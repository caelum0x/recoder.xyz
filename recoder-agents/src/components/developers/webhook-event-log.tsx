'use client';

import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Filter,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useWebhookEvents,
  useRecentWebhookEvents,
  useWebhookEventStats,
  useRetryWebhookEvent,
} from '@/hooks/developers/use-webhook-events';
import type { WebhookEvent, WebhookEventStatus } from '@/lib/api/webhook-events';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  },
  retrying: {
    label: 'Retrying',
    icon: RefreshCw,
    className: 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
};

function EventStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('gap-1', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Stats header
// ---------------------------------------------------------------------------

function StatsHeader({ webhookId }: { webhookId?: string }) {
  const { data: stats, isLoading } = useWebhookEventStats(webhookId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats || stats.total_events === 0) {
    return null;
  }

  const statItems = [
    { label: 'Total', value: stats.total_events, color: 'text-foreground' },
    { label: 'Success', value: stats.success_count, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Failed', value: stats.failed_count, color: 'text-red-600 dark:text-red-400' },
    { label: 'Pending', value: stats.pending_count, color: 'text-yellow-600 dark:text-yellow-400' },
    { label: 'Success Rate', value: `${stats.success_rate}%`, color: 'text-foreground' },
    {
      label: 'Avg Duration',
      value: stats.avg_duration_ms ? `${stats.avg_duration_ms.toFixed(0)}ms` : '-',
      color: 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-card px-3 py-2.5"
        >
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {item.label}
          </div>
          <div className={cn('text-lg font-semibold tabular-nums mt-0.5', item.color)}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event row (expandable)
// ---------------------------------------------------------------------------

function EventRow({ event }: { event: WebhookEvent }) {
  const [expanded, setExpanded] = useState(false);
  const retryMutation = useRetryWebhookEvent();

  const handleRetry = () => {
    retryMutation.mutate(event.id, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('Event retried successfully');
        } else {
          toast.error(res.message || 'Retry failed');
        }
      },
      onError: () => {
        toast.error('Failed to retry event');
      },
    });
  };

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <button
          type="button"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <EventStatusBadge status={event.status} />

        <code className="flex-shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-xs font-mono">
          {event.event_type}
        </code>

        {event.response_status && (
          <span
            className={cn(
              'text-xs font-mono',
              event.response_status >= 200 && event.response_status < 300
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            HTTP {event.response_status}
          </span>
        )}

        {event.duration_ms !== undefined && event.duration_ms !== null && (
          <span className="text-xs text-muted-foreground">
            {event.duration_ms}ms
          </span>
        )}

        <span className="text-xs text-muted-foreground">
          {event.attempt_count}/{event.max_attempts}
        </span>

        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {new Date(event.created_at).toLocaleString()}
        </span>

        {(event.status === 'failed' || event.status === 'pending') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            disabled={retryMutation.isPending}
            onClick={handleRetry}
            title="Retry delivery"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', retryMutation.isPending && 'animate-spin')}
            />
          </Button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pl-12 space-y-3">
          {event.error_message && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Error
              </span>
              <pre className="text-xs text-red-600 dark:text-red-400 bg-red-500/5 border border-red-500/10 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
                {event.error_message}
              </pre>
            </div>
          )}

          {event.request_payload && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Request Payload
              </span>
              <pre className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(event.request_payload, null, 2)}
              </pre>
            </div>
          )}

          {event.response_body && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Response Body
              </span>
              <pre className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
                {event.response_body}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {event.delivered_at && (
              <span>Delivered: {new Date(event.delivered_at).toLocaleString()}</span>
            )}
            {event.failed_at && (
              <span>Failed: {new Date(event.failed_at).toLocaleString()}</span>
            )}
            {event.next_retry_at && (
              <span>Next retry: {new Date(event.next_retry_at).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: WebhookEventStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'retrying', label: 'Retrying' },
];

function StatusFilter({
  value,
  onChange,
}: {
  value: WebhookEventStatus | 'all';
  onChange: (v: WebhookEventStatus | 'all') => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhook Event Log (per-webhook)
// ---------------------------------------------------------------------------

export function WebhookEventLog({ webhookId }: { webhookId: string }) {
  const [statusFilter, setStatusFilter] = useState<WebhookEventStatus | 'all'>('all');

  const { data, isLoading } = useWebhookEvents(webhookId, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  });

  return (
    <div className="space-y-4">
      <StatsHeader webhookId={webhookId} />

      <div className="rounded-xl border border-border bg-card">
        {/* Filter bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Event Log</h3>
          </div>
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>

        {/* Event list */}
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.events.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No events found{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.
            </p>
          </div>
        ) : (
          <div className="divide-y-0">
            {data.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* Footer */}
        {data && data.total > 0 && (
          <div className="px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
            Showing {data.events.length} of {data.total} events
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Events (across all webhooks)
// ---------------------------------------------------------------------------

export function RecentWebhookEvents() {
  const [statusFilter, setStatusFilter] = useState<WebhookEventStatus | 'all'>('all');

  const { data, isLoading } = useRecentWebhookEvents({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
  });

  return (
    <div className="space-y-4">
      <StatsHeader />

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Recent Events (All Webhooks)</h3>
          </div>
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.events.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No recent webhook events.
            </p>
          </div>
        ) : (
          <div className="divide-y-0">
            {data.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}

        {data && data.total > 0 && (
          <div className="px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
            Showing {data.events.length} of {data.total} events
          </div>
        )}
      </div>
    </div>
  );
}
