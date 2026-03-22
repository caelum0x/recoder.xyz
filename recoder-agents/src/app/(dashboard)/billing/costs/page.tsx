'use client';

import React, { useState } from 'react';
import {
  DollarSign,
  Cpu,
  BarChart3,
  Wallet,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useCostSummary,
  useCostTrends,
  useBudgets,
  useCreateBudget,
  useDeleteBudget,
  useBudgetAlerts,
  useRecordCost,
} from '@/hooks/billing/use-cost-tracking';
import type { CostBudget } from '@/lib/api/cost-tracking';

// ============================================================================
// Helpers
// ============================================================================

function fmt(n: number, decimals = 4): string {
  return n.toFixed(decimals);
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ============================================================================
// Summary Cards
// ============================================================================

function SummaryCards() {
  const { data: summary, isLoading } = useCostSummary();
  const { data: budgets } = useBudgets();

  const activeBudgets = budgets?.filter((b) => b.is_active).length ?? 0;
  const modelCount = summary ? Object.keys(summary.by_model).length : 0;

  const cards = [
    {
      label: 'Total Cost (30d)',
      value: isLoading ? null : `$${fmt(summary?.total_cost_usd ?? 0)}`,
      icon: DollarSign,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Total Tokens',
      value: isLoading ? null : fmtK(summary?.total_tokens ?? 0),
      icon: Cpu,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Models Used',
      value: isLoading ? null : String(modelCount),
      icon: BarChart3,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Active Budgets',
      value: isLoading ? null : String(activeBudgets),
      icon: Wallet,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={cn('flex items-center justify-center h-10 w-10 rounded-lg', card.bg)}>
                  <Icon className={cn('h-5 w-5', card.color)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-5 w-16 mt-1" />
                  ) : (
                    <p className="text-xl font-semibold">{card.value}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================================
// Trends Chart
// ============================================================================

function TrendsChart() {
  const { data: trends, isLoading } = useCostTrends(30);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Cost Trends (30d)</CardTitle>
        <CardDescription>Cost in USD per day</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trends ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v.slice(5)}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${v.toFixed(4)}`}
                className="text-muted-foreground"
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(6)}`, 'Cost USD']}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="cost_usd"
                stroke="#10b981"
                fill="url(#costGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Breakdown Tables
// ============================================================================

function BreakdownTable({
  title,
  data,
  labelKey,
}: {
  title: string;
  data: { label: string; cost: number; pct: number }[];
  labelKey: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 text-xs font-medium text-muted-foreground border-b pb-1">
              <span>{labelKey}</span>
              <span className="text-right">Cost USD</span>
              <span className="text-right">% of Total</span>
            </div>
            {data.map((row) => (
              <div key={row.label} className="grid grid-cols-3 text-sm">
                <span className="truncate text-xs font-mono">{row.label}</span>
                <span className="text-right">${fmt(row.cost, 6)}</span>
                <span className="text-right text-muted-foreground">{row.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownSection() {
  const { data: summary, isLoading } = useCostSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const totalCost = summary?.total_cost_usd ?? 0;

  const modelData = Object.entries(summary?.by_model ?? {})
    .map(([label, cost]) => ({ label, cost, pct: totalCost > 0 ? (cost / totalCost) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);

  const agentData = Object.entries(summary?.by_agent ?? {})
    .map(([label, cost]) => ({ label, cost, pct: totalCost > 0 ? (cost / totalCost) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BreakdownTable title="Cost by Model" data={modelData} labelKey="Model" />
      <BreakdownTable title="Cost by Agent" data={agentData} labelKey="Agent ID" />
    </div>
  );
}

// ============================================================================
// Budget Card
// ============================================================================

function BudgetCard({ budget }: { budget: CostBudget }) {
  const deleteBudget = useDeleteBudget();

  const isAlert = budget.usage_pct >= budget.alert_threshold_pct;
  const progressColor =
    budget.usage_pct >= 100
      ? 'bg-red-500'
      : budget.usage_pct >= budget.alert_threshold_pct
      ? 'bg-yellow-500'
      : 'bg-emerald-500';

  const handleDelete = async () => {
    try {
      await deleteBudget.mutateAsync(budget.id);
      toast.success('Budget deleted');
    } catch {
      toast.error('Failed to delete budget');
    }
  };

  return (
    <Card className={cn(isAlert && 'border-yellow-500/40')}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-medium text-sm">{budget.budget_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{budget.period} budget</p>
            {budget.agent_id && (
              <p className="text-xs text-muted-foreground font-mono truncate">{budget.agent_id}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAlert && (
              <Badge variant="outline" className="border-yellow-500/50 text-yellow-600 dark:text-yellow-400 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Alert
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteBudget.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>${fmt(budget.current_usage_usd, 2)} used</span>
            <span>${fmt(budget.budget_usd, 2)} limit</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={cn('h-2 rounded-full transition-all', progressColor)}
              style={{ width: `${Math.min(budget.usage_pct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{budget.usage_pct.toFixed(1)}% used</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Create Budget Dialog
// ============================================================================

function CreateBudgetDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    budget_name: '',
    agent_id: '',
    period: 'monthly' as 'daily' | 'weekly' | 'monthly',
    budget_usd: '',
    alert_threshold_pct: '80',
  });

  const createBudget = useCreateBudget();

  const handleSubmit = async () => {
    if (!form.budget_name || !form.budget_usd) {
      toast.error('Budget name and amount are required');
      return;
    }
    try {
      await createBudget.mutateAsync({
        budget_name: form.budget_name,
        agent_id: form.agent_id || undefined,
        period: form.period,
        budget_usd: parseFloat(form.budget_usd),
        alert_threshold_pct: parseInt(form.alert_threshold_pct, 10),
      });
      toast.success('Budget created');
      setOpen(false);
      setForm({ budget_name: '', agent_id: '', period: 'monthly', budget_usd: '', alert_threshold_pct: '80' });
    } catch {
      toast.error('Failed to create budget');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1.5" />
          New Budget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Cost Budget</DialogTitle>
          <DialogDescription>Set a spending limit with alert threshold.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Budget Name</Label>
            <Input
              value={form.budget_name}
              onChange={(e) => setForm((f) => ({ ...f, budget_name: e.target.value }))}
              placeholder="Monthly Production"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Agent ID (optional)</Label>
            <Input
              value={form.agent_id}
              onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              placeholder="agent_abc123"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Period</Label>
            <Select
              value={form.period}
              onValueChange={(v) => setForm((f) => ({ ...f, period: v as typeof form.period }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Budget (USD)</Label>
            <Input
              type="number"
              value={form.budget_usd}
              onChange={(e) => setForm((f) => ({ ...f, budget_usd: e.target.value }))}
              placeholder="10.00"
              min="0.01"
              step="0.01"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Alert Threshold (%)</Label>
            <Input
              type="number"
              value={form.alert_threshold_pct}
              onChange={(e) => setForm((f) => ({ ...f, alert_threshold_pct: e.target.value }))}
              min="1"
              max="100"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createBudget.isPending}>
            {createBudget.isPending ? 'Creating...' : 'Create Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Record Cost Dialog (for testing)
// ============================================================================

function RecordCostDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    model_name: 'claude-sonnet-4',
    provider: 'anthropic',
    input_tokens: '100',
    output_tokens: '50',
    cost_usd: '0.001',
    operation_type: 'inference',
  });

  const recordCost = useRecordCost();

  const handleSubmit = async () => {
    if (!form.model_name) {
      toast.error('Model name is required');
      return;
    }
    try {
      await recordCost.mutateAsync({
        model_name: form.model_name,
        provider: form.provider,
        input_tokens: parseInt(form.input_tokens, 10),
        output_tokens: parseInt(form.output_tokens, 10),
        cost_usd: parseFloat(form.cost_usd),
        operation_type: form.operation_type,
      });
      toast.success('Cost recorded');
      setOpen(false);
    } catch {
      toast.error('Failed to record cost');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="h-4 w-4 mr-1.5" />
          Record Cost
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Cost Entry</DialogTitle>
          <DialogDescription>Manually record an inference cost for testing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Model Name</Label>
            <Input
              value={form.model_name}
              onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Input
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Input Tokens</Label>
              <Input
                type="number"
                value={form.input_tokens}
                onChange={(e) => setForm((f) => ({ ...f, input_tokens: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Output Tokens</Label>
              <Input
                type="number"
                value={form.output_tokens}
                onChange={(e) => setForm((f) => ({ ...f, output_tokens: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cost (USD)</Label>
            <Input
              type="number"
              value={form.cost_usd}
              onChange={(e) => setForm((f) => ({ ...f, cost_usd: e.target.value }))}
              step="0.000001"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Operation Type</Label>
            <Select
              value={form.operation_type}
              onValueChange={(v) => setForm((f) => ({ ...f, operation_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inference">Inference</SelectItem>
                <SelectItem value="embedding">Embedding</SelectItem>
                <SelectItem value="fine_tuning">Fine Tuning</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={recordCost.isPending}>
            {recordCost.isPending ? 'Recording...' : 'Record Cost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function CostTrackingPage() {
  const { data: budgets, isLoading: budgetsLoading } = useBudgets();
  const { data: alerts } = useBudgetAlerts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cost Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Monitor AI inference costs, token usage, and spending budgets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RecordCostDialog />
        </div>
      </div>

      {/* Alert banner */}
      {(alerts?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            {alerts!.length} budget{alerts!.length > 1 ? 's' : ''} exceeded alert threshold.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <SummaryCards />

      {/* Trends chart */}
      <TrendsChart />

      {/* Breakdown */}
      <BreakdownSection />

      {/* Budgets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Cost Budgets</h3>
          <CreateBudgetDialog />
        </div>

        {budgetsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (budgets?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No budgets configured.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a budget to track spending limits.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets!.map((b) => (
              <BudgetCard key={b.id} budget={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
