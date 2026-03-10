'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  DollarSign,
  Zap,
  TrendingUp,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ExportMenu } from '@/components/reports/export-menu';
import {
  useUsageSummary,
  useUsageByAgent,
  useUsageByModel,
  useUsageByDay,
} from '@/hooks/platform/use-reports';
import type { ReportPeriod, Granularity } from '@/lib/api/reports';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90_days', label: 'Last 90 Days' },
];

const areaChartConfig = {
  runs: {
    label: 'Runs',
    color: 'hsl(221 83% 53%)',
  },
  cost: {
    label: 'Cost ($)',
    color: 'hsl(142 71% 45%)',
  },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards({ period }: { period: ReportPeriod }) {
  const { data, isLoading } = useUsageSummary(period);

  const cards = [
    {
      title: 'Total Runs',
      value: data?.total_runs ?? 0,
      format: (v: number) => v.toLocaleString(),
      icon: Activity,
    },
    {
      title: 'Total Cost',
      value: data?.total_cost ?? 0,
      format: (v: number) => `$${v.toFixed(2)}`,
      icon: DollarSign,
    },
    {
      title: 'Total Tokens',
      value: data?.total_tokens ?? 0,
      format: (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : v.toString(),
      icon: Zap,
    },
    {
      title: 'Avg Runs/Day',
      value: data?.avg_runs_per_day ?? 0,
      format: (v: number) => v.toFixed(1),
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{card.format(card.value)}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Over Time Chart
// ---------------------------------------------------------------------------

function UsageOverTimeChart({
  period,
  granularity,
}: {
  period: ReportPeriod;
  granularity: Granularity;
}) {
  const { data, isLoading } = useUsageByDay(period, granularity);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time</CardTitle>
        <CardDescription>
          Runs and cost breakdown by {granularity}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : !data || data.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            No data for this period
          </div>
        ) : (
          <ChartContainer config={areaChartConfig} className="h-[300px] w-full">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillRuns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(221 83% 53%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(221 83% 53%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                className="text-xs"
              />
              <YAxis yAxisId="runs" orientation="left" className="text-xs" />
              <YAxis yAxisId="cost" orientation="right" className="text-xs" tickFormatter={(v) => `$${v}`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                yAxisId="runs"
                type="monotone"
                dataKey="runs"
                stroke="hsl(221 83% 53%)"
                fill="url(#fillRuns)"
                strokeWidth={2}
              />
              <Area
                yAxisId="cost"
                type="monotone"
                dataKey="cost"
                stroke="hsl(142 71% 45%)"
                fill="url(#fillCost)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top Agents Table
// ---------------------------------------------------------------------------

function TopAgentsTable({ period }: { period: ReportPeriod }) {
  const { data, isLoading } = useUsageByAgent(period);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Agents</CardTitle>
        <CardDescription>Agent performance breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No agent data for this period
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Success Rate</TableHead>
                <TableHead className="text-right">Avg Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((agent) => (
                <TableRow key={agent.agent_id}>
                  <TableCell>
                    <Link
                      href={`/agents/config/${agent.agent_id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {agent.agent_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {agent.total_runs.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${agent.total_cost.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={cn(
                        agent.success_rate >= 90
                          ? 'text-green-600 dark:text-green-400'
                          : agent.success_rate >= 70
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {agent.success_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {agent.avg_latency_ms.toFixed(0)} ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Model Breakdown Table
// ---------------------------------------------------------------------------

function ModelBreakdownTable({ period }: { period: ReportPeriod }) {
  const { data, isLoading } = useUsageByModel(period);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Breakdown</CardTitle>
        <CardDescription>Token and cost usage per model</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No model data for this period
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Tokens In</TableHead>
                <TableHead className="text-right">Tokens Out</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Runs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((model) => (
                <TableRow key={model.model}>
                  <TableCell className="font-medium">{model.model}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {model.total_tokens_in.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {model.total_tokens_out.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${model.total_cost.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {model.run_count.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('this_month');
  const [granularity, setGranularity] = useState<Granularity>('day');

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your agent usage, costs, and performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="w-[160px]">
              <CalendarDays className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportMenu period={period} />
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards period={period} />

      {/* Usage Over Time */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-end">
          <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">By Day</SelectItem>
              <SelectItem value="week">By Week</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <UsageOverTimeChart period={period} granularity={granularity} />
      </div>

      {/* Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopAgentsTable period={period} />
        <ModelBreakdownTable period={period} />
      </div>

      {/* Link to scheduled */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/reports/scheduled">Manage Scheduled Reports</Link>
        </Button>
      </div>
    </div>
  );
}
