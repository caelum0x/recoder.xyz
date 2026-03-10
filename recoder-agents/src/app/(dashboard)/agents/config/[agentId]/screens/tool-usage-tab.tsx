'use client';

import React, { useMemo } from 'react';
import { Wrench, AlertTriangle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { useToolMetrics } from '@/hooks/agents/use-agent-metrics';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

// ---- Types ----

interface ToolUsageTabProps {
  agentId: string;
}

// ---- Chart Config ----

const toolBarConfig = {
  call_count: {
    label: 'Calls',
    color: 'hsl(221 83% 53%)',
  },
} satisfies ChartConfig;

// ---- Helpers ----

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

function getSuccessRateBadge(rate: number) {
  if (rate >= 90) {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
        {rate.toFixed(1)}%
      </Badge>
    );
  }
  if (rate >= 70) {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono bg-amber-500/10 text-amber-500 border-amber-500/20">
        {rate.toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono bg-red-500/10 text-red-500 border-red-500/20">
      {rate.toFixed(1)}%
    </Badge>
  );
}

// ---- Component ----

export function ToolUsageTab({ agentId }: ToolUsageTabProps) {
  const { data, isLoading, error } = useToolMetrics(agentId);

  const barChartData = useMemo(() => {
    if (!data?.tools) return [];
    return data.tools.slice(0, 10).map((t) => ({
      name: t.tool_name.length > 25 ? t.tool_name.slice(0, 23) + '...' : t.tool_name,
      call_count: t.call_count,
    }));
  }, [data]);

  const errorHotspots = useMemo(() => {
    if (!data?.tools) return [];
    return data.tools
      .filter((t) => t.failure_count > 0)
      .sort((a, b) => b.failure_count - a.failure_count)
      .slice(0, 10);
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[250px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
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
        <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load tool metrics</h4>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {(error as Error).message || 'An unexpected error occurred.'}
        </p>
      </div>
    );
  }

  // Empty state
  if (!data || data.tools.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
          <Wrench className="h-6 w-6 text-muted-foreground" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-2">No tool usage data</h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Tool usage metrics will appear here once the agent starts using tools.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Horizontal Bar Chart: Most Used Tools */}
      <SpotlightCard className="bg-card border border-border">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Most Used Tools
          </h3>
          {barChartData.length > 0 ? (
            <ChartContainer
              config={toolBarConfig}
              className="w-full"
              style={{ height: Math.max(200, barChartData.length * 36) }}
            >
              <BarChart data={barChartData} layout="vertical" margin={{ left: 10 }}>
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
                <Bar
                  dataKey="call_count"
                  fill="var(--color-call_count)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No tool data available
            </div>
          )}
        </div>
      </SpotlightCard>

      {/* Tool Stats Table */}
      <SpotlightCard className="bg-card border border-border">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-4">Tool Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Tool</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Calls</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Success Rate</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.tools.map((tool) => {
                  const successRate = tool.call_count > 0
                    ? (tool.success_count / tool.call_count) * 100
                    : 0;
                  return (
                    <tr
                      key={tool.tool_name}
                      className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-foreground font-mono text-xs">
                        {tool.tool_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {tool.call_count.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {getSuccessRateBadge(successRate)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatDuration(tool.avg_duration_ms)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </SpotlightCard>

      {/* Error Hotspots */}
      {errorHotspots.length > 0 && (
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Error Hotspots
            </h3>
            <div className="space-y-2">
              {errorHotspots.map((tool) => {
                const failureRate = tool.call_count > 0
                  ? (tool.failure_count / tool.call_count) * 100
                  : 0;
                return (
                  <div
                    key={tool.tool_name}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/20 border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-foreground">{tool.tool_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {tool.failure_count} failures
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 font-mono bg-red-500/10 text-red-500 border-red-500/20"
                      >
                        {failureRate.toFixed(1)}% fail rate
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SpotlightCard>
      )}
    </div>
  );
}
