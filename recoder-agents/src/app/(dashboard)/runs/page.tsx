'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Bot,
  Coins,
  Zap,
  Cpu,
  Inbox,
  RefreshCw,
  Eye,
  Hash,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRuns } from '@/hooks/threads/use-runs';
import { useActiveRuns } from '@/hooks/threads/use-active-runs';
import type { RunStatus } from '@/lib/api/runs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 60_000) return 'Just now';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const elapsed = Math.max(0, end - start);
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const STATUS_FILTERS: Array<{ key: RunStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.FC<{ className?: string }>;
    className: string;
    iconClassName?: string;
  }
> = {
  running: {
    label: 'Running',
    icon: Loader2,
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
    iconClassName: 'animate-spin',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50',
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertTriangle,
    className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-300 dark:border-zinc-700/50',
  },
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Run row component
// ---------------------------------------------------------------------------

function RunRow({
  run,
}: {
  run: {
    id: string;
    agent_name?: string;
    model: string;
    status: string;
    started_at: string;
    completed_at?: string;
    token_count?: number;
    total_tokens?: number;
    estimated_cost?: number;
    cost?: number;
  };
}) {
  const statusConf = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusConf.icon;
  const isRunning = run.status === 'running' || run.status === 'pending';

  return (
    <Link
      href={`/runs/${run.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
    >
      {/* Agent icon + name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted flex-shrink-0">
          <Bot className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {run.agent_name || 'Agent'}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'flex items-center gap-1 text-[10px] px-1.5 py-0',
                statusConf.className,
              )}
            >
              <StatusIcon
                className={cn('h-2.5 w-2.5', statusConf.iconClassName)}
              />
              {statusConf.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {run.id.slice(0, 8)}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span>{formatDateTime(run.started_at)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
        <span className="flex items-center gap-1 w-16">
          <Clock className="h-3 w-3" />
          {formatDuration(run.started_at, run.completed_at)}
        </span>
        <span className="flex items-center gap-1 w-12">
          <Cpu className="h-3 w-3" />
          <span className="truncate max-w-[60px]">{run.model}</span>
        </span>
        <span className="flex items-center gap-1 w-16 tabular-nums">
          <Zap className="h-3 w-3" />
          {(run.token_count ?? run.total_tokens ?? 0).toLocaleString()}
        </span>
        <span className="flex items-center gap-1 w-14 tabular-nums">
          <Coins className="h-3 w-3" />
          ${(run.estimated_cost ?? run.cost ?? 0).toFixed(2)}
        </span>
      </div>

      {/* Watch button */}
      <Button
        variant="ghost"
        size="sm"
        className="hidden group-hover:flex items-center gap-1.5 h-7 text-xs flex-shrink-0"
        asChild
      >
        <span>
          <Eye className="h-3 w-3" />
          {isRunning ? 'Watch' : 'View'}
        </span>
      </Button>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RunsListPage() {
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');
  const [offset, setOffset] = useState(0);

  // Fetch active runs (always)
  const { data: activeRuns, isLoading: isActiveLoading } = useActiveRuns();

  // Fetch completed/historical runs from backend
  const { data: runsData, isLoading: isRunsLoading, refetch } = useRuns({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset,
  });

  const isLoading = isActiveLoading && isRunsLoading;

  // Merge active runs into the list (active runs always at top)
  const allRuns = useMemo(() => {
    const active = (activeRuns ?? []).map((r) => ({
      ...r,
      completed_at: undefined as string | undefined,
    }));
    const historical = runsData?.runs ?? [];

    // De-duplicate: active runs take precedence
    const activeIds = new Set(active.map((r) => r.id));
    const filtered = historical.filter((r) => !activeIds.has(r.id));

    // Filter active runs by status if filter is set
    const filteredActive =
      statusFilter === 'all'
        ? active
        : active.filter((r) => r.status === statusFilter);

    return [...filteredActive, ...filtered];
  }, [activeRuns, runsData, statusFilter]);

  const totalCount = (runsData?.total ?? 0) + (activeRuns?.length ?? 0);
  const hasMore = runsData?.has_more ?? false;

  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Play className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Runs</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and review agent execution runs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filter bar */}
      <div className="mb-4">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setStatusFilter(key);
                setOffset(0);
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {label}
              {key === 'running' && activeRuns && activeRuns.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white font-bold">
                  {activeRuns.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && allRuns.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === 'all'
              ? 'No runs found'
              : `No ${statusFilter} runs`}
          </p>
          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-xs text-primary hover:underline"
            >
              Show all runs
            </button>
          )}
        </div>
      )}

      {/* Runs list */}
      {!isLoading && allRuns.length > 0 && (
        <>
          <div className="space-y-2">
            {allRuns.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>

          {/* Pagination */}
          {(offset > 0 || hasMore) && (
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((p) => Math.max(0, p - PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {totalCount} total run{totalCount !== 1 ? 's' : ''}
              </span>
              {hasMore ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset((p) => p + PAGE_SIZE)}
                >
                  Next
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">End</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
