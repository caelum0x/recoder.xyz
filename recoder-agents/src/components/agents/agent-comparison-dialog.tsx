'use client';

import React from 'react';
import { BarChart3, Clock, DollarSign, Activity, Cpu, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAgentComparison } from '@/hooks/agents/use-agent-comparison';
import type { AgentComparisonData } from '@/lib/api/agent-comparison';

interface AgentComparisonDialogProps {
  agentIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetricRow {
  label: string;
  icon: React.ElementType;
  getValue: (agent: AgentComparisonData) => number;
  format: (value: number) => string;
  /** 'highest' means higher is better, 'lowest' means lower is better */
  bestDirection: 'highest' | 'lowest';
}

const METRIC_ROWS: MetricRow[] = [
  {
    label: 'Total Runs',
    icon: Activity,
    getValue: (a) => a.total_runs,
    format: (v) => v.toLocaleString(),
    bestDirection: 'highest',
  },
  {
    label: 'Success Rate',
    icon: Zap,
    getValue: (a) => a.success_rate,
    format: (v) => `${v}%`,
    bestDirection: 'highest',
  },
  {
    label: 'Avg Latency',
    icon: Clock,
    getValue: (a) => a.avg_latency_ms,
    format: (v) => `${v.toLocaleString()}ms`,
    bestDirection: 'lowest',
  },
  {
    label: 'Cost / Run',
    icon: DollarSign,
    getValue: (a) => a.avg_cost_per_run,
    format: (v) => `$${v.toFixed(4)}`,
    bestDirection: 'lowest',
  },
  {
    label: 'Total Tokens',
    icon: BarChart3,
    getValue: (a) => a.total_tokens,
    format: (v) => v.toLocaleString(),
    bestDirection: 'highest',
  },
];

function getBestIndex(
  agents: AgentComparisonData[],
  metric: MetricRow
): number {
  if (agents.length === 0) return -1;

  // Only consider agents that have runs for a fair comparison
  const values = agents.map((a) => metric.getValue(a));
  const hasRuns = agents.map((a) => a.total_runs > 0);

  let bestIdx = -1;
  let bestVal = metric.bestDirection === 'highest' ? -Infinity : Infinity;

  for (let i = 0; i < values.length; i++) {
    if (!hasRuns[i]) continue;
    const v = values[i];
    if (metric.bestDirection === 'highest' && v > bestVal) {
      bestVal = v;
      bestIdx = i;
    } else if (metric.bestDirection === 'lowest' && v < bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function LoadingSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-border/50">
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex justify-between items-center">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AgentComparisonDialog({
  agentIds,
  open,
  onOpenChange,
}: AgentComparisonDialogProps) {
  const { data: agents, isLoading, error } = useAgentComparison(agentIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Agent Comparison
          </DialogTitle>
          <DialogDescription>
            Side-by-side performance comparison of {agentIds.length} agents
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingSkeleton count={agentIds.length} />
        ) : error || !agents || agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              {error
                ? 'Failed to load comparison data. Please try again.'
                : 'No data available for the selected agents.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Agent header cards */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${agents.length}, 1fr)` }}
            >
              {agents.map((agent) => (
                <Card key={agent.agent_id} className="border-border/50">
                  <CardContent className="pt-5 pb-4">
                    <h3 className="font-semibold text-sm truncate mb-1">
                      {agent.name}
                    </h3>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {agent.model}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Metric comparison rows */}
            <div className="space-y-1">
              {METRIC_ROWS.map((metric) => {
                const bestIdx = getBestIndex(agents, metric);
                const MetricIcon = metric.icon;

                return (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-border/50 overflow-hidden"
                  >
                    {/* Metric label */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/30">
                      <MetricIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {metric.label}
                      </span>
                    </div>

                    {/* Values grid */}
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${agents.length}, 1fr)`,
                      }}
                    >
                      {agents.map((agent, idx) => {
                        const isBest = idx === bestIdx;
                        const val = metric.getValue(agent);
                        return (
                          <div
                            key={agent.agent_id}
                            className={cn(
                              'px-4 py-3 text-center border-l first:border-l-0 border-border/30',
                              isBest &&
                                'bg-green-50 dark:bg-green-950/30'
                            )}
                          >
                            <span
                              className={cn(
                                'text-sm font-mono font-medium',
                                isBest
                                  ? 'text-green-700 dark:text-green-400'
                                  : 'text-foreground'
                              )}
                            >
                              {metric.format(val)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Model row */}
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/30">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Model
                  </span>
                </div>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${agents.length}, 1fr)`,
                  }}
                >
                  {agents.map((agent) => (
                    <div
                      key={agent.agent_id}
                      className="px-4 py-3 text-center border-l first:border-l-0 border-border/30"
                    >
                      <Badge variant="outline" className="font-mono text-xs">
                        {agent.model}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
