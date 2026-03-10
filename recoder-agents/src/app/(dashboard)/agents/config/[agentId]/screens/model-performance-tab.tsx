'use client';

import React, { useMemo } from 'react';
import { Timer, DollarSign, Shield, Zap, Award, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  getModelAnalytics,
  type ModelAnalyticsResponse,
} from '@/lib/api/model-analytics';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

// ---- Types ----

interface ModelPerformanceTabProps {
  agentId: string;
  range?: string;
}

// ---- Chart Config ----

const latencyChartConfig = {
  avg_latency_ms: {
    label: 'Avg Latency (ms)',
    color: 'hsl(221 83% 53%)',
  },
  p95_latency_ms: {
    label: 'P95 Latency (ms)',
    color: 'hsl(38 92% 50%)',
  },
} satisfies ChartConfig;

// ---- Helpers ----

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return '$0.00';
}

function getRecommendationStyle(recommendation: string): string {
  const lower = recommendation.toLowerCase();
  if (lower.includes('fast')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (lower.includes('value') || lower.includes('cheap')) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (lower.includes('reliable')) return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
  return 'bg-muted text-muted-foreground border-border';
}

function getSuccessRateStyle(rate: number): string {
  if (rate >= 95) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (rate >= 80) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  return 'bg-red-500/10 text-red-500 border-red-500/20';
}

// ---- Component ----

export function ModelPerformanceTab({ agentId, range = '30d' }: ModelPerformanceTabProps) {
  const {
    data,
    isLoading,
    error,
  } = useQuery<ModelAnalyticsResponse>({
    queryKey: ['model-analytics', agentId, range],
    queryFn: () => getModelAnalytics(agentId, range),
    staleTime: 60000,
  });

  // Sort models by total_runs descending
  const sortedModels = useMemo(() => {
    if (!data?.models) return [];
    return [...data.models].sort((a, b) => b.total_runs - a.total_runs);
  }, [data]);

  // Latency chart data
  const latencyData = useMemo(() => {
    return sortedModels.map((m) => ({
      model: m.model.length > 22 ? m.model.slice(0, 20) + '...' : m.model,
      avg_latency_ms: m.avg_latency_ms,
      p95_latency_ms: m.p95_latency_ms,
    }));
  }, [sortedModels]);

  // Loading state
  if (isLoading) {
    return <ModelPerformanceLoadingSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load model analytics</h4>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {(error as Error).message || 'An unexpected error occurred while loading model performance data.'}
        </p>
      </div>
    );
  }

  // Empty state
  if (!data || sortedModels.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
          <Zap className="h-6 w-6 text-muted-foreground" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-2">No model data yet</h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Model performance comparisons will appear here once this worker has been used with multiple models.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparison Table */}
      <SpotlightCard className="bg-card border border-border">
        <div className="p-4">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            Model Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Model</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Runs</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Avg Latency</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">P95 Latency</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Success Rate</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Error Rate</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Cost/Run</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Total Cost</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {sortedModels.map((model) => (
                  <tr
                    key={model.model}
                    className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-foreground font-medium">
                      {model.model}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {model.total_runs.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatLatency(model.avg_latency_ms)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatLatency(model.p95_latency_ms)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] px-1.5 py-0 font-mono',
                          getSuccessRateStyle(model.success_rate),
                        )}
                      >
                        {model.success_rate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {model.error_rate.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatCost(model.cost_per_run)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatCost(model.total_cost)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {model.recommendation && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            getRecommendationStyle(model.recommendation),
                          )}
                        >
                          {model.recommendation}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SpotlightCard>

      {/* Latency Comparison Bar Chart */}
      {latencyData.length > 0 && (
        <SpotlightCard className="bg-card border border-border">
          <div className="p-4">
            <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              Latency Comparison
            </h3>
            <ChartContainer
              config={latencyChartConfig}
              className="w-full"
              style={{ height: Math.max(200, latencyData.length * 48) }}
            >
              <BarChart data={latencyData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v: number) => formatLatency(v)}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={150}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const label = name === 'avg_latency_ms' ? 'Avg Latency' : 'P95 Latency';
                        return [formatLatency(Number(value)), label];
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="avg_latency_ms"
                  fill="var(--color-avg_latency_ms)"
                  radius={[0, 4, 4, 0]}
                  barSize={14}
                />
                <Bar
                  dataKey="p95_latency_ms"
                  fill="var(--color-p95_latency_ms)"
                  radius={[0, 4, 4, 0]}
                  barSize={14}
                />
              </BarChart>
            </ChartContainer>
            <div className="flex items-center justify-center gap-6 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(221 83% 53%)' }} />
                <span className="text-[11px] text-muted-foreground">Avg Latency</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(38 92% 50%)' }} />
                <span className="text-[11px] text-muted-foreground">P95 Latency</span>
              </div>
            </div>
          </div>
        </SpotlightCard>
      )}

      {/* Recommendation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RecommendationCard
          label="Fastest Model"
          modelName={data.fastest_model}
          icon={Zap}
          badgeClass="bg-blue-500/10 text-blue-500 border-blue-500/20"
        />
        <RecommendationCard
          label="Best Value"
          modelName={data.cheapest_model}
          icon={DollarSign}
          badgeClass="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
        />
        <RecommendationCard
          label="Most Reliable"
          modelName={data.most_reliable_model}
          icon={Shield}
          badgeClass="bg-purple-500/10 text-purple-500 border-purple-500/20"
        />
      </div>
    </div>
  );
}

// ---- Sub Components ----

function RecommendationCard({
  label,
  modelName,
  icon: Icon,
  badgeClass,
}: {
  label: string;
  modelName: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
}) {
  return (
    <SpotlightCard className="bg-card border border-border">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', badgeClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-sm font-semibold text-foreground truncate" title={modelName}>
          {modelName}
        </p>
      </div>
    </SpotlightCard>
  );
}

function ModelPerformanceLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Table skeleton */}
      <Skeleton className="h-[320px] rounded-xl" />

      {/* Chart skeleton */}
      <Skeleton className="h-[250px] rounded-xl" />

      {/* Recommendation cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
