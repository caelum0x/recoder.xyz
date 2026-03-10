'use client';

import { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Gauge,
  Shield,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import {
  useRateLimitUsage,
  useRateLimitHistory,
  useRateLimitViolations,
  useTopEndpoints,
} from '@/hooks/developers/use-rate-limits';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Usage gauge component
// ---------------------------------------------------------------------------

function UsageGauge({
  label,
  current,
  max,
  pct,
}: {
  label: string;
  current: number;
  max: number;
  pct: number;
}) {
  const color =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
  const textColor =
    pct >= 90
      ? 'text-red-600'
      : pct >= 70
        ? 'text-amber-600'
        : 'text-green-600';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium', textColor)}>
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="text-right text-[10px] text-muted-foreground">
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Method badge
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-600',
  POST: 'bg-green-500/10 text-green-600',
  PUT: 'bg-amber-500/10 text-amber-600',
  PATCH: 'bg-purple-500/10 text-purple-600',
  DELETE: 'bg-red-500/10 text-red-600',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase',
        METHOD_COLORS[method] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RateLimitsPage() {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const { data: usage, isLoading: usageLoading } = useRateLimitUsage();
  const { data: history, isLoading: historyLoading } = useRateLimitHistory(
    selectedKey,
    24,
  );
  const { data: violations, isLoading: violationsLoading } =
    useRateLimitViolations(selectedKey);
  const { data: topEndpoints, isLoading: endpointsLoading } =
    useTopEndpoints(selectedKey);

  const keys = usage?.keys ?? [];

  // Chart data
  const chartData = useMemo(() => {
    if (!history?.buckets) return [];
    return history.buckets.map((b) => ({
      hour: new Date(b.hour).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      requests: b.request_count,
      rate_limited: b.rate_limited_count,
    }));
  }, [history]);

  const isLoading =
    usageLoading || historyLoading || violationsLoading || endpointsLoading;

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Rate Limit Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor API usage, rate limits, and violations across your keys.
          </p>
        </div>

        {/* Key selector */}
        <select
          value={selectedKey ?? ''}
          onChange={(e) =>
            setSelectedKey(e.target.value || undefined)
          }
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All Keys</option>
          {keys.map((k) => (
            <option key={k.key_id} value={k.key_id}>
              {k.key_id.length > 16
                ? `${k.key_id.slice(0, 8)}...${k.key_id.slice(-8)}`
                : k.key_id}
            </option>
          ))}
        </select>
      </div>

      {/* Usage gauges */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          Per-Key Usage
        </h2>

        {usageLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3"
              >
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No API keys with rate limit permissions configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(selectedKey
              ? keys.filter((k) => k.key_id === selectedKey)
              : keys
            ).map((k) => (
              <div
                key={k.key_id}
                className={cn(
                  'rounded-xl border bg-card p-4 space-y-3 transition-colors cursor-pointer',
                  selectedKey === k.key_id
                    ? 'border-primary ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() =>
                  setSelectedKey(
                    selectedKey === k.key_id ? undefined : k.key_id,
                  )
                }
              >
                <div className="text-xs font-mono text-muted-foreground truncate">
                  {k.key_id}
                </div>
                <UsageGauge
                  label="Requests / minute"
                  current={k.requests_current_minute}
                  max={k.rate_limit_per_minute}
                  pct={k.minute_usage_pct}
                />
                <UsageGauge
                  label="Requests / day"
                  current={k.requests_current_day}
                  max={k.rate_limit_per_day}
                  pct={k.day_usage_pct}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Request volume chart */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Hourly Request Volume (Last 24h)
        </h2>

        <div className="rounded-xl border border-border bg-card p-4">
          {historyLoading ? (
            <div className="h-64 animate-pulse bg-muted rounded" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              No request data available for the selected period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="requests"
                  name="Requests"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="rate_limited"
                  name="Rate Limited"
                  fill="hsl(0 84% 60%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
          {history && (
            <div className="mt-2 text-xs text-muted-foreground text-right">
              Total requests: {history.total_requests.toLocaleString()}
            </div>
          )}
        </div>
      </section>

      {/* Two-column layout: violations + top endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violations */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Rate Limit Violations
            {violations && violations.total > 0 && (
              <span className="ml-1.5 text-xs text-red-500 font-normal">
                ({violations.total})
              </span>
            )}
          </h2>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {violationsLoading ? (
              <div className="p-4 space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : !violations || violations.violations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No rate limit violations detected.
              </div>
            ) : (
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {violations.violations.map((v) => (
                  <div
                    key={v.id}
                    className="px-4 py-2.5 flex items-center gap-3 text-sm"
                  >
                    <MethodBadge method={v.method} />
                    <span className="flex-1 font-mono text-xs text-foreground truncate">
                      {v.endpoint}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(v.request_timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Top Endpoints */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Top Endpoints
          </h2>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {endpointsLoading ? (
              <div className="p-4 space-y-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : !topEndpoints || topEndpoints.endpoints.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No endpoint data available.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Endpoint</th>
                    <th className="px-4 py-2 font-medium">Method</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Requests
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Limited
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border max-h-80 overflow-y-auto">
                  {topEndpoints.endpoints.map((ep, idx) => (
                    <tr key={idx} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]">
                        {ep.endpoint}
                      </td>
                      <td className="px-4 py-2">
                        <MethodBadge method={ep.method} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {ep.request_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {ep.rate_limited_count > 0 ? (
                          <span className="text-red-500">
                            {ep.rate_limited_count.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
