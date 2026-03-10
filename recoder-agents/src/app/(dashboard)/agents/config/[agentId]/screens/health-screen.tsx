'use client';

import React, { useMemo } from 'react';
import {
  HeartPulse,
  Shield,
  Zap,
  DollarSign,
  Smile,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useAgentHealth,
  useCalculateHealth,
  useHealthHistory,
} from '@/hooks/agents/use-agent-health';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface HealthScreenProps {
  agentId: string;
}

// ---- Helpers ----

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-muted';
  if (score >= 70) return 'bg-emerald-500/10';
  if (score >= 40) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function getScoreBorder(score: number | null): string {
  if (score === null) return 'border-muted-foreground/20';
  if (score >= 70) return 'border-emerald-500/30';
  if (score >= 40) return 'border-amber-500/30';
  return 'border-red-500/30';
}

function getScoreLabel(score: number | null): string {
  if (score === null) return 'Not calculated';
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Needs Improvement';
  return 'Critical';
}

function getRecommendation(category: string, score: number | null): string | null {
  if (score === null || score >= 70) return null;
  switch (category) {
    case 'reliability':
      return score < 40
        ? 'High failure rate detected. Check agent instructions and tool configurations for errors.'
        : 'Some runs are failing. Review recent error logs to identify patterns.';
    case 'performance':
      return score < 40
        ? 'Agent is very slow. Consider optimizing prompts or using a faster model.'
        : 'Response times could be improved. Try reducing prompt length or tool chain depth.';
    case 'cost_efficiency':
      return score < 40
        ? 'Costs are high per run. Consider using a more cost-effective model or caching frequent queries.'
        : 'Cost efficiency is moderate. Review token usage and consider prompt optimization.';
    case 'user_satisfaction':
      return score < 40
        ? 'Low user ratings. Review response quality and consider adjusting system instructions.'
        : 'Mixed user feedback. Check recent low-rated responses for improvement areas.';
    default:
      return null;
  }
}

// ---- Chart Config ----

const healthChartConfig = {
  overall: {
    label: 'Overall',
    color: 'hsl(221 83% 53%)',
  },
  reliability: {
    label: 'Reliability',
    color: 'hsl(142 71% 45%)',
  },
  performance: {
    label: 'Performance',
    color: 'hsl(262 83% 58%)',
  },
  cost: {
    label: 'Cost Efficiency',
    color: 'hsl(38 92% 50%)',
  },
  satisfaction: {
    label: 'Satisfaction',
    color: 'hsl(0 84% 60%)',
  },
} satisfies ChartConfig;

// ---- Component ----

export function HealthScreen({ agentId }: HealthScreenProps) {
  const { data: health, isLoading: healthLoading, error: healthError } = useAgentHealth(agentId);
  const { data: historyData, isLoading: historyLoading } = useHealthHistory(agentId);
  const calculateMutation = useCalculateHealth();

  const isLoading = healthLoading || historyLoading;

  const chartData = useMemo(() => {
    if (!historyData?.history) return [];
    return [...historyData.history]
      .reverse()
      .map((h) => ({
        date: h.calculated_at ? format(parseISO(h.calculated_at), 'MMM d') : '',
        overall: h.overall_score ?? 0,
        reliability: h.reliability_score ?? 0,
        performance: h.performance_score ?? 0,
        cost: h.cost_efficiency_score ?? 0,
        satisfaction: h.user_satisfaction_score ?? 0,
      }));
  }, [historyData]);

  const handleRecalculate = async () => {
    try {
      await calculateMutation.mutateAsync(agentId);
      toast.success('Health score recalculated');
    } catch {
      toast.error('Failed to calculate health score');
    }
  };

  // Loading state
  if (isLoading) {
    return <HealthLoadingSkeleton />;
  }

  // Error state
  if (healthError) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load health data</h4>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {(healthError as Error).message || 'An error occurred while loading health data.'}
          </p>
        </div>
      </div>
    );
  }

  const overallScore = health?.overall_score ?? null;
  const reliabilityScore = health?.reliability_score ?? null;
  const performanceScore = health?.performance_score ?? null;
  const costEfficiencyScore = health?.cost_efficiency_score ?? null;
  const satisfactionScore = health?.user_satisfaction_score ?? null;
  const factors = health?.factors ?? {};

  // Collect recommendations
  const recommendations = [
    getRecommendation('reliability', reliabilityScore),
    getRecommendation('performance', performanceScore),
    getRecommendation('cost_efficiency', costEfficiencyScore),
    getRecommendation('user_satisfaction', satisfactionScore),
  ].filter(Boolean) as string[];

  return (
    <div className="flex-1 overflow-auto pb-6">
      {/* Header with Recalculate */}
      <div className="flex items-center justify-between pb-4 px-1 pt-1">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Agent Health</h2>
          {overallScore !== null && (
            <Badge
              variant="secondary"
              className={cn(
                'text-xs',
                overallScore >= 70 && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                overallScore >= 40 && overallScore < 70 && 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                overallScore < 40 && 'bg-red-500/10 text-red-600 border-red-500/20'
              )}
            >
              {getScoreLabel(overallScore)}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 rounded-xl gap-2"
          onClick={handleRecalculate}
          disabled={calculateMutation.isPending}
        >
          <RefreshCw className={cn('h-4 w-4', calculateMutation.isPending && 'animate-spin')} />
          {calculateMutation.isPending ? 'Calculating...' : 'Recalculate'}
        </Button>
      </div>

      <div className="px-1 space-y-6">
        {/* Overall Score Gauge */}
        <SpotlightCard className="bg-card border border-border">
          <div className="p-6 flex flex-col items-center gap-4">
            <div
              className={cn(
                'w-28 h-28 rounded-full border-4 flex items-center justify-center',
                getScoreBorder(overallScore),
                getScoreBg(overallScore)
              )}
            >
              <div className="text-center">
                <span className={cn('text-3xl font-bold tabular-nums', getScoreColor(overallScore))}>
                  {overallScore !== null ? overallScore : '--'}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">/ 100</p>
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-sm font-medium text-foreground">Overall Health Score</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {overallScore !== null
                  ? 'Composite score based on reliability, performance, cost efficiency, and user satisfaction.'
                  : 'Click Recalculate to generate your first health score.'}
              </p>
            </div>
          </div>
        </SpotlightCard>

        {/* Sub-Score Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SubScoreCard
            label="Reliability"
            score={reliabilityScore}
            icon={Shield}
            detail={factors.reliability?.success_rate != null
              ? `${factors.reliability.success_rate}% success rate`
              : undefined}
            subDetail={factors.reliability?.total_runs != null
              ? `${factors.reliability.total_runs} runs (30d)`
              : undefined}
          />
          <SubScoreCard
            label="Performance"
            score={performanceScore}
            icon={Zap}
            detail={factors.performance?.avg_duration_s != null
              ? `${factors.performance.avg_duration_s}s avg`
              : undefined}
          />
          <SubScoreCard
            label="Cost Efficiency"
            score={costEfficiencyScore}
            icon={DollarSign}
            detail={factors.cost_efficiency?.cost_per_success != null
              ? `$${factors.cost_efficiency.cost_per_success} / run`
              : undefined}
            subDetail={factors.cost_efficiency?.total_cost != null
              ? `$${factors.cost_efficiency.total_cost} total`
              : undefined}
          />
          <SubScoreCard
            label="Satisfaction"
            score={satisfactionScore}
            icon={Smile}
            detail={factors.user_satisfaction?.avg_rating != null
              ? `${factors.user_satisfaction.avg_rating} / 5 avg`
              : undefined}
            subDetail={factors.user_satisfaction?.rating_count != null
              ? `${factors.user_satisfaction.rating_count} ratings`
              : undefined}
          />
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Recommendations
              </h3>
              <ul className="space-y-2">
                {recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="text-xs text-muted-foreground flex items-start gap-2"
                  >
                    <TrendingDown className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </SpotlightCard>
        )}

        {/* Health History Chart */}
        {chartData.length > 1 && (
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
                Health Score History
              </h3>
              <ChartContainer config={healthChartConfig} className="h-[250px] w-full">
                <LineChart data={chartData}>
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
                    domain={[0, 100]}
                    width={35}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [String(value), String(name)]}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="overall"
                    stroke="var(--color-overall)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reliability"
                    stroke="var(--color-reliability)"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="performance"
                    stroke="var(--color-performance)"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="var(--color-cost)"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="satisfaction"
                    stroke="var(--color-satisfaction)"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ChartContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-3">
                {[
                  { key: 'overall', color: 'hsl(221 83% 53%)' },
                  { key: 'reliability', color: 'hsl(142 71% 45%)' },
                  { key: 'performance', color: 'hsl(262 83% 58%)' },
                  { key: 'cost', color: 'hsl(38 92% 50%)' },
                  { key: 'satisfaction', color: 'hsl(0 84% 60%)' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {item.key === 'cost' ? 'Cost Eff.' : item.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>
        )}

        {/* Empty history state */}
        {chartData.length <= 1 && overallScore !== null && (
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4 text-center">
              <HeartPulse className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                History chart will appear after multiple health calculations.
                Click Recalculate periodically to build a trend.
              </p>
            </div>
          </SpotlightCard>
        )}
      </div>
    </div>
  );
}

// ---- Sub Components ----

function SubScoreCard({
  label,
  score,
  icon: Icon,
  detail,
  subDetail,
}: {
  label: string;
  score: number | null;
  icon: React.ComponentType<{ className?: string }>;
  detail?: string;
  subDetail?: string;
}) {
  return (
    <SpotlightCard className="bg-card border border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0',
              getScoreBorder(score),
              getScoreBg(score)
            )}
          >
            <span className={cn('text-sm font-bold tabular-nums', getScoreColor(score))}>
              {score !== null ? score : '--'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            {detail && (
              <p className="text-xs text-foreground truncate">{detail}</p>
            )}
            {subDetail && (
              <p className="text-[10px] text-muted-foreground truncate">{subDetail}</p>
            )}
            {!detail && (
              <p className="text-[10px] text-muted-foreground">No data yet</p>
            )}
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

function HealthLoadingSkeleton() {
  return (
    <div className="flex-1 overflow-auto pb-6">
      <div className="px-1 pt-1 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
