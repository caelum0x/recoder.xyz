'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useAgentOsOutbox,
  type AgentOsOutboxRecord,
  type AgentOsOutboxStatus,
} from '@/hooks/workspaces/use-mission-control';

const STATUS_STYLE: Record<AgentOsOutboxStatus, string> = {
  pending:
    'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  published:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  discarded: 'border-muted-foreground/40 bg-muted text-muted-foreground',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function countByStatus(records: AgentOsOutboxRecord[]) {
  return records.reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<AgentOsOutboxStatus, number>,
  );
}

/**
 * Renders the Agent OS CloudEvent outbox: control-plane events queued for
 * delivery to NATS/JetStream, with pending/published/failed status so drain
 * health is visible for the launch loop.
 */
export function EventOutbox() {
  const { data, isLoading, isError, error } = useAgentOsOutbox();

  const sorted = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [data],
  );
  const counts = useMemo(() => countByStatus(sorted), [sorted]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading event outbox…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : 'Failed to load event outbox.'}
      </p>
    );
  }

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No control-plane events in the outbox yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
          {counts.pending ?? 0} pending
        </span>
        <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
          {counts.published ?? 0} published
        </span>
        <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
          {counts.failed ?? 0} failed
        </span>
        {counts.discarded ? (
          <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
            {counts.discarded} discarded
          </span>
        ) : null}
      </div>
      <ScrollArea className="max-h-72 pr-3">
        <div className="space-y-1.5">
          {sorted.slice(0, 30).map((record) => (
            <div
              key={record.outboxId}
              className="rounded border px-3 py-1.5 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">
                  {record.event.type}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 rounded px-2 py-0.5 text-[11px]',
                    STATUS_STYLE[record.status],
                  )}
                >
                  {record.status}
                </Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                <span className="truncate">{record.event.subject}</span>
                <span>{formatTime(record.updatedAt)}</span>
                {record.attempts > 0 ? (
                  <span>{record.attempts} attempts</span>
                ) : null}
              </div>
              {record.lastError ? (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-red-600 dark:text-red-400">
                  {record.lastError}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
