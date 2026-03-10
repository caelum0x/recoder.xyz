'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  MessageSquare,
  Cpu,
  DollarSign,
  Wrench,
  ArrowUpDown,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useThreadsAnalyticsOverview,
  useTopThreads,
} from '@/hooks/threads/use-thread-analytics';
import { useRouter } from 'next/navigation';

type SortMetric = 'total_messages' | 'total_cost' | 'total_tokens_in' | 'duration_seconds' | 'tool_call_count';

const METRIC_LABELS: Record<SortMetric, string> = {
  total_messages: 'Messages',
  total_cost: 'Cost',
  total_tokens_in: 'Tokens',
  duration_seconds: 'Duration',
  tool_call_count: 'Tool Calls',
};

const METRIC_ICONS: Record<SortMetric, React.ElementType> = {
  total_messages: MessageSquare,
  total_cost: DollarSign,
  total_tokens_in: Cpu,
  duration_seconds: Clock,
  tool_call_count: Wrench,
};

function OverviewStatCard({
  icon: Icon,
  label,
  value,
  subLabel,
  subValue,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subLabel?: string;
  subValue?: string;
  colorClass?: string;
}) {
  return (
    <SpotlightCard className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn('p-2.5 rounded-lg bg-muted', colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
          {subLabel && subValue && (
            <p className="text-xs text-muted-foreground mt-1">
              {subLabel}: <span className="font-medium">{subValue}</span>
            </p>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
}

function BreakdownSection({
  title,
  data,
  colorClass,
}: {
  title: string;
  data: Record<string, number>;
  colorClass: string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(([, v]) => v));

  return (
    <SpotlightCard className="p-4">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <div className="space-y-2">
        {entries.slice(0, 10).map(([name, count]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-32 truncate" title={name}>
              {name}
            </span>
            <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', colorClass)}
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-10 text-right">
              {count}
            </span>
          </div>
        ))}
      </div>
    </SpotlightCard>
  );
}

export default function ThreadAnalyticsPage() {
  const router = useRouter();
  const [metric, setMetric] = useState<SortMetric>('total_messages');

  const { data: overview, isLoading: overviewLoading } = useThreadsAnalyticsOverview();
  const { data: topThreads, isLoading: topLoading } = useTopThreads(metric, 15);

  const formatValue = (value: number, metric: SortMetric): string => {
    switch (metric) {
      case 'total_cost':
        return `$${value.toFixed(4)}`;
      case 'duration_seconds': {
        if (value < 60) return `${value}s`;
        if (value < 3600) return `${Math.floor(value / 60)}m`;
        return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
      }
      case 'total_tokens_in':
        return value.toLocaleString();
      default:
        return String(value);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Thread Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Aggregate analytics across all your threads
            </p>
          </div>
        </div>

        {/* Overview Stats */}
        {overviewLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : overview ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <OverviewStatCard
              icon={MessageSquare}
              label="Total Threads"
              value={overview.total_threads}
              subLabel="Avg messages"
              subValue={String(overview.avg_messages_per_thread)}
              colorClass="text-blue-500"
            />
            <OverviewStatCard
              icon={TrendingUp}
              label="Total Messages"
              value={overview.total_messages.toLocaleString()}
              colorClass="text-green-500"
            />
            <OverviewStatCard
              icon={Cpu}
              label="Total Tokens"
              value={(overview.total_tokens_in + overview.total_tokens_out).toLocaleString()}
              subLabel="In/Out"
              subValue={`${overview.total_tokens_in.toLocaleString()} / ${overview.total_tokens_out.toLocaleString()}`}
              colorClass="text-purple-500"
            />
            <OverviewStatCard
              icon={DollarSign}
              label="Total Cost"
              value={`$${overview.total_cost.toFixed(2)}`}
              subLabel="Avg per thread"
              subValue={`$${overview.avg_cost_per_thread.toFixed(4)}`}
              colorClass="text-emerald-500"
            />
          </div>
        ) : (
          <SpotlightCard className="p-8 text-center mb-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No analytics data available yet</p>
          </SpotlightCard>
        )}

        {/* Breakdowns */}
        {overview && (Object.keys(overview.top_tools).length > 0 || Object.keys(overview.top_models).length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <BreakdownSection
              title="Top Tools"
              data={overview.top_tools}
              colorClass="bg-amber-500"
            />
            <BreakdownSection
              title="Top Models"
              data={overview.top_models}
              colorClass="bg-indigo-500"
            />
          </div>
        )}

        {/* Top Threads Table */}
        <SpotlightCard className="p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-medium">Top Threads</h3>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              {(Object.keys(METRIC_LABELS) as SortMetric[]).map((m) => {
                const MIcon = METRIC_ICONS[m];
                return (
                  <Button
                    key={m}
                    variant={metric === m ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setMetric(m)}
                  >
                    <MIcon className="h-3 w-3" />
                    {METRIC_LABELS[m]}
                  </Button>
                );
              })}
            </div>
          </div>

          {topLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : topThreads && topThreads.threads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 text-xs text-muted-foreground font-medium">#</th>
                    <th className="pb-2 text-xs text-muted-foreground font-medium">Thread</th>
                    <th className="pb-2 text-xs text-muted-foreground font-medium text-right">
                      {METRIC_LABELS[metric]}
                    </th>
                    <th className="pb-2 text-xs text-muted-foreground font-medium text-right">Messages</th>
                    <th className="pb-2 text-xs text-muted-foreground font-medium text-right">Cost</th>
                    <th className="pb-2 text-xs text-muted-foreground font-medium text-right hidden sm:table-cell">
                      Last Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topThreads.threads.map((thread, idx) => (
                    <tr
                      key={thread.thread_id}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => router.push(`/dashboard?thread=${thread.thread_id}`)}
                    >
                      <td className="py-2.5 text-xs text-muted-foreground w-8">{idx + 1}</td>
                      <td className="py-2.5">
                        <span className="text-sm font-medium truncate block max-w-[200px]">
                          {thread.thread_name || thread.thread_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge variant="secondary" className="text-xs font-mono">
                          {formatValue(thread.value, metric)}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground">
                        {thread.total_messages}
                      </td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground">
                        ${thread.total_cost.toFixed(4)}
                      </td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground hidden sm:table-cell">
                        {thread.last_message_at
                          ? format(parseISO(thread.last_message_at), 'MMM d, HH:mm')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">
                No thread analytics data yet. Analytics are computed when threads are active.
              </p>
            </div>
          )}
        </SpotlightCard>
      </div>
    </div>
  );
}
