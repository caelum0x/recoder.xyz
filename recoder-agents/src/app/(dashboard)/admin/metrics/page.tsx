'use client';

import { useState, useEffect, useCallback } from 'react';
import { backendApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Users,
  UserCheck,
  Bot,
  MessageSquare,
  Play,
  AlertCircle,
  RefreshCw,
  Loader2,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricsData {
  total_users: number;
  active_users_24h: number;
  total_agents: number;
  total_threads: number;
  total_runs_today: number;
  storage_used_mb: number;
  errors_24h: number;
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-5 transition-colors',
        highlight && 'border-red-500/30 bg-red-50 dark:bg-red-950/20',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            highlight ? 'bg-red-100 dark:bg-red-900/30' : 'bg-primary/10',
          )}
        >
          <Icon
            className={cn(
              'h-5 w-5',
              highlight ? 'text-red-600 dark:text-red-400' : 'text-primary',
            )}
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backendApi.get<MetricsData>('/admin/metrics');
      if (res.success && res.data) {
        setMetrics(res.data);
      } else {
        setError(res.error?.message || 'Failed to fetch metrics');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Platform Metrics</h2>
          <p className="text-xs text-muted-foreground">
            Real-time platform statistics
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && !metrics && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && !metrics && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <XCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={fetchMetrics}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Summary cards */}
      {metrics && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Total Users"
              value={metrics.total_users}
              icon={Users}
            />
            <MetricCard
              label="Active Users (24h)"
              value={metrics.active_users_24h}
              icon={UserCheck}
            />
            <MetricCard
              label="Total Agents"
              value={metrics.total_agents}
              icon={Bot}
            />
            <MetricCard
              label="Total Threads"
              value={metrics.total_threads}
              icon={MessageSquare}
            />
            <MetricCard
              label="Runs Today"
              value={metrics.total_runs_today}
              icon={Play}
            />
            <MetricCard
              label="Errors (24h)"
              value={metrics.errors_24h}
              icon={AlertCircle}
              highlight={metrics.errors_24h > 0}
            />
          </div>

          {/* Storage info */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs text-muted-foreground mb-1">
              Estimated Storage Used
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {metrics.storage_used_mb.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{' '}
              MB
            </p>
            <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min((metrics.storage_used_mb / 10000) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Based on database table sizes
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground/60">
            Powered by Recoder Platform
          </p>
        </>
      )}
    </div>
  );
}
