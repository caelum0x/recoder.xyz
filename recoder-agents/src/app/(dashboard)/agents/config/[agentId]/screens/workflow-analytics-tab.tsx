'use client';

import React from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  AlertTriangle,
  Gauge,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';

// ---- Types ----

interface WorkflowAnalyticsTabProps {
  agentId: string;
}

interface BottleneckNode {
  node_id: string;
  label: string;
  node_type: string;
  avg_seconds: number;
  exec_count: number;
}

interface FailureHotspot {
  node_id: string;
  label: string;
  node_type: string;
  total: number;
  failures: number;
  failure_rate: number;
}

interface WorkflowAnalytics {
  execution_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_duration_seconds: number;
  total_cost: number;
  bottleneck_nodes: BottleneckNode[];
  failure_hotspots: FailureHotspot[];
}

// ---- Data Fetcher ----

async function fetchWorkflowAnalytics(agentId: string): Promise<WorkflowAnalytics> {
  const response = await backendApi.get<WorkflowAnalytics>(
    `/workflows/${agentId}/analytics`,
    { showErrors: false, cache: 'no-store' }
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch workflow analytics');
  }
  return response.data!;
}

// ---- Helpers ----

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

// ---- Component ----

export default function WorkflowAnalyticsTab({ agentId }: WorkflowAnalyticsTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflow-analytics', agentId],
    queryFn: () => fetchWorkflowAnalytics(agentId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // ---- Loading State ----
  if (isLoading) {
    return (
      <div className="space-y-6 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // ---- Error State ----
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500 dark:text-zinc-400">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm">Failed to load workflow analytics.</p>
      </div>
    );
  }

  // ---- Empty State ----
  if (data.execution_count === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500 dark:text-zinc-400">
        <BarChart3 className="h-10 w-10 opacity-40" />
        <p className="text-sm font-medium">No executions yet</p>
        <p className="text-xs">Run this workflow to see analytics here.</p>
      </div>
    );
  }

  // ---- Overview Cards ----
  const cards = [
    {
      label: 'Total Executions',
      value: data.execution_count.toLocaleString(),
      icon: Activity,
      color: 'text-blue-500',
    },
    {
      label: 'Success Rate',
      value: `${data.success_rate}%`,
      icon: CheckCircle2,
      color: data.success_rate >= 90 ? 'text-green-500' : data.success_rate >= 70 ? 'text-yellow-500' : 'text-red-500',
    },
    {
      label: 'Avg Duration',
      value: formatDuration(data.avg_duration_seconds),
      icon: Clock,
      color: 'text-violet-500',
    },
    {
      label: 'Total Cost',
      value: formatCost(data.total_cost),
      icon: DollarSign,
      color: 'text-emerald-500',
    },
  ];

  return (
    <div className="space-y-6 p-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <SpotlightCard key={card.label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <div className={cn('rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800', card.color)}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.label}</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{card.value}</p>
              </div>
            </div>
          </SpotlightCard>
        ))}
      </div>

      {/* Execution Breakdown */}
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Breakdown:</span>
        <span className="flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{data.success_count}</span>
          <span className="text-zinc-500 dark:text-zinc-400">succeeded</span>
        </span>
        <span className="text-zinc-300 dark:text-zinc-600">|</span>
        <span className="flex items-center gap-1.5 text-sm">
          <XCircle className="h-4 w-4 text-red-500" />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{data.failure_count}</span>
          <span className="text-zinc-500 dark:text-zinc-400">failed</span>
        </span>
      </div>

      {/* Bottleneck Nodes + Failure Hotspots */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bottleneck Nodes */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <Gauge className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Bottleneck Nodes</h3>
            <span className="text-xs text-zinc-400">(slowest avg execution)</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.bottleneck_nodes.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-zinc-400">No node execution data available.</p>
            ) : (
              data.bottleneck_nodes.map((node) => (
                <div key={node.node_id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {node.label}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {node.node_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{node.exec_count} runs</span>
                    <span className="font-mono font-medium text-orange-600 dark:text-orange-400">
                      {formatDuration(node.avg_seconds)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Failure Hotspots */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Failure Hotspots</h3>
            <span className="text-xs text-zinc-400">(highest failure rate)</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.failure_hotspots.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-zinc-400">No failures recorded.</p>
            ) : (
              data.failure_hotspots.map((node) => (
                <div key={node.node_id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {node.label}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {node.node_type}
                      </Badge>
                    </div>
                    <span className="text-xs text-zinc-400">
                      {node.failures}/{node.total} executions failed
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Failure rate bar */}
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          node.failure_rate >= 50 ? 'bg-red-500' : 'bg-yellow-500'
                        )}
                        style={{ width: `${Math.min(node.failure_rate, 100)}%` }}
                      />
                    </div>
                    <span className="min-w-[3rem] text-right text-xs font-mono font-medium text-red-600 dark:text-red-400">
                      {node.failure_rate}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
