'use client';

import { useState } from 'react';
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  ChevronDown,
  ChevronRight,
  Loader2,
  Activity,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useActiveSandboxes,
  useSandboxResourceHistory,
  useSandboxResourceSummary,
} from '@/hooks/monitoring/use-sandbox-monitor';
import type {
  ActiveSandbox,
  SandboxResourceSnapshot,
} from '@/lib/api/sandbox-monitor';

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
// Gauge component
// ---------------------------------------------------------------------------

function Gauge({
  value,
  max,
  label,
  unit,
  className,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color =
    pct > 90
      ? 'bg-red-500'
      : pct > 70
        ? 'bg-amber-500'
        : pct > 50
          ? 'bg-yellow-500'
          : 'bg-green-500';

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: 'bg-green-500/10 text-green-600 dark:text-green-400',
    idle: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    stopped: 'bg-muted text-muted-foreground',
    error: 'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded-full font-medium',
        colorMap[status] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Resource history chart (simplified inline)
// ---------------------------------------------------------------------------

function ResourceHistoryChart({
  sandboxId,
}: {
  sandboxId: string;
}) {
  const { data: history, isLoading } = useSandboxResourceHistory(sandboxId, 4);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No history data available.
      </p>
    );
  }

  // Show last 20 snapshots in a mini chart view
  const recent = history.slice(-20);

  return (
    <div className="space-y-4">
      {/* CPU history */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
          <Cpu className="h-3 w-3" /> CPU Usage (%)
        </p>
        <div className="flex items-end gap-0.5 h-12">
          {recent.map((snap: SandboxResourceSnapshot, idx: number) => {
            const val = snap.cpu_percent ?? 0;
            const heightPct = Math.max(val, 2);
            return (
              <div
                key={snap.id || idx}
                className={cn(
                  'flex-1 rounded-t transition-all',
                  val > 90
                    ? 'bg-red-500'
                    : val > 70
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                )}
                style={{ height: `${heightPct}%` }}
                title={`${val}% at ${new Date(snap.captured_at).toLocaleTimeString()}`}
              />
            );
          })}
        </div>
      </div>

      {/* Memory history */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
          <MemoryStick className="h-3 w-3" /> Memory (MB)
        </p>
        <div className="flex items-end gap-0.5 h-12">
          {recent.map((snap: SandboxResourceSnapshot, idx: number) => {
            const val = snap.memory_mb ?? 0;
            const maxMem = Math.max(
              ...recent.map((s: SandboxResourceSnapshot) => s.memory_mb ?? 0),
              1
            );
            const heightPct = Math.max((val / maxMem) * 100, 2);
            return (
              <div
                key={snap.id || idx}
                className="flex-1 rounded-t bg-blue-500 transition-all"
                style={{ height: `${heightPct}%` }}
                title={`${val}MB at ${new Date(snap.captured_at).toLocaleTimeString()}`}
              />
            );
          })}
        </div>
      </div>

      {/* Network I/O history */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
          <Network className="h-3 w-3" /> Network (KB)
        </p>
        <div className="flex items-end gap-0.5 h-12">
          {recent.map((snap: SandboxResourceSnapshot, idx: number) => {
            const valIn = snap.network_in_kb ?? 0;
            const valOut = snap.network_out_kb ?? 0;
            const total = valIn + valOut;
            const maxNet = Math.max(
              ...recent.map(
                (s: SandboxResourceSnapshot) =>
                  (s.network_in_kb ?? 0) + (s.network_out_kb ?? 0)
              ),
              1
            );
            const heightPct = Math.max((total / maxNet) * 100, 2);
            return (
              <div
                key={snap.id || idx}
                className="flex-1 rounded-t bg-purple-500 transition-all"
                style={{ height: `${heightPct}%` }}
                title={`In: ${valIn}KB, Out: ${valOut}KB at ${new Date(snap.captured_at).toLocaleTimeString()}`}
              />
            );
          })}
        </div>
      </div>

      {/* Timeline labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          {recent.length > 0 && new Date(recent[0].captured_at).toLocaleTimeString()}
        </span>
        <span>
          {recent.length > 0 &&
            new Date(recent[recent.length - 1].captured_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sandbox row (expandable)
// ---------------------------------------------------------------------------

function SandboxRow({ sandbox }: { sandbox: ActiveSandbox }) {
  const [expanded, setExpanded] = useState(false);

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

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_120px_120px_100px_80px] gap-3 items-center">
          <div className="min-w-0">
            <span className="font-medium text-sm truncate block">
              {sandbox.sandbox_id.slice(0, 12)}...
            </span>
            {sandbox.agent_id && (
              <span className="text-xs text-muted-foreground truncate block">
                Agent: {sandbox.agent_id.slice(0, 8)}...
              </span>
            )}
          </div>

          <Gauge
            value={sandbox.cpu_percent ?? 0}
            max={100}
            label="CPU"
            unit="%"
          />

          <Gauge
            value={sandbox.memory_mb ?? 0}
            max={4096}
            label="Memory"
            unit="MB"
          />

          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Network className="h-3 w-3" />
              <span className="tabular-nums">
                {((sandbox.network_in_kb ?? 0) + (sandbox.network_out_kb ?? 0)).toLocaleString()}KB
              </span>
            </div>
          </div>

          <StatusBadge status={sandbox.status} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">CPU</p>
              <p className="text-sm font-medium tabular-nums">
                {sandbox.cpu_percent ?? 0}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Memory</p>
              <p className="text-sm font-medium tabular-nums">
                {sandbox.memory_mb ?? 0} MB
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Disk</p>
              <p className="text-sm font-medium tabular-nums">
                {sandbox.disk_mb ?? 0} MB
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Processes</p>
              <p className="text-sm font-medium tabular-nums">
                {sandbox.process_count ?? 0}
              </p>
            </div>
          </div>

          <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Resource History (Last 4h)
          </h4>
          <ResourceHistoryChart sandboxId={sandbox.sandbox_id} />
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
        <Server className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No active sandboxes</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        When sandbox environments are running, their resource usage will appear here
        with live CPU, memory, and network metrics.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SandboxResourceMonitorPage() {
  const { data: summary } = useSandboxResourceSummary();
  const { data: sandboxes, isLoading } = useActiveSandboxes();

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-6 w-6" />
            Sandbox Resources
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time resource utilization for active sandbox environments.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Active Sandboxes"
            value={summary?.total_sandboxes ?? 0}
            icon={Server}
            pulse={(summary?.running_sandboxes ?? 0) > 0}
          />
          <StatCard
            label="Total Memory"
            value={
              summary?.total_memory_mb
                ? `${(summary.total_memory_mb / 1024).toFixed(1)} GB`
                : '0 GB'
            }
            icon={MemoryStick}
          />
          <StatCard
            label="Avg CPU"
            value={
              summary?.avg_cpu_percent != null
                ? `${summary.avg_cpu_percent.toFixed(1)}%`
                : '0%'
            }
            icon={Cpu}
          />
          <StatCard
            label="Network I/O"
            value={
              summary
                ? `${((summary.total_network_in_kb + summary.total_network_out_kb) / 1024).toFixed(1)} MB`
                : '0 MB'
            }
            icon={ArrowUpDown}
          />
        </div>

        {/* Sandbox list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-4" />
              <div className="flex-1 grid grid-cols-[1fr_120px_120px_100px_80px] gap-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Sandbox</span>
                <span>CPU</span>
                <span>Memory</span>
                <span>Network</span>
                <span>Status</span>
              </div>
            </div>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading sandboxes...
              </span>
            </div>
          ) : sandboxes && sandboxes.length > 0 ? (
            sandboxes.map((sandbox) => (
              <SandboxRow key={sandbox.sandbox_id} sandbox={sandbox} />
            ))
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Auto-refresh indicator */}
        <p className="text-xs text-muted-foreground text-center">
          Auto-refreshing every 10 seconds
        </p>
      </div>
    </div>
  );
}
