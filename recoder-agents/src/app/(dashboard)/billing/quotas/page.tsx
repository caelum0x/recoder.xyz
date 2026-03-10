'use client';

import React, { useState, useMemo } from 'react';
import {
  Gauge,
  TrendingUp,
  AlertTriangle,
  Bot,
  Zap,
  Coins,
  Activity,
  Calendar,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  useQuotaUsageDaily,
  useQuotaUsageSummary,
  useQuotaForecast,
  useTopConsumers,
} from '@/hooks/billing/use-quota-dashboard';

// ---------------------------------------------------------------------------
// Period Options
// ---------------------------------------------------------------------------

type Period = '7d' | '30d' | 'month';

const PERIOD_CONFIG: Record<Period, { label: string; days: number }> = {
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  month: { label: 'This month', days: 30 },
};

// ---------------------------------------------------------------------------
// Chart Config
// ---------------------------------------------------------------------------

const chartConfig: ChartConfig = {
  run_count: {
    label: 'Runs',
    color: 'hsl(var(--chart-1))',
  },
  token_count: {
    label: 'Tokens (k)',
    color: 'hsl(var(--chart-2))',
  },
  cost: {
    label: 'Cost ($)',
    color: 'hsl(var(--chart-3))',
  },
};

// ---------------------------------------------------------------------------
// Circular Gauge
// ---------------------------------------------------------------------------

function CircularGauge({
  value,
  max,
  label,
  icon: Icon,
  formatter,
}: {
  value: number;
  max: number | null;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  formatter: (n: number) => string;
}) {
  const pct = max && max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const hasLimit = max !== null && max > 0;

  // Color based on percentage
  let strokeColor = 'stroke-emerald-500 dark:stroke-emerald-400';
  let textColor = 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 90) {
    strokeColor = 'stroke-red-500 dark:stroke-red-400';
    textColor = 'text-red-600 dark:text-red-400';
  } else if (pct >= 70) {
    strokeColor = 'stroke-amber-500 dark:stroke-amber-400';
    textColor = 'text-amber-600 dark:text-amber-400';
  }

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * pct) / 100;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 pt-6 pb-4">
        {/* SVG gauge */}
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="6"
              className="stroke-muted"
            />
            {/* Progress arc */}
            {hasLimit && (
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className={cn('transition-all duration-500', strokeColor)}
                style={{
                  strokeDasharray: circumference,
                  strokeDashoffset: dashOffset,
                }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-lg font-bold tabular-nums', hasLimit ? textColor : 'text-foreground')}>
              {hasLimit ? `${Math.round(pct)}%` : formatter(value)}
            </span>
          </div>
        </div>

        {/* Label */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {label}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatter(value)}
            {hasLimit ? ` / ${formatter(max!)}` : ''}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Forecast Card
// ---------------------------------------------------------------------------

function ForecastCard({
  label,
  current,
  projected,
  limit,
  overLimit,
  formatter,
}: {
  label: string;
  current: number;
  projected: number;
  limit: number | null;
  overLimit: boolean;
  formatter: (n: number) => string;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg border bg-card">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Current: {formatter(current)} | Projected: {formatter(projected)}
        </p>
      </div>
      {overLimit && (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <AlertTriangle className="h-3 w-3" />
          Over limit
        </Badge>
      )}
      {!overLimit && limit !== null && (
        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
          Within limit
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function QuotaDashboardPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [consumerMetric, setConsumerMetric] = useState<'runs' | 'tokens' | 'cost'>('runs');

  const days = PERIOD_CONFIG[period].days;

  const { data: dailyData, isLoading: isDailyLoading } = useQuotaUsageDaily(days);
  const { data: summary, isLoading: isSummaryLoading } = useQuotaUsageSummary();
  const { data: forecast, isLoading: isForecastLoading } = useQuotaForecast();
  const { data: topData, isLoading: isTopLoading } = useTopConsumers(consumerMetric);

  // Transform daily data for chart
  const chartData = useMemo(() => {
    if (!dailyData?.entries) return [];
    // Aggregate by date (in case of multiple agents)
    const byDate: Record<string, { date: string; run_count: number; token_count: number; cost: number }> = {};
    for (const entry of dailyData.entries) {
      const d = entry.date.slice(0, 10);
      if (!byDate[d]) {
        byDate[d] = { date: d, run_count: 0, token_count: 0, cost: 0 };
      }
      byDate[d].run_count += entry.run_count;
      byDate[d].token_count += entry.token_count;
      byDate[d].cost += entry.cost;
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      ...d,
      token_count: Math.round(d.token_count / 1000), // Convert to thousands
      cost: Number(d.cost.toFixed(4)),
    }));
  }, [dailyData]);

  const formatNumber = (n: number) => n.toLocaleString();
  const formatCost = (n: number) => `$${n.toFixed(2)}`;
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gauge className="h-5 w-5 text-muted-foreground" />
            Usage Quotas
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor your usage against quota limits and forecast end-of-month projections.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px]">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PERIOD_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Usage Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isSummaryLoading ? (
          <>
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </>
        ) : (
          <>
            <CircularGauge
              value={summary?.runs_used ?? 0}
              max={summary?.runs_limit ?? null}
              label="Runs"
              icon={Activity}
              formatter={formatNumber}
            />
            <CircularGauge
              value={summary?.tokens_used ?? 0}
              max={summary?.tokens_limit ?? null}
              label="Tokens"
              icon={Zap}
              formatter={formatTokens}
            />
            <CircularGauge
              value={summary?.cost_used ?? 0}
              max={summary?.cost_limit ?? null}
              label="Cost"
              icon={Coins}
              formatter={formatCost}
            />
          </>
        )}
      </div>

      {/* Daily Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Daily Usage
          </CardTitle>
          <CardDescription className="text-xs">
            Runs, tokens (thousands), and cost per day
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isDailyLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              No usage data for this period.
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  className="text-[10px]"
                />
                <YAxis className="text-[10px]" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="run_count"
                  stackId="1"
                  fill="hsl(var(--chart-1))"
                  stroke="hsl(var(--chart-1))"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="token_count"
                  stackId="2"
                  fill="hsl(var(--chart-2))"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stackId="3"
                  fill="hsl(var(--chart-3))"
                  stroke="hsl(var(--chart-3))"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Forecast Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            End-of-Month Forecast
          </CardTitle>
          <CardDescription className="text-xs">
            {forecast
              ? `${forecast.days_elapsed} days elapsed, ${forecast.days_remaining} remaining`
              : 'Projecting usage based on current rate'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isForecastLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : forecast ? (
            <>
              <ForecastCard
                label="Runs"
                current={forecast.current_runs}
                projected={forecast.projected_runs}
                limit={forecast.runs_limit}
                overLimit={forecast.runs_over_limit}
                formatter={formatNumber}
              />
              <ForecastCard
                label="Tokens"
                current={forecast.current_tokens}
                projected={forecast.projected_tokens}
                limit={forecast.tokens_limit}
                overLimit={forecast.tokens_over_limit}
                formatter={formatTokens}
              />
              <ForecastCard
                label="Cost"
                current={forecast.current_cost}
                projected={forecast.projected_cost}
                limit={forecast.cost_limit}
                overLimit={forecast.cost_over_limit}
                formatter={formatCost}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No forecast data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Consumers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Top Consumers
              </CardTitle>
              <CardDescription className="text-xs">
                Workers ranked by usage this month
              </CardDescription>
            </div>
            <Select value={consumerMetric} onValueChange={(v) => setConsumerMetric(v as 'runs' | 'tokens' | 'cost')}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="runs">By Runs</SelectItem>
                <SelectItem value="tokens">By Tokens</SelectItem>
                <SelectItem value="cost">By Cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isTopLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !topData?.consumers?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No usage data for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Worker</TableHead>
                  <TableHead className="text-xs text-right">Runs</TableHead>
                  <TableHead className="text-xs text-right">Tokens</TableHead>
                  <TableHead className="text-xs text-right">Cost</TableHead>
                  <TableHead className="text-xs text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topData.consumers.map((consumer) => (
                  <TableRow key={consumer.agent_id}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">
                          {consumer.agent_name || consumer.agent_id.slice(0, 12)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums">
                      {consumer.run_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums">
                      {formatTokens(consumer.token_count)}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums">
                      ${consumer.cost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(consumer.pct_of_total, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                          {consumer.pct_of_total.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
