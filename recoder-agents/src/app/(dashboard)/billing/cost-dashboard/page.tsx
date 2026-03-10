'use client';

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Target,
  Bell,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useCostSummary, useBudgetAlerts, useSetBudgetThreshold } from '@/hooks/billing/use-budget-alerts';
import { toast } from '@/lib/toast';
import { format, parseISO } from 'date-fns';
import { CostAlertManager } from '@/components/billing/cost-alert-manager';

// ---- Types ----

type Period = 'this_month' | 'last_month' | 'last_90_days';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90_days', label: 'Last 90 Days' },
];

// ---- Chart Configs ----

const dailyCostChartConfig = {
  cost: {
    label: 'Cost ($)',
    color: 'hsl(221 83% 53%)',
  },
} satisfies ChartConfig;

const agentCostChartConfig = {
  cost: {
    label: 'Cost ($)',
    color: 'hsl(142 71% 45%)',
  },
} satisfies ChartConfig;

const modelCostChartConfig = {
  cost: {
    label: 'Cost ($)',
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
  'hsl(330 65% 55%)',
  'hsl(170 60% 45%)',
];

// ---- Helpers ----

function formatCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return '$0.00';
}

// ---- Component ----

export default function CostDashboardPage() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [budgetInput, setBudgetInput] = useState('');

  const { data: costSummary, isLoading: costLoading, error: costError } = useCostSummary(period);
  const { data: alerts, isLoading: alertsLoading } = useBudgetAlerts();
  const setBudgetMutation = useSetBudgetThreshold();

  // Daily cost data for chart
  const dailyChartData = useMemo(() => {
    if (!costSummary?.daily_costs) return [];
    return costSummary.daily_costs.map((d) => ({
      date: format(parseISO(d.date), 'MMM d'),
      cost: d.cost,
    }));
  }, [costSummary]);

  // Cost by agent for bar chart (top 10)
  const agentChartData = useMemo(() => {
    if (!costSummary?.cost_by_agent) return [];
    return [...costSummary.cost_by_agent]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)
      .map((d) => ({
        name: d.agent_name.length > 20 ? d.agent_name.slice(0, 18) + '...' : d.agent_name,
        cost: d.cost,
      }));
  }, [costSummary]);

  // Cost by model for pie chart
  const modelChartData = useMemo(() => {
    if (!costSummary?.cost_by_model) return [];
    return costSummary.cost_by_model
      .sort((a, b) => b.cost - a.cost)
      .map((d, i) => ({
        name: d.model.length > 25 ? d.model.slice(0, 23) + '...' : d.model,
        value: d.cost,
        fill: PIE_COLORS[i % PIE_COLORS.length],
      }));
  }, [costSummary]);

  // Current budget threshold
  const currentThreshold = useMemo(() => {
    if (!alerts || alerts.length === 0) return null;
    // Use the most recent alert threshold
    return alerts.reduce((latest, alert) =>
      new Date(alert.created_at) > new Date(latest.created_at) ? alert : latest
    );
  }, [alerts]);

  // Budget utilization percentage
  const budgetUtilization = useMemo(() => {
    if (!currentThreshold || !costSummary) return null;
    return (costSummary.total_cost_this_month / currentThreshold.threshold_amount) * 100;
  }, [currentThreshold, costSummary]);

  const handleSetBudget = () => {
    const amount = parseFloat(budgetInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid budget amount greater than 0');
      return;
    }
    setBudgetMutation.mutate(amount, {
      onSuccess: () => {
        toast.success(`Budget alert set at $${amount.toFixed(2)}`);
        setBudgetInput('');
      },
      onError: () => {
        toast.error('Failed to set budget alert');
      },
    });
  };

  // Loading state
  if (costLoading) {
    return <CostDashboardSkeleton />;
  }

  // Error state
  if (costError) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load cost data</h4>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {(costError as Error).message || 'An unexpected error occurred while loading cost data.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cost Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor spending and set budget alerts</p>
        </div>
        <PeriodSelector period={period} onPeriodChange={setPeriod} />
      </div>

      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="This Month"
            value={formatCost(costSummary?.total_cost_this_month ?? 0)}
            icon={DollarSign}
            iconColor="text-blue-500"
          />
          <SummaryCard
            label="Last Month"
            value={formatCost(costSummary?.total_cost_last_month ?? 0)}
            icon={DollarSign}
            iconColor="text-muted-foreground"
          />
          <SummaryCard
            label="Projected Monthly"
            value={formatCost(costSummary?.projected_monthly_cost ?? 0)}
            icon={TrendingUp}
            iconColor="text-amber-500"
            subtitle={
              costSummary && costSummary.projected_monthly_cost > costSummary.total_cost_last_month
                ? 'Above last month'
                : 'Below last month'
            }
            subtitleColor={
              costSummary && costSummary.projected_monthly_cost > costSummary.total_cost_last_month
                ? 'text-amber-500'
                : 'text-emerald-500'
            }
          />
          <SummaryCard
            label="Budget Status"
            value={currentThreshold ? formatCost(currentThreshold.threshold_amount) : 'No budget set'}
            icon={Target}
            iconColor={
              budgetUtilization !== null && budgetUtilization >= 100
                ? 'text-red-500'
                : budgetUtilization !== null && budgetUtilization >= 80
                  ? 'text-amber-500'
                  : 'text-emerald-500'
            }
            subtitle={
              budgetUtilization !== null
                ? `${budgetUtilization.toFixed(1)}% used`
                : undefined
            }
            subtitleColor={
              budgetUtilization !== null && budgetUtilization >= 100
                ? 'text-red-500'
                : budgetUtilization !== null && budgetUtilization >= 80
                  ? 'text-amber-500'
                  : 'text-emerald-500'
            }
          />
        </div>

        {/* Daily Cost Trend */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Daily Cost Trend
            </h3>
            {dailyChartData.length > 0 ? (
              <ChartContainer config={dailyCostChartConfig} className="h-[280px] w-full">
                <LineChart data={dailyChartData}>
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
                        formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cost']}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="var(--color-cost)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No daily cost data available
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* Charts Row: Agent + Model */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cost by Agent */}
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Cost by Agent
              </h3>
              {agentChartData.length > 0 ? (
                <ChartContainer
                  config={agentCostChartConfig}
                  className="w-full"
                  style={{ height: Math.max(200, agentChartData.length * 36) }}
                >
                  <BarChart data={agentChartData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={130}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cost']}
                        />
                      }
                    />
                    <Bar
                      dataKey="cost"
                      fill="var(--color-cost)"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  No agent cost data available
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* Cost by Model */}
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Cost by Model
              </h3>
              {modelChartData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ChartContainer config={modelCostChartConfig} className="h-[220px] w-full">
                    <PieChart>
                      <Pie
                        data={modelChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {modelChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value, name) => {
                          const total = modelChartData.reduce((s, d) => s + d.value, 0);
                          const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0';
                          return [`$${Number(value).toFixed(4)} (${pct}%)`, name];
                        }}
                      />
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {modelChartData.map((entry, i) => (
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
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                  No model cost data available
                </div>
              )}
            </div>
          </SpotlightCard>
        </div>

        {/* Budget Alert Settings */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Budget Alert Settings
            </h3>

            <div className="space-y-4">
              {/* Budget input */}
              <div className="flex items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Monthly budget threshold ($)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 50.00"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-9 px-4"
                  onClick={handleSetBudget}
                  disabled={setBudgetMutation.isPending || !budgetInput}
                >
                  {setBudgetMutation.isPending ? 'Setting...' : 'Set Budget'}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                You&apos;ll be notified at 80% and 100% of your budget.
              </p>

              {/* Current alerts */}
              {alertsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : alerts && alerts.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">Active Alerts</h4>
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-sm text-foreground">
                          ${alert.threshold_amount.toFixed(2)} threshold
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {alert.alert_type === 'warning_80pct' ? '80%' : alert.alert_type === 'warning_100pct' ? '100%' : alert.alert_type}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(alert.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 rounded-lg bg-muted/20 border border-border/30 text-center">
                  <p className="text-sm text-muted-foreground">No budget alerts configured yet.</p>
                </div>
              )}
            </div>
          </div>
        </SpotlightCard>

        {/* Cost Alert Manager */}
        <CostAlertManager />
      </div>
    </div>
  );
}

// ---- Sub Components ----

function PeriodSelector({
  period,
  onPeriodChange,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          onClick={() => onPeriodChange(p.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
            period === p.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconColor,
  subtitle,
  subtitleColor,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  subtitle?: string;
  subtitleColor?: string;
}) {
  return (
    <SpotlightCard className="bg-card border border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4', iconColor || 'text-muted-foreground')} />
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {value}
          </span>
          {subtitle && (
            <span className={cn('text-[11px] font-medium', subtitleColor || 'text-muted-foreground')}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
}

function CostDashboardSkeleton() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-72 rounded-lg" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        {/* Daily trend */}
        <Skeleton className="h-[340px] rounded-xl" />

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[310px] rounded-xl" />
          <Skeleton className="h-[310px] rounded-xl" />
        </div>

        {/* Budget settings */}
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
    </div>
  );
}
