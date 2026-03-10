'use client';

import { useState, useEffect, useCallback } from 'react';
import { backendApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Database,
  Server,
  Bot,
  Webhook,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency_ms: number | null;
}

interface HealthData {
  database: { status: string; latency_ms: number };
  api: { status: string; uptime_seconds: number; version: string };
  services: ServiceStatus[];
  checked_at: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusColor(status: string) {
  switch (status) {
    case 'healthy':
      return 'bg-emerald-500';
    case 'degraded':
      return 'bg-yellow-500';
    default:
      return 'bg-red-500';
  }
}

function statusTextColor(status: string) {
  switch (status) {
    case 'healthy':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'degraded':
      return 'text-yellow-600 dark:text-yellow-400';
    default:
      return 'text-red-600 dark:text-red-400';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case 'degraded':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    default:
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

function serviceIcon(name: string) {
  switch (name) {
    case 'agents':
      return Bot;
    case 'workflows':
      return Server;
    case 'webhooks':
      return Webhook;
    default:
      return Server;
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Service status card
// ---------------------------------------------------------------------------

function ServiceCard({ service }: { service: ServiceStatus }) {
  const Icon = serviceIcon(service.name);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium capitalize">{service.name}</p>
            <p className={cn('text-xs font-medium capitalize', statusTextColor(service.status))}>
              {service.status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {service.latency_ms !== null && (
            <span className="text-xs text-muted-foreground">
              {service.latency_ms}ms
            </span>
          )}
          <div className={cn('h-3 w-3 rounded-full', statusColor(service.status))} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backendApi.get<HealthData>('/admin/health');
      if (res.success && res.data) {
        setHealth(res.data);
        setLastRefresh(new Date());
      } else {
        setError(res.error?.message || 'Failed to fetch health data');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Derive overall status
  const overallStatus = (() => {
    if (!health) return 'unknown';
    const allStatuses = [
      health.database.status,
      ...health.services.map((s) => s.status),
    ];
    if (allStatuses.some((s) => s === 'down')) return 'down';
    if (allStatuses.some((s) => s === 'degraded')) return 'degraded';
    return 'healthy';
  })();

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {!loading && health && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl border p-4',
            overallStatus === 'healthy' && 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20',
            overallStatus === 'degraded' && 'border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20',
            overallStatus === 'down' && 'border-red-500/30 bg-red-50 dark:bg-red-950/20',
          )}
        >
          <StatusIcon status={overallStatus} />
          <div className="flex-1">
            <p className={cn('text-sm font-semibold', statusTextColor(overallStatus))}>
              {overallStatus === 'healthy' && 'All Systems Operational'}
              {overallStatus === 'degraded' && 'Degraded Performance'}
              {overallStatus === 'down' && 'Outage Detected'}
            </p>
            <p className="text-xs text-muted-foreground">
              Last checked: {lastRefresh?.toLocaleTimeString() ?? '--'}
            </p>
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !health && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {error && !health && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <XCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={fetchHealth}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Service status grid */}
      {health && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Database card */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Database className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Database</p>
                    <p className={cn('text-xs font-medium capitalize', statusTextColor(health.database.status))}>
                      {health.database.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {health.database.latency_ms >= 0 ? `${health.database.latency_ms}ms` : '--'}
                  </span>
                  <div className={cn('h-3 w-3 rounded-full', statusColor(health.database.status))} />
                </div>
              </div>
            </div>

            {/* Dynamic services */}
            {health.services.map((svc) => (
              <ServiceCard key={svc.name} service={svc} />
            ))}
          </div>

          {/* API info row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uptime</p>
                  <p className="text-lg font-semibold">
                    {formatUptime(health.api.uptime_seconds)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">API Version</p>
                  <p className="text-lg font-semibold">{health.api.version}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <RefreshCw className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Auto-Refresh</p>
                  <p className="text-lg font-semibold">Every 30s</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
