'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Activity,
  Cpu,
  Download,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useUsageHistory, useAccountState } from '@/hooks/billing';
import { useTransactions } from '@/hooks/billing/use-transactions';
import { SpotlightCard } from '@/components/ui/spotlight-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = '30' | '60' | '90';

const PERIODS: { id: Period; label: string }[] = [
  { id: '30', label: 'This Month' },
  { id: '60', label: 'Last 2 Months' },
  { id: '90', label: 'Last 3 Months' },
];

const dailyChartConfig = {
  debits: {
    label: 'Credits Used',
    color: 'hsl(221 83% 53%)',
  },
} satisfies ChartConfig;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UsagePage() {
  const [period, setPeriod] = useState<Period>('30');
  const days = parseInt(period, 10);
  const { data: usageData, isLoading: usageLoading } = useUsageHistory(days);
  const { data: txData, isLoading: txLoading } = useTransactions(200, 0);
  const { data: accountState, isLoading: accountLoading } = useAccountState();

  const isLoading = usageLoading || txLoading || accountLoading;

  // Compute daily chart data
  const chartData = useMemo(() => {
    if (!usageData?.daily_usage) return [];
    return Object.entries(usageData.daily_usage)
      .map(([date, data]) => ({
        date,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        debits: Math.abs(data.debits),
        credits: data.credits,
        count: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [usageData]);

  // Summary stats
  const totalRuns = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.count, 0);
  }, [chartData]);

  const totalUsage = usageData?.total_period_usage || 0;
  const totalCredits = usageData?.total_period_credits || 0;
  const avgPerRun = totalRuns > 0 ? totalUsage / totalRuns : 0;

  // Projected usage (simple linear projection)
  const daysElapsed = chartData.length || 1;
  const dailyAvgUsage = totalUsage / daysElapsed;
  const daysInMonth = 30;
  const projected = Math.round(dailyAvgUsage * daysInMonth);

  // Per-model breakdown from transactions
  const modelUsage = useMemo(() => {
    if (!txData?.transactions) return [];
    const byModel: Record<string, { model: string; tokens: number; cost: number }> = {};

    txData.transactions
      .filter((tx) => (tx.type as string) === 'debit' && tx.metadata?.reference_type === 'model_usage')
      .forEach((tx) => {
        const model = tx.description?.match(/Model: (.+)/)?.[1] || 'Unknown';
        if (!byModel[model]) {
          byModel[model] = { model, tokens: 0, cost: 0 };
        }
        byModel[model]!.tokens += 1;
        byModel[model]!.cost += Math.abs(tx.amount);
      });

    return Object.values(byModel).sort((a, b) => b.cost - a.cost);
  }, [txData]);

  // Export CSV
  const handleExportCsv = () => {
    const headers = 'Date,Credits Used,Runs\n';
    const rows = chartData.map((d) => `${d.date},${d.debits},${d.count}`).join('\n');
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recoder-usage-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector + Export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium">Total Runs</span>
          </div>
          <p className="text-2xl font-bold">{totalRuns.toLocaleString()}</p>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">Credits Used</span>
          </div>
          <p className="text-2xl font-bold">{Math.round(totalUsage).toLocaleString()}</p>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Cpu className="h-4 w-4" />
            <span className="text-xs font-medium">Avg Credits/Run</span>
          </div>
          <p className="text-2xl font-bold">{avgPerRun.toFixed(1)}</p>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium">Projected (30d)</span>
          </div>
          <p className="text-2xl font-bold">{projected.toLocaleString()}</p>
        </SpotlightCard>
      </div>

      {/* Daily Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Usage</CardTitle>
          <CardDescription>Credits consumed per day over the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No usage data for this period.
            </div>
          ) : (
            <ChartContainer config={dailyChartConfig} className="h-[280px] w-full">
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="debits"
                  fill="var(--color-debits)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Model Usage Breakdown */}
      {modelUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Model</CardTitle>
            <CardDescription>Credit consumption broken down by AI model.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelUsage.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-medium text-sm">{m.model}</TableCell>
                    <TableCell className="text-right text-sm">{m.tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{m.cost.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {totalUsage > 0 ? ((m.cost / totalUsage) * 100).toFixed(1) : '0'}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
