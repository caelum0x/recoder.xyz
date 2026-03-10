'use client';

import React, { useMemo } from 'react';
import { Activity, Zap, Timer, DollarSign, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { useMetricsOverview } from '@/hooks/agents/use-agent-metrics';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Label,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// ---- Types ----

interface MetricsOverviewTabProps {
  agentId: string;
}

// ---- Chart Configs ----

const runsChartConfig = {
  successes: {
    label: 'Successes',
    color: 'hsl(142 71% 45%)',
  },
  failures: {
    label: 'Failures',
    color: 'hsl(0 84% 60%)',
  },
} satisfies ChartConfig;

const donutChartConfig = {
  success: {
    label: 'Success',
    color: 'hsl(142 71% 45%)',
  },
  failure: {
    label: 'Failure',
    color: 'hsl(0 84% 60%)',
  },
} satisfies ChartConfig;

// ---- Helpers ----

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return '$0.00';
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

// ---- Component ----

export function MetricsOverviewTab({ agentId }: MetricsOverviewTabProps) {
  const { data, isLoading, error } = useMetricsOverview(agentId);

  const chartData = useMemo(() => {
    if (!data?.runs_by_day) return [];
    return data.runs_by_day.map((d) => ({
      date: format(parseISO(d.date), 'MMM d'),
      successes: d.successes,
      failures: d.failures,
      total: d.runs,
    }));
  }, [data]);

  const donutData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Success', value: data.successful_runs, fill: 'hsl(142 71% 45%)' },
      { name: 'Failure', value: data.failed_runs, fill: 'hsl(0 84% 60%)' },
    ].filter((d) => d.value > 0);
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[310px] rounded-xl" />
          <Skeleton className="h-[310px] rounded-xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load metrics</h4>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {(error as Error).message || 'An unexpected error occurred.'}
        </p>
      </div>
    );
  }

  // Empty state
  if (!data || data.total_runs === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
          <Activity className="h-6 w-6 text-muted-foreground" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-2">No metrics yet</h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Metrics will appear here once this agent starts processing runs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={Activity}
          label="Total Runs"
          value={formatNumber(data.total_runs)}
        />
        <SummaryCard
          icon={Zap}
          label="Success Rate"
          value={`${data.success_rate.toFixed(1)}%`}
          valueColor={
            data.success_rate >= 95
              ? 'text-emerald-500'
              : data.success_rate >= 80
                ? 'text-amber-500'
                : 'text-red-500'
          }
        />
        <SummaryCard
          icon={Timer}
          label="Avg Latency"
          value={formatLatency(data.avg_latency_ms)}
        />
        <SummaryCard
          icon={DollarSign}
          label="Total Cost"
          value={formatCost(data.total_cost)}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Runs Over Time */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Runs Over Time
            </h3>
            {chartData.length > 0 ? (
              <ChartContainer config={runsChartConfig} className="h-[250px] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={35}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const label = name === 'successes' ? 'Successes' : 'Failures';
                          return [String(value), label];
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    type="monotone"
                    dataKey="successes"
                    stroke="var(--color-successes)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="failures"
                    stroke="var(--color-failures)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No daily data available
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* Success/Failure Donut */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Success / Failure
            </h3>
            {donutData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ChartContainer config={donutChartConfig} className="h-[200px] w-full">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  className="fill-foreground text-2xl font-bold"
                                >
                                  {data.success_rate.toFixed(0)}%
                                </tspan>
                              </text>
                            );
                          }
                          return null;
                        }}
                      />
                    </Pie>
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value, name) => {
                        const total = data.total_runs;
                        const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0';
                        return [`${value} (${pct}%)`, name];
                      }}
                    />
                  </PieChart>
                </ChartContainer>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs text-muted-foreground">
                      Success ({data.successful_runs})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-xs text-muted-foreground">
                      Failed ({data.failed_runs})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}

// ---- Sub Components ----

function SummaryCard({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <SpotlightCard className="bg-card border border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className={cn('text-xl font-semibold tabular-nums', valueColor || 'text-foreground')}>
          {value}
        </span>
      </div>
    </SpotlightCard>
  );
}
