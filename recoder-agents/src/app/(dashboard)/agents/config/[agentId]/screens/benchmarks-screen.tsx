'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Zap,
  Activity,
  RefreshCw,
  Trophy,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useAgentBenchmarks,
  useGenerateBenchmark,
  useBenchmarkComparison,
  type AgentBenchmark,
} from '@/hooks/agents/use-agent-benchmarks';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarksScreenProps {
  agentId: string;
}

type Period = '7d' | '14d' | '30d';

const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '14d', label: '14 days' },
  { id: '30d', label: '30 days' },
];

// ---------------------------------------------------------------------------
// Chart Config
// ---------------------------------------------------------------------------

const comparisonChartConfig: ChartConfig = {
  avg_latency_ms: {
    label: 'Avg Latency (ms)',
    color: 'hsl(221 83% 53%)',
  },
  success_rate: {
    label: 'Success Rate (%)',
    color: 'hsl(142 71% 45%)',
  },
  avg_cost: {
    label: 'Avg Cost ($)',
    color: 'hsl(38 92% 50%)',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BenchmarksScreen({ agentId }: BenchmarksScreenProps) {
  const [period, setPeriod] = useState<Period>('7d');

  const { data: benchmarksData, isLoading: benchmarksLoading } = useAgentBenchmarks(agentId);
  const { data: comparisonData, isLoading: comparisonLoading } = useBenchmarkComparison(agentId);
  const generateMutation = useGenerateBenchmark();

  const benchmarks = benchmarksData?.benchmarks ?? [];
  const latestBenchmark = benchmarks[0] ?? null;

  // Model comparison chart data
  const comparisonChartData = useMemo(() => {
    if (!comparisonData?.models) return [];
    return comparisonData.models.map((m) => ({
      model: m.model,
      avg_latency_ms: m.avg_latency_ms ?? 0,
      success_rate: m.success_rate ? Number(m.success_rate) : 0,
      avg_cost: m.avg_cost ? Number(m.avg_cost) * 1000 : 0, // scale for visibility
    }));
  }, [comparisonData]);

  const handleGenerate = () => {
    generateMutation.mutate({ agentId, period });
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (benchmarksLoading) {
    return (
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-6 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </ScrollArea>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScrollArea className="flex-1 overflow-y-auto">
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Performance Benchmarks</h2>
            <p className="text-sm text-muted-foreground">
              Track and compare agent performance across models and time periods.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex rounded-lg border bg-muted/30 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    period === p.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              size="sm"
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', generateMutation.isPending && 'animate-spin')} />
              Generate
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            icon={Clock}
            label="Avg Latency"
            value={latestBenchmark?.avg_latency_ms != null ? `${latestBenchmark.avg_latency_ms.toLocaleString()}ms` : '--'}
            sub={latestBenchmark?.p95_latency_ms != null ? `P95: ${latestBenchmark.p95_latency_ms.toLocaleString()}ms` : undefined}
            color="blue"
          />
          <SummaryCard
            icon={TrendingUp}
            label="Success Rate"
            value={latestBenchmark?.success_rate != null ? `${Number(latestBenchmark.success_rate).toFixed(1)}%` : '--'}
            color="green"
          />
          <SummaryCard
            icon={DollarSign}
            label="Avg Cost/Run"
            value={latestBenchmark?.avg_cost != null ? `$${Number(latestBenchmark.avg_cost).toFixed(4)}` : '--'}
            color="amber"
          />
          <SummaryCard
            icon={Activity}
            label="Total Runs"
            value={latestBenchmark?.total_runs != null ? latestBenchmark.total_runs.toLocaleString() : '--'}
            sub={latestBenchmark?.model ?? undefined}
            color="purple"
          />
        </div>

        {/* Model Comparison Chart */}
        <SpotlightCard className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Model Comparison</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Average metrics per model across all benchmarks
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {comparisonData?.models?.length ?? 0} models
            </Badge>
          </div>

          {comparisonLoading ? (
            <Skeleton className="h-56 rounded-lg" />
          ) : comparisonChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No model comparison data yet.</p>
              <p className="text-xs mt-1">Generate benchmarks to see model comparisons.</p>
            </div>
          ) : (
            <ChartContainer config={comparisonChartConfig} className="h-56 w-full">
              <BarChart data={comparisonChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="model" type="category" width={120} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="success_rate" fill="hsl(142 71% 45%)" radius={[0, 4, 4, 0]} name="Success Rate (%)" />
              </BarChart>
            </ChartContainer>
          )}
        </SpotlightCard>

        {/* Benchmark History Table */}
        <SpotlightCard className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Benchmark History</h3>
            <Badge variant="outline" className="text-xs">
              {benchmarks.length} records
            </Badge>
          </div>

          {benchmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Trophy className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No benchmarks generated yet.</p>
              <p className="text-xs mt-1">Click &quot;Generate&quot; to create your first benchmark.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Name</th>
                    <th className="text-left py-2 pr-4 font-medium">Model</th>
                    <th className="text-right py-2 pr-4 font-medium">Latency</th>
                    <th className="text-right py-2 pr-4 font-medium">Success</th>
                    <th className="text-right py-2 pr-4 font-medium">Cost</th>
                    <th className="text-right py-2 pr-4 font-medium">Runs</th>
                    <th className="text-right py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b) => (
                    <BenchmarkRow key={b.id} benchmark={b} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SpotlightCard>
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorClasses = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  };

  return (
    <SpotlightCard className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </SpotlightCard>
  );
}

function BenchmarkRow({ benchmark }: { benchmark: AgentBenchmark }) {
  return (
    <tr className="border-b border-muted/50 hover:bg-muted/20 transition-colors">
      <td className="py-2.5 pr-4">
        <span className="font-medium text-foreground truncate block max-w-[200px]">
          {benchmark.benchmark_name}
        </span>
      </td>
      <td className="py-2.5 pr-4">
        <Badge variant="secondary" className="text-xs font-normal">
          {benchmark.model ?? 'unknown'}
        </Badge>
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {benchmark.avg_latency_ms != null ? `${benchmark.avg_latency_ms.toLocaleString()}ms` : '--'}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {benchmark.success_rate != null ? (
          <span className={cn(
            Number(benchmark.success_rate) >= 90 ? 'text-green-500' :
            Number(benchmark.success_rate) >= 70 ? 'text-amber-500' : 'text-red-500'
          )}>
            {Number(benchmark.success_rate).toFixed(1)}%
          </span>
        ) : '--'}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {benchmark.avg_cost != null ? `$${Number(benchmark.avg_cost).toFixed(4)}` : '--'}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {benchmark.total_runs}
      </td>
      <td className="py-2.5 text-right text-muted-foreground">
        {benchmark.created_at
          ? formatDistanceToNow(new Date(benchmark.created_at), { addSuffix: true })
          : '--'}
      </td>
    </tr>
  );
}
