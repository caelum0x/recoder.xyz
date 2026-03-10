'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Key,
  Zap,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useUsageSummary,
  useKeyUsage,
  useKeyRecentUsage,
} from '@/hooks/platform/use-api-usage';
import type { DailyUsageStats, RecentRequest } from '@/lib/api/api-usage';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function StatusBadge({ code }: { code: number }) {
  if (code >= 200 && code < 300) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        {code}
      </Badge>
    );
  }
  if (code >= 400 && code < 500) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      >
        {code}
      </Badge>
    );
  }
  if (code >= 500) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400"
      >
        {code}
      </Badge>
    );
  }
  return <Badge variant="outline">{code}</Badge>;
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-key expandable section
// ---------------------------------------------------------------------------

function KeyUsageSection({ keyId }: { keyId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: dailyStats, isLoading: dailyLoading } = useKeyUsage(
    expanded ? keyId : '',
    30,
  );
  const { data: recentRequests, isLoading: recentLoading } = useKeyRecentUsage(
    expanded ? keyId : '',
  );

  const chartData = (dailyStats ?? []).map((d: DailyUsageStats) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    requests: d.request_count,
    errors: d.error_count,
  }));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">{keyId.slice(0, 12)}...{keyId.slice(-4)}</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          Key
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-6">
          {/* Daily chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Daily Requests (30 days)</h4>
            {dailyLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No daily data available for this key.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                  <Line
                    type="monotone"
                    dataKey="requests"
                    name="Requests"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="errors"
                    name="Errors"
                    stroke="hsl(0, 84%, 60%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent requests table */}
          <div>
            <h4 className="text-sm font-medium mb-3">Recent Requests</h4>
            {recentLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !recentRequests || recentRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No recent requests for this key.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Endpoint</th>
                      <th className="pb-2 pr-4 font-medium">Method</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium text-right">Response</th>
                      <th className="pb-2 pr-4 font-medium text-right">Tokens</th>
                      <th className="pb-2 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRequests.map((req: RecentRequest, idx: number) => (
                      <tr
                        key={idx}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2 pr-4 font-mono text-xs truncate max-w-[200px]">
                          {req.endpoint}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs font-mono">
                            {req.method}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <StatusBadge code={req.status_code} />
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {req.response_time_ms}ms
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {req.tokens_used.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-muted-foreground text-xs">
                          {new Date(req.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ApiUsagePage() {
  const { data: summary, isLoading: summaryLoading } = useUsageSummary();

  // We derive the list of active key IDs from the summary.
  // Since the summary only gives us the count, we also fetch recent usage
  // for each key to build the key list. We use a dedicated query to list keys.
  const [keyIds] = useState<string[]>([]);

  // For now, we'll also fetch the "all keys" list from the summary endpoint.
  // The expandable sections are driven by a simple state-managed list.
  // Users can manually add key IDs or we auto-discover from the API.
  const [inputKeyId, setInputKeyId] = useState('');

  const handleAddKey = () => {
    const trimmed = inputKeyId.trim();
    if (trimmed && !keyIds.includes(trimmed)) {
      keyIds.push(trimmed);
      setInputKeyId('');
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Usage</h1>
        <p className="text-muted-foreground mt-1">
          Monitor request volume, error rates, and latency across your API keys.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))
        ) : (
          <>
            <SummaryCard
              label="Total Requests (30d)"
              value={summary?.total_requests?.toLocaleString() ?? '0'}
              icon={Activity}
            />
            <SummaryCard
              label="Error Rate"
              value={summary?.error_rate ?? 0}
              icon={AlertTriangle}
              suffix="%"
            />
            <SummaryCard
              label="Avg Response Time"
              value={summary?.avg_response_time ?? 0}
              icon={Clock}
              suffix="ms"
            />
            <SummaryCard
              label="Active Keys"
              value={summary?.active_keys ?? 0}
              icon={Key}
            />
          </>
        )}
      </div>

      {/* Additional stats row */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            label="Total Tokens (30d)"
            value={summary.total_tokens.toLocaleString()}
            icon={Zap}
          />
          <SummaryCard
            label="Total Errors (30d)"
            value={summary.total_errors.toLocaleString()}
            icon={AlertTriangle}
          />
        </div>
      )}

      {/* Per-key sections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Per-Key Analytics
          </h2>
        </div>

        {/* Key ID input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={inputKeyId}
            onChange={(e) => setInputKeyId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddKey();
            }}
            placeholder="Paste an API key ID to inspect its usage..."
            className={cn(
              'flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
          />
          <button
            onClick={handleAddKey}
            disabled={!inputKeyId.trim()}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            Inspect
          </button>
        </div>

        {keyIds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
            <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-medium text-foreground">No API usage data yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              API usage will appear here when your keys are used. Paste an API key ID above
              to inspect its usage metrics.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {keyIds.map((id) => (
              <KeyUsageSection key={id} keyId={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
