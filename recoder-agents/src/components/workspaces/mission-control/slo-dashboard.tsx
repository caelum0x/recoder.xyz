'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SLOMetric {
  label: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  status?: 'good' | 'warning' | 'critical';
}

interface SLODashboardProps {
  metrics: Record<string, unknown> | null;
}

export function SLODashboard({ metrics }: SLODashboardProps) {
  const cards: SLOMetric[] = [
    {
      label: 'Completion Rate',
      value: formatPercent(metrics?.completionRate),
      trend: getTrend(metrics?.completionRate as number, 90),
      status: getStatus(metrics?.completionRate as number, 90, 75),
    },
    {
      label: 'P50 Latency',
      value: formatMs(metrics?.p50LatencyMs),
      unit: 'ms',
      trend: 'flat',
      status: getStatus(100 - ((metrics?.p50LatencyMs as number) ?? 0) / 100, 70, 50),
    },
    {
      label: 'P95 Latency',
      value: formatMs(metrics?.p95LatencyMs),
      unit: 'ms',
      trend: 'flat',
      status: getStatus(100 - ((metrics?.p95LatencyMs as number) ?? 0) / 200, 60, 40),
    },
    {
      label: 'Error Rate',
      value: formatPercent(metrics?.errorRate),
      trend: getTrend(100 - ((metrics?.errorRate as number) ?? 0), 95),
      status: getStatus(100 - ((metrics?.errorRate as number) ?? 0), 95, 90),
    },
    {
      label: 'Agent Utilization',
      value: formatPercent(metrics?.agentUtilization),
      trend: 'flat',
      status: 'good',
    },
    {
      label: 'Tasks/Hour',
      value: metrics?.tasksPerHour != null ? String(Math.round(metrics.tasksPerHour as number)) : '--',
      trend: 'flat',
      status: 'good',
    },
    // --- Cost / token / queue / retry cards ---
    {
      label: 'Tokens Used',
      value: formatTokens(metrics?.totalTokensUsed),
      subtitle: metrics?.averageTokensPerTask != null
        ? `~${formatTokens(metrics.averageTokensPerTask)}/task`
        : undefined,
      trend: 'flat',
      status: 'good',
    },
    {
      label: 'Est. Cost',
      value: formatCost(metrics?.totalEstimatedCostUsd),
      trend: 'flat',
      status: 'good',
    },
    {
      label: 'Queue Depth',
      value: metrics?.queueDepth != null ? String(metrics.queueDepth as number) : '--',
      trend: 'flat',
      status: getQueueStatus(metrics?.queueDepth as number | undefined),
    },
    {
      label: 'Retries',
      value: metrics?.totalRetries != null ? String(metrics.totalRetries as number) : '0',
      trend: (metrics?.totalRetries as number) > 5 ? 'down' : 'flat',
      status: getStatus(
        100 - ((metrics?.totalRetries as number) ?? 0) * 5,
        80,
        50,
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">SLO Metrics</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {cards.map((card) => (
          <MetricCard key={card.label} metric={card} />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: SLOMetric }) {
  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{metric.label}</span>
        <div
          className={cn(
            'h-2 w-2 rounded-full',
            metric.status === 'good' && 'bg-green-500',
            metric.status === 'warning' && 'bg-yellow-500',
            metric.status === 'critical' && 'bg-red-500',
          )}
        />
      </div>
      <div className="flex items-end gap-1">
        <span className="text-xl font-semibold tabular-nums">{metric.value}</span>
        {metric.unit && <span className="text-xs text-muted-foreground mb-0.5">{metric.unit}</span>}
      </div>
      {metric.subtitle && (
        <span className="text-[10px] text-muted-foreground">{metric.subtitle}</span>
      )}
      {metric.trend && (
        <div className="flex items-center gap-1 mt-1">
          <TrendIcon className={cn(
            'h-3 w-3',
            metric.trend === 'up' && 'text-green-500',
            metric.trend === 'down' && 'text-red-500',
            metric.trend === 'flat' && 'text-muted-foreground',
          )} />
          {metric.trendLabel && (
            <span className="text-[10px] text-muted-foreground">{metric.trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

function formatPercent(value: unknown): string {
  if (value == null || typeof value !== 'number') return '--';
  return `${Math.round(value)}%`;
}

function formatMs(value: unknown): string {
  if (value == null || typeof value !== 'number') return '--';
  return String(Math.round(value));
}

function getTrend(value: number | undefined, threshold: number): 'up' | 'down' | 'flat' {
  if (value == null) return 'flat';
  if (value >= threshold) return 'up';
  if (value < threshold - 10) return 'down';
  return 'flat';
}

function getStatus(value: number | undefined, goodThreshold: number, warnThreshold: number): 'good' | 'warning' | 'critical' {
  if (value == null) return 'good';
  if (value >= goodThreshold) return 'good';
  if (value >= warnThreshold) return 'warning';
  return 'critical';
}

function formatTokens(value: unknown): string {
  if (value == null || typeof value !== 'number') return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function formatCost(value: unknown): string {
  if (value == null || typeof value !== 'number') return '--';
  return `$${value.toFixed(2)}`;
}

function getQueueStatus(value: number | undefined): 'good' | 'warning' | 'critical' {
  if (value == null || value === 0) return 'good';
  if (value <= 5) return 'good';
  if (value <= 20) return 'warning';
  return 'critical';
}
