'use client';

import { useState } from 'react';
import {
  Activity,
  Clock,
  AlertTriangle,
  DollarSign,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useActiveRuns,
  useRunTimeline,
  useMonitorStats,
} from '@/hooks/monitoring/use-run-monitor';
import type { ActiveRun, RunSnapshot } from '@/lib/api/run-monitor';

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  pulse,
  className,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 flex items-center gap-3',
        className
      )}
    >
      <div className="relative flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
        {pulse && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline row
// ---------------------------------------------------------------------------

function TimelineRow({ snapshot }: { snapshot: RunSnapshot }) {
  return (
    <div className="flex items-start gap-3 py-2 px-3 text-sm">
      <div className="mt-1 h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{snapshot.status}</span>
          {snapshot.current_tool && (
            <span className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              {snapshot.current_tool}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
          <span>Step {snapshot.step_count}</span>
          <span>{snapshot.tokens_used.toLocaleString()} tokens</span>
          <span>${snapshot.cost_so_far.toFixed(4)}</span>
          <span>{(snapshot.elapsed_ms / 1000).toFixed(1)}s</span>
        </div>
        {snapshot.error && (
          <p className="text-xs text-destructive mt-1 truncate">{snapshot.error}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
        {new Date(snapshot.captured_at).toLocaleTimeString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active run row (expandable)
// ---------------------------------------------------------------------------

function ActiveRunRow({ run }: { run: ActiveRun }) {
  const [expanded, setExpanded] = useState(false);
  const { data: timeline, isLoading: timelineLoading } = useRunTimeline(
    expanded ? run.run_id : null
  );

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_100px_120px_80px_80px_80px] gap-2 items-center">
          <span className="font-medium truncate text-sm">
            {run.agent_name || run.agent_id}
          </span>
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full text-center font-medium w-fit',
              run.status === 'running'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {run.status}
          </span>
          <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
            {run.current_tool && (
              <>
                <Wrench className="h-3 w-3 shrink-0" />
                {run.current_tool}
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {(run.elapsed_ms / 1000).toFixed(1)}s
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {run.tokens_used.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            ${run.cost_so_far.toFixed(4)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-2 max-h-64 overflow-y-auto">
          {timelineLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading timeline...</span>
            </div>
          ) : timeline && timeline.length > 0 ? (
            <div className="divide-y divide-border/50">
              {timeline.map((snapshot) => (
                <TimelineRow key={snapshot.id} snapshot={snapshot} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No snapshots recorded yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Radio className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No active runs</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        When agents are running, they will appear here with live status updates, tool usage, and cost tracking.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MonitoringPage() {
  const { data: stats } = useMonitorStats();
  const { data: activeRuns, isLoading } = useActiveRuns();

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time view of active agent runs, performance, and costs.
          </p>
        </div>

        {/* Live stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Active Runs"
            value={stats?.active_runs ?? 0}
            icon={Activity}
            pulse={(stats?.active_runs ?? 0) > 0}
          />
          <StatCard
            label="Avg Latency"
            value={
              stats?.avg_latency_ms
                ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s`
                : '—'
            }
            icon={Clock}
          />
          <StatCard
            label="Errors Today"
            value={stats?.errors_today ?? 0}
            icon={AlertTriangle}
          />
          <StatCard
            label="Cost Today"
            value={
              stats?.cost_today != null
                ? `$${stats.cost_today.toFixed(2)}`
                : '$0.00'
            }
            icon={DollarSign}
          />
        </div>

        {/* Active runs table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-4" /> {/* spacer for chevron */}
              <div className="flex-1 grid grid-cols-[1fr_100px_120px_80px_80px_80px] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Agent</span>
                <span>Status</span>
                <span>Current Tool</span>
                <span>Elapsed</span>
                <span>Tokens</span>
                <span>Cost</span>
              </div>
            </div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading runs...</span>
            </div>
          ) : activeRuns && activeRuns.length > 0 ? (
            activeRuns.map((run) => <ActiveRunRow key={run.run_id} run={run} />)
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Auto-refresh indicator */}
        <p className="text-xs text-muted-foreground text-center">
          Auto-refreshing every 5 seconds
        </p>
      </div>
    </div>
  );
}
