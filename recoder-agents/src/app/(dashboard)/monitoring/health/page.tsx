'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Loader2,
  Clock,
  Server,
  Database,
  Bot,
  Filter,
  BarChart3,
  Shield,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRunHealthCheck,
  useHealthStatus,
  useHealthHistory,
  useServiceUptime,
} from '@/hooks/monitoring/use-system-health';
import type { ServiceHealth, HealthHistoryItem, UptimeItem } from '@/lib/api/system-health';

// ============================================================================
// Constants
// ============================================================================

const STATUS_CONFIG = {
  healthy: {
    label: 'Healthy',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    dot: 'bg-green-500',
    icon: CheckCircle2,
    bannerBg: 'bg-green-500/5 border-green-500/20',
  },
  degraded: {
    label: 'Degraded',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    dot: 'bg-yellow-500',
    icon: AlertTriangle,
    bannerBg: 'bg-yellow-500/5 border-yellow-500/20',
  },
  down: {
    label: 'Down',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    dot: 'bg-red-500',
    icon: XCircle,
    bannerBg: 'bg-red-500/5 border-red-500/20',
  },
  unknown: {
    label: 'Unknown',
    color: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground',
    icon: HelpCircle,
    bannerBg: 'bg-muted/50 border-border',
  },
} as const;

const SERVICE_CONFIG: Record<string, { label: string; icon: typeof Database }> = {
  database: { label: 'Database', icon: Database },
  backend_api: { label: 'Backend API', icon: Server },
  agent_runtime: { label: 'Agent Runtime', icon: Bot },
};

// ============================================================================
// Overall Status Banner
// ============================================================================

function OverallStatusBanner({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <div className={cn('rounded-xl border p-4 flex items-center gap-3', config.bannerBg)}>
      <Icon className="h-6 w-6 shrink-0" />
      <div>
        <p className="text-sm font-medium">System Status</p>
        <p className="text-xs text-muted-foreground">
          {status === 'healthy' && 'All systems operational'}
          {status === 'degraded' && 'Some services are experiencing issues'}
          {status === 'down' && 'One or more services are down'}
          {status === 'unknown' && 'Run a health check to see current status'}
        </p>
      </div>
      <span
        className={cn(
          'ml-auto text-xs px-2.5 py-1 rounded-full font-medium border',
          config.color
        )}
      >
        {config.label}
      </span>
    </div>
  );
}

// ============================================================================
// Service Card
// ============================================================================

function ServiceCard({
  service,
  uptime,
}: {
  service?: ServiceHealth;
  uptime?: UptimeItem;
}) {
  const name = service?.service_name ?? uptime?.service_name ?? 'unknown';
  const svcConfig = SERVICE_CONFIG[name] ?? { label: name, icon: Server };
  const Icon = svcConfig.icon;
  const status = (service?.status ?? 'unknown') as keyof typeof STATUS_CONFIG;
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const StatusIcon = statusConfig.icon;

  const checkedAt = service?.checked_at
    ? new Date(service.checked_at).toLocaleTimeString()
    : '--';

  const uptimePct = uptime?.uptime_percentage ?? null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted">
            <Icon className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <span className="font-medium text-sm">{svcConfig.label}</span>
        </div>
        <StatusIcon className={cn('h-5 w-5', status === 'healthy' ? 'text-green-500' : status === 'degraded' ? 'text-yellow-500' : status === 'down' ? 'text-red-500' : 'text-muted-foreground')} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground mb-0.5">Status</p>
          <span
            className={cn(
              'inline-block px-2 py-0.5 rounded-full font-medium border',
              statusConfig.color
            )}
          >
            {statusConfig.label}
          </span>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Response</p>
          <p className="font-medium tabular-nums">
            {service?.response_time_ms != null ? `${service.response_time_ms}ms` : '--'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Last Check</p>
          <p className="font-medium tabular-nums">{checkedAt}</p>
        </div>
      </div>

      {uptimePct !== null && (
        <div className="mt-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">30-day uptime</span>
            <span className="font-medium tabular-nums">{uptimePct}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                uptimePct >= 99 ? 'bg-green-500' : uptimePct >= 95 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${Math.min(uptimePct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Response Time Chart (simplified bar chart)
// ============================================================================

function ResponseTimeChart({ history }: { history: HealthHistoryItem[] }) {
  // Group by service, get last 50 entries per service
  const grouped = useMemo(() => {
    const map = new Map<string, HealthHistoryItem[]>();
    for (const item of history) {
      if (!map.has(item.service_name)) map.set(item.service_name, []);
      map.get(item.service_name)!.push(item);
    }
    // Limit and sort chronologically
    for (const [key, items] of map) {
      map.set(key, items.slice(0, 50).reverse());
    }
    return map;
  }, [history]);

  if (grouped.size === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Response Times (24h)
        </h3>
        <p className="text-xs text-muted-foreground">No history data yet. Run a health check to start collecting data.</p>
      </div>
    );
  }

  const SERVICE_COLORS: Record<string, string> = {
    database: 'bg-blue-500',
    backend_api: 'bg-purple-500',
    agent_runtime: 'bg-emerald-500',
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        Response Times (24h)
      </h3>

      <div className="flex items-center gap-4 mb-3 flex-wrap">
        {Array.from(grouped.keys()).map((svc) => (
          <div key={svc} className="flex items-center gap-1.5 text-xs">
            <div className={cn('h-2.5 w-2.5 rounded-full', SERVICE_COLORS[svc] ?? 'bg-gray-500')} />
            <span className="text-muted-foreground">{SERVICE_CONFIG[svc]?.label ?? svc}</span>
          </div>
        ))}
      </div>

      {Array.from(grouped.entries()).map(([svc, items]) => {
        const maxMs = Math.max(...items.map((i) => i.response_time_ms ?? 0), 1);
        return (
          <div key={svc} className="mb-3 last:mb-0">
            <p className="text-xs text-muted-foreground mb-1">{SERVICE_CONFIG[svc]?.label ?? svc}</p>
            <div className="flex items-end gap-0.5 h-12">
              {items.map((item, idx) => {
                const ms = item.response_time_ms ?? 0;
                const height = Math.max((ms / maxMs) * 100, 4);
                return (
                  <div
                    key={item.id ?? idx}
                    className={cn(
                      'flex-1 rounded-t-sm transition-all min-w-[2px]',
                      item.status === 'down'
                        ? 'bg-red-500'
                        : item.status === 'degraded'
                          ? 'bg-yellow-500'
                          : (SERVICE_COLORS[svc] ?? 'bg-gray-500')
                    )}
                    style={{ height: `${height}%` }}
                    title={`${ms}ms - ${item.status} at ${item.checked_at}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>{items[0]?.checked_at ? new Date(items[0].checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              <span>{items[items.length - 1]?.checked_at ? new Date(items[items.length - 1].checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Uptime Bars
// ============================================================================

function UptimeBars({ uptimes }: { uptimes: UptimeItem[] }) {
  if (uptimes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          30-Day Uptime
        </h3>
        <p className="text-xs text-muted-foreground">No uptime data yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        30-Day Uptime
      </h3>
      <div className="space-y-3">
        {uptimes.map((u) => {
          const pct = u.uptime_percentage;
          return (
            <div key={u.service_name}>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium">
                  {SERVICE_CONFIG[u.service_name]?.label ?? u.service_name}
                </span>
                <span className="tabular-nums font-medium">
                  {pct}%
                  <span className="text-muted-foreground ml-1">
                    ({u.healthy_checks}/{u.total_checks})
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    pct >= 99.5
                      ? 'bg-green-500'
                      : pct >= 95
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// History Log
// ============================================================================

function HistoryLog({ history, serviceFilter, onServiceFilterChange }: {
  history: HealthHistoryItem[];
  serviceFilter: string;
  onServiceFilterChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground" />
          Health History Log
        </h3>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={serviceFilter}
            onChange={(e) => onServiceFilterChange(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Services</option>
            <option value="database">Database</option>
            <option value="backend_api">Backend API</option>
            <option value="agent_runtime">Agent Runtime</option>
          </select>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No history entries yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {history.slice(0, 100).map((item) => {
            const statusCfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unknown;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 text-xs"
              >
                <span className="text-muted-foreground tabular-nums w-[140px] shrink-0">
                  {new Date(item.checked_at).toLocaleString()}
                </span>
                <span className="w-[100px] shrink-0 font-medium">
                  {SERVICE_CONFIG[item.service_name]?.label ?? item.service_name}
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full font-medium border w-[80px] text-center shrink-0',
                    statusCfg.color
                  )}
                >
                  {statusCfg.label}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {item.response_time_ms != null ? `${item.response_time_ms}ms` : '--'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function SystemHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [serviceFilter, setServiceFilter] = useState('');

  const { data: statusData, isLoading: statusLoading } = useHealthStatus({
    refetchInterval: autoRefresh ? 60_000 : undefined,
  });
  const { data: historyData, isLoading: historyLoading } = useHealthHistory(
    serviceFilter || undefined,
    24
  );
  const { data: uptimeData, isLoading: uptimeLoading } = useServiceUptime();
  const healthCheckMutation = useRunHealthCheck();

  const handleRunCheck = useCallback(() => {
    healthCheckMutation.mutate();
  }, [healthCheckMutation]);

  const services = statusData?.services ?? [];
  const overallStatus = statusData?.overall_status ?? 'unknown';
  const history = historyData?.history ?? [];
  const uptimes = uptimeData?.uptimes ?? [];

  // Map uptimes by service for service cards
  const uptimeMap = useMemo(() => {
    const map: Record<string, UptimeItem> = {};
    for (const u of uptimes) {
      map[u.service_name] = u;
    }
    return map;
  }, [uptimes]);

  // Ensure all three service cards show even if no data yet
  const serviceNames = ['database', 'backend_api', 'agent_runtime'];
  const serviceMap = useMemo(() => {
    const map: Record<string, ServiceHealth> = {};
    for (const s of services) {
      map[s.service_name] = s;
    }
    return map;
  }, [services]);

  return (
    <div className="container mx-auto max-w-6xl py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor the health of core platform services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-input"
            />
            Auto-refresh (60s)
          </label>
          <button
            onClick={handleRunCheck}
            disabled={healthCheckMutation.isPending}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:pointer-events-none transition-colors'
            )}
          >
            {healthCheckMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Run Health Check
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      <OverallStatusBanner status={overallStatus} />

      {/* Service cards */}
      {statusLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="h-9 w-24 bg-muted rounded mb-3" />
              <div className="h-4 w-32 bg-muted rounded mb-2" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {serviceNames.map((svcName) => (
            <ServiceCard
              key={svcName}
              service={serviceMap[svcName]}
              uptime={uptimeMap[svcName]}
            />
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {historyLoading ? (
          <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
            <div className="h-4 w-40 bg-muted rounded mb-3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        ) : (
          <ResponseTimeChart history={history} />
        )}

        {uptimeLoading ? (
          <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
            <div className="h-4 w-32 bg-muted rounded mb-3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        ) : (
          <UptimeBars uptimes={uptimes} />
        )}
      </div>

      {/* History log */}
      {historyLoading ? (
        <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
          <div className="h-4 w-36 bg-muted rounded mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted rounded" />
            ))}
          </div>
        </div>
      ) : (
        <HistoryLog
          history={history}
          serviceFilter={serviceFilter}
          onServiceFilterChange={setServiceFilter}
        />
      )}
    </div>
  );
}
