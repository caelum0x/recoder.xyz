'use client';

import React, { useMemo } from 'react';
import { DollarSign, TrendingUp, Cpu, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { useCostBreakdown } from '@/hooks/agents/use-agent-metrics';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// ---- Types ----

interface CostBreakdownTabProps {
  agentId: string;
}

// ---- Chart Configs ----

const costAreaConfig = {
  cost: {
    label: 'Cost ($)',
    color: 'hsl(221 83% 53%)',
  },
} satisfies ChartConfig;

const modelPieConfig = {
  usage: {
    label: 'Cost',
    color: 'hsl(221 83% 53%)',
  },
} satisfies ChartConfig;

const tokenBarConfig = {
  avg_input_per_run: {
    label: 'Avg Input',
    color: 'hsl(221 83% 53%)',
  },
  avg_output_per_run: {
    label: 'Avg Output',
    color: 'hsl(262 83% 58%)',
  },
} satisfies ChartConfig;

// ---- Colors ----

const PIE_COLORS = [
  'hsl(221 83% 53%)',
  'hsl(262 83% 58%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(0 84% 60%)',
  'hsl(200 18% 46%)',
];

// ---- Helpers ----

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return '$0.00';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ---- Component ----

export function CostBreakdownTab({ agentId }: CostBreakdownTabProps) {
  const { data, isLoading, error } = useCostBreakdown(agentId);

  const dailyCostData = useMemo(() => {
    if (!data?.by_day) return [];
    return data.by_day.map((d) => ({
      date: format(parseISO(d.date), 'MMM d'),
      cost: d.cost,
    }));
  }, [data]);

  const modelPieData = useMemo(() => {
    if (!data?.by_model) return [];
    return data.by_model.slice(0, 6).map((m, i) => ({
      name: m.model.length > 20 ? m.model.slice(0, 18) + '...' : m.model,
      value: m.total_cost,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [data]);

  const tokenBarData = useMemo(() => {
    if (!data?.tokens) return [];
    return [
      {
        name: 'Per Run Avg',
        avg_input_per_run: data.tokens.avg_input_per_run,
        avg_output_per_run: data.tokens.avg_output_per_run,
      },
    ];
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[310px] rounded-xl" />
          <Skeleton className="h-[310px] rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
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
        <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load cost data</h4>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {(error as Error).message || 'An unexpected error occurred.'}
        </p>
      </div>
    );
  }

  // Empty state
  if (!data || (data.by_model.length === 0 && data.by_day.length === 0)) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
          <DollarSign className="h-6 w-6 text-muted-foreground" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-2">No cost data yet</h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Cost breakdown will appear here once the agent generates usage data.
        </p>
      </div>
    );
  }

  const totalCost = data.by_model.reduce((sum, m) => sum + m.total_cost, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Cost (30d)</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatCost(totalCost)}
            </span>
          </div>
        </SpotlightCard>
        <SpotlightCard className={cn(
          'bg-card border',
          data.projected_monthly_cost > 10
            ? 'border-amber-500/50'
            : 'border-border'
        )}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Projected Monthly</span>
              <TrendingUp className={cn(
                'h-4 w-4',
                data.projected_monthly_cost > 10 ? 'text-amber-500' : 'text-muted-foreground'
              )} />
            </div>
            <span className={cn(
              'text-xl font-semibold tabular-nums',
              data.projected_monthly_cost > 10 ? 'text-amber-500' : 'text-foreground'
            )}>
              {formatCost(data.projected_monthly_cost)}
            </span>
          </div>
        </SpotlightCard>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost by Model Pie */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              Cost by Model
            </h3>
            {modelPieData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ChartContainer config={modelPieConfig} className="h-[200px] w-full">
                  <PieChart>
                    <Pie
                      data={modelPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {modelPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value, name) => {
                        return [formatCost(Number(value)), name];
                      }}
                    />
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {modelPieData.map((entry, i) => (
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

        {/* Daily Cost Trend Area Chart */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Daily Cost Trend
            </h3>
            {dailyCostData.length > 0 ? (
              <ChartContainer config={costAreaConfig} className="h-[250px] w-full">
                <AreaChart data={dailyCostData}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-cost)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-cost)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    width={50}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [formatCost(Number(value)), 'Cost']}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="var(--color-cost)"
                    strokeWidth={2}
                    fill="url(#costGradient)"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No daily cost data available
              </div>
            )}
          </div>
        </SpotlightCard>
      </div>

      {/* Token Usage */}
      <div className="grid grid-cols-2 gap-3">
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Input Tokens</span>
            </div>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatNumber(data.tokens.total_input)}
            </span>
          </div>
        </SpotlightCard>
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Output Tokens</span>
            </div>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatNumber(data.tokens.total_output)}
            </span>
          </div>
        </SpotlightCard>
      </div>

      {/* Token Avg Per Run Bar Chart */}
      {(data.tokens.avg_input_per_run > 0 || data.tokens.avg_output_per_run > 0) && (
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4">Average Tokens Per Run</h3>
            <ChartContainer config={tokenBarConfig} className="h-[160px] w-full">
              <BarChart data={tokenBarData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={90}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const label = name === 'avg_input_per_run' ? 'Avg Input' : 'Avg Output';
                        return [formatNumber(Number(value)), label];
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="avg_input_per_run"
                  fill="var(--color-avg_input_per_run)"
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="avg_output_per_run"
                  fill="var(--color-avg_output_per_run)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </SpotlightCard>
      )}
    </div>
  );
}
