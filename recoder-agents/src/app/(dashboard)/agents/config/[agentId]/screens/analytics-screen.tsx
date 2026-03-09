'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Zap,
  DollarSign,
  Download,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, subDays, subHours, parseISO } from 'date-fns';
import { toast } from '@/lib/toast';
import { useQuery } from '@tanstack/react-query';
import {
  getAgentAnalytics,
  getAgentAnalyticsDaily,
  exportAgentAnalytics,
  type AnalyticsMetrics,
  type DailyAnalytics,
} from '@/lib/api/agent-analytics';
import { ModelPerformanceTab } from './model-performance-tab';
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';

// ---- Types ----

interface AnalyticsScreenProps {
  agentId: string;
}

type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all';

const TIME_RANGES: { id: TimeRange; label: string; days: number }[] = [
  { id: '24h', label: '24h', days: 1 },
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: 365 },
];

// ---- Chart Configs ----

const runsChartConfig = {
  runs: {
    label: 'Runs',
    color: 'hsl(221 83% 53%)',
  },
  cost: {
    label: 'Cost ($)',
    color: 'hsl(142 71% 45%)',
  },
} satisfies ChartConfig;

const modelChartConfig = {
  usage: {
    label: 'Usage',
    color: 'hsl(221 83% 53%)',
  },
} satisfies ChartConfig;

const toolChartConfig = {
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

function getTrend(current: number, previous: number | undefined): { direction: 'up' | 'down' | 'flat'; percent: number } {
  if (previous === undefined || previous === 0) {
    return current > 0 ? { direction: 'up', percent: 100 } : { direction: 'flat', percent: 0 };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return { direction: 'flat', percent: 0 };
  return { direction: change > 0 ? 'up' : 'down', percent: Math.abs(change) };
}

function getDateRange(range: TimeRange): { fromDate: string; toDate: string } {
  const now = new Date();
  const toDate = format(now, 'yyyy-MM-dd');
  let from: Date;

  switch (range) {
    case '24h':
      from = subHours(now, 24);
      break;
    case '7d':
      from = subDays(now, 7);
      break;
    case '30d':
      from = subDays(now, 30);
      break;
    case '90d':
      from = subDays(now, 90);
      break;
    case 'all':
      from = subDays(now, 365);
      break;
  }

  return { fromDate: format(from, 'yyyy-MM-dd'), toDate };
}

// ---- Colors ----

const PIE_COLORS = [
  'hsl(221 83% 53%)',
  'hsl(262 83% 58%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(0 84% 60%)',
  'hsl(200 18% 46%)',
];

// ---- Component ----

export function AnalyticsScreen({ agentId }: AnalyticsScreenProps) {
  const [range, setRange] = useState<TimeRange>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'models'>('overview');
  const [isExporting, setIsExporting] = useState(false);

  const { fromDate, toDate } = useMemo(() => getDateRange(range), [range]);

  // Aggregated metrics
  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
  } = useQuery<AnalyticsMetrics>({
    queryKey: ['agent-analytics', agentId, range],
    queryFn: () => getAgentAnalytics(agentId, range),
    staleTime: 60000,
  });

  // Daily breakdown
  const {
    data: dailyData,
    isLoading: dailyLoading,
  } = useQuery<DailyAnalytics[]>({
    queryKey: ['agent-analytics-daily', agentId, fromDate, toDate],
    queryFn: () => getAgentAnalyticsDaily(agentId, fromDate, toDate),
    staleTime: 60000,
  });

  const isLoading = metricsLoading || dailyLoading;

  // Model usage data for pie chart
  const modelData = useMemo(() => {
    if (!metrics?.model_usage) return [];
    const entries = Object.entries(metrics.model_usage)
      .sort(([, a], [, b]) => b - a);

    const top5 = entries.slice(0, 5);
    const rest = entries.slice(5);
    const restTotal = rest.reduce((sum, [, count]) => sum + count, 0);

    const result = top5.map(([name, value], i) => ({
      name: name.length > 20 ? name.slice(0, 18) + '...' : name,
      value,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));

    if (restTotal > 0) {
      result.push({ name: 'Other', value: restTotal, fill: PIE_COLORS[5] });
    }

    return result;
  }, [metrics]);

  // Tool usage data for bar chart
  const toolData = useMemo(() => {
    if (!metrics?.tool_usage) return [];
    return Object.entries(metrics.tool_usage)
      .map(([name, stats]) => ({
        name: name.length > 25 ? name.slice(0, 23) + '...' : name,
        success: stats.success,
        failure: stats.failure,
        total: stats.total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [metrics]);

  // Daily chart data
  const chartData = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.map((d) => ({
      date: format(parseISO(d.date), range === '24h' ? 'HH:mm' : 'MMM d'),
      runs: d.runs,
      cost: d.cost,
      successRate: d.success_rate,
      tokens: d.tokens,
    }));
  }, [dailyData, range]);

  // Recent activity table (last 10 entries)
  const recentActivity = useMemo(() => {
    if (!dailyData) return [];
    return [...dailyData]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [dailyData]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await exportAgentAnalytics(agentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-${agentId}-analytics.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Analytics exported successfully');
    } catch {
      toast.error('Failed to export analytics');
    } finally {
      setIsExporting(false);
    }
  }, [agentId]);

  // Loading state
  if (isLoading) {
    return <AnalyticsLoadingSkeleton />;
  }

  // Error state
  if (metricsError) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load analytics</h4>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {(metricsError as Error).message || 'An unexpected error occurred while loading analytics data.'}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!metrics || metrics.total_runs === 0) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        {/* Time range selector still shown */}
        <div className="flex items-center justify-between pb-4 px-1 pt-1">
          <TimeRangeSelector range={range} onRangeChange={setRange} />
          <div />
        </div>
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">No analytics data yet</h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Analytics will appear here once this worker starts processing runs. Start a conversation to generate your first data points.
          </p>
        </div>
      </div>
    );
  }

  // Trend calculations
  const runsTrend = getTrend(metrics.total_runs, metrics.previous_period?.total_runs);
  const successTrend = getTrend(metrics.success_rate, metrics.previous_period?.success_rate);
  const costTrend = getTrend(metrics.average_cost, metrics.previous_period?.average_cost);
  const tokensTrend = getTrend(metrics.total_tokens, metrics.previous_period?.total_tokens);

  return (
    <div className="flex-1 overflow-auto pb-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between pb-4 px-1 pt-1">
        <TimeRangeSelector range={range} onRangeChange={setRange} />
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 rounded-xl gap-2"
          onClick={handleExport}
          disabled={isExporting}
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-1 pb-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'overview'
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            activeTab === 'models'
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          Model Performance
        </button>
      </div>

      {activeTab === 'models' ? (
        <div className="px-1">
          <ModelPerformanceTab agentId={agentId} range={range} />
        </div>
      ) : (
      <div className="px-1 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Runs"
            value={formatNumber(metrics.total_runs)}
            trend={runsTrend}
            icon={Activity}
          />
          <StatCard
            label="Success Rate"
            value={`${metrics.success_rate.toFixed(1)}%`}
            trend={successTrend}
            icon={Zap}
            valueColor={
              metrics.success_rate >= 95
                ? 'text-emerald-500'
                : metrics.success_rate >= 80
                  ? 'text-amber-500'
                  : 'text-red-500'
            }
          />
          <StatCard
            label="Avg Cost / Run"
            value={formatCost(metrics.average_cost)}
            trend={costTrend}
            trendInverted
            icon={DollarSign}
          />
          <StatCard
            label="Total Tokens"
            value={formatNumber(metrics.total_tokens)}
            trend={tokensTrend}
            icon={BarChart3}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Runs + Cost Line Chart */}
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Daily Runs & Cost
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
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={35}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={45}
                      tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => {
                            if (name === 'cost') return [`$${Number(value).toFixed(4)}`, 'Cost'];
                            return [String(value), 'Runs'];
                          }}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="runs"
                      stroke="var(--color-runs)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cost"
                      stroke="var(--color-cost)"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 5"
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

          {/* Model Distribution Pie Chart */}
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Model Usage
              </h3>
              {modelData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ChartContainer config={modelChartConfig} className="h-[200px] w-full">
                    <PieChart>
                      <Pie
                        data={modelData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {modelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value, name) => {
                          const total = modelData.reduce((s, d) => s + d.value, 0);
                          const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0';
                          return [`${value} (${pct}%)`, name];
                        }}
                      />
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {modelData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {entry.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  No model data available
                </div>
              )}
            </div>
          </SpotlightCard>
        </div>

        {/* Tool Usage Bar Chart */}
        {toolData.length > 0 && (
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Tool Usage
              </h3>
              <ChartContainer config={toolChartConfig} className="w-full" style={{ height: Math.max(200, toolData.length * 36) }}>
                <BarChart data={toolData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={140}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="success"
                    stackId="a"
                    fill="var(--color-success)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="failure"
                    stackId="a"
                    fill="var(--color-failure)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </SpotlightCard>
        )}

        {/* Recent Activity Table */}
        {recentActivity.length > 0 && (
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4">Recent Activity</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Runs</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Success Rate</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Tokens</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((day) => (
                      <tr
                        key={day.date}
                        className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-2.5 px-3 text-foreground">
                          {format(parseISO(day.date), 'MMM d, yyyy')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {day.runs.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] px-1.5 py-0 font-mono',
                              day.success_rate >= 95 && 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                              day.success_rate >= 80 && day.success_rate < 95 && 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                              day.success_rate < 80 && 'bg-red-500/10 text-red-500 border-red-500/20'
                            )}
                          >
                            {day.success_rate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                          {formatNumber(day.tokens)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                          {formatCost(day.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SpotlightCard>
        )}
      </div>
      )}
    </div>
  );
}

// ---- Sub Components ----

function TimeRangeSelector({
  range,
  onRangeChange,
}: {
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
      {TIME_RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onRangeChange(r.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            range === r.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  valueColor,
  trendInverted,
}: {
  label: string;
  value: string;
  trend: { direction: 'up' | 'down' | 'flat'; percent: number };
  icon: React.ComponentType<{ className?: string }>;
  valueColor?: string;
  trendInverted?: boolean;
}) {
  // For cost, up is bad and down is good
  const isPositive = trendInverted
    ? trend.direction === 'down'
    : trend.direction === 'up';
  const isNegative = trendInverted
    ? trend.direction === 'up'
    : trend.direction === 'down';

  return (
    <SpotlightCard className="bg-card border border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className={cn('text-xl font-semibold tabular-nums', valueColor || 'text-foreground')}>
            {value}
          </span>
          {trend.direction !== 'flat' && (
            <div
              className={cn(
                'flex items-center gap-0.5 text-[11px] font-medium',
                isPositive && 'text-emerald-500',
                isNegative && 'text-red-500'
              )}
            >
              {trend.direction === 'up' ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.percent.toFixed(1)}%
            </div>
          )}
          {trend.direction === 'flat' && (
            <div className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
              <Minus className="h-3 w-3" />
            </div>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
}

function AnalyticsLoadingSkeleton() {
  return (
    <div className="flex-1 overflow-auto pb-6">
      <div className="px-1 pt-1 space-y-6">
        {/* Time range placeholder */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        {/* Chart row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[310px] rounded-xl" />
          <Skeleton className="h-[310px] rounded-xl" />
        </div>

        {/* Tool chart */}
        <Skeleton className="h-[250px] rounded-xl" />

        {/* Table */}
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
