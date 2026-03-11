'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  RefreshCw,
  AlertTriangle,
  Zap,
  DollarSign,
  HardDrive,
  Cpu,
  MessageSquare,
  BarChart3,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useForecasts,
  useForecastDetail,
  useGenerateForecast,
  useUsageTrends,
} from '@/hooks/billing/use-usage-forecasting';
import type {
  UsageForecast,
  TrendSummary,
} from '@/lib/api/usage-forecasting';

// ============================================================================
// Constants
// ============================================================================

type ForecastPeriod = 'daily' | 'weekly' | 'monthly';

const PERIODS: { id: ForecastPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const METRIC_TYPES = [
  'tokens',
  'api_calls',
  'cost',
  'storage',
  'compute_minutes',
  'thread_count',
] as const;

type MetricType = (typeof METRIC_TYPES)[number];

const METRIC_CONFIG: Record<
  MetricType,
  {
    label: string;
    icon: React.ComponentType<any>;
    format: (v: number) => string;
    color: string;
  }
> = {
  tokens: {
    label: 'Tokens',
    icon: Zap,
    format: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(Math.round(v)),
    color: '#6366f1',
  },
  api_calls: {
    label: 'API Calls',
    icon: Activity,
    format: (v) => v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(Math.round(v)),
    color: '#8b5cf6',
  },
  cost: {
    label: 'Cost',
    icon: DollarSign,
    format: (v) => `$${v.toFixed(2)}`,
    color: '#ec4899',
  },
  storage: {
    label: 'Storage',
    icon: HardDrive,
    format: (v) => v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Math.round(v)} MB`,
    color: '#f97316',
  },
  compute_minutes: {
    label: 'Compute',
    icon: Cpu,
    format: (v) => v >= 60 ? `${(v / 60).toFixed(1)}h` : `${Math.round(v)}m`,
    color: '#22c55e',
  },
  thread_count: {
    label: 'Threads',
    icon: MessageSquare,
    format: (v) => v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(Math.round(v)),
    color: '#06b6d4',
  },
};

const TREND_ICON: Record<string, { icon: React.ComponentType<any>; color: string; label: string }> = {
  increasing: { icon: TrendingUp, color: 'text-red-500', label: 'Increasing' },
  decreasing: { icon: TrendingDown, color: 'text-green-500', label: 'Decreasing' },
  stable: { icon: Minus, color: 'text-muted-foreground', label: 'Stable' },
  volatile: { icon: Activity, color: 'text-amber-500', label: 'Volatile' },
};

// ============================================================================
// Page Component
// ============================================================================

export default function UsageForecastPage() {
  const [period, setPeriod] = useState<ForecastPeriod>('monthly');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tokens');

  const { data: trends, isLoading: trendsLoading } = useUsageTrends();
  const { data: forecasts, isLoading: forecastsLoading } = useForecasts({
    forecast_period: period,
  });
  const { data: detail, isLoading: detailLoading } = useForecastDetail(
    selectedMetric,
    period,
  );
  const generateMutation = useGenerateForecast();

  const isLoading = trendsLoading || forecastsLoading;

  const handleGenerate = async (metricType: string) => {
    try {
      await generateMutation.mutateAsync({
        metric_type: metricType,
        forecast_period: period,
      });
      toast.success('Forecast generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate forecast');
    }
  };

  const handleGenerateAll = async () => {
    try {
      for (const metric of METRIC_TYPES) {
        await generateMutation.mutateAsync({
          metric_type: metric,
          forecast_period: period,
        });
      }
      toast.success('All forecasts generated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate forecasts');
    }
  };

  // Build chart data from forecast detail
  const chartData = useMemo(() => {
    if (!detail) return [];
    const historical = (detail.historical_data || []).map((d) => ({
      period: d.period,
      actual: d.value,
      projected: null as number | null,
    }));
    const projected = (detail.forecast_data || []).map((d) => ({
      period: d.period,
      actual: null as number | null,
      projected: d.value,
    }));
    // Add overlap point for continuity
    if (historical.length > 0 && projected.length > 0) {
      projected[0].actual = historical[historical.length - 1].actual;
    }
    return [...historical, ...projected];
  }, [detail]);

  // Build trend map from trends response
  const trendMap = useMemo(() => {
    const map: Record<string, TrendSummary> = {};
    if (trends?.trends) {
      for (const t of trends.trends) {
        map[t.metric_type] = t;
      }
    }
    return map;
  }, [trends]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold">Usage Forecast</h1>
            <p className="text-sm text-muted-foreground">
              Predict future usage and plan accordingly
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={period}
              onValueChange={(v) => setPeriod(v as ForecastPeriod)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleGenerateAll}
              disabled={generateMutation.isPending}
              size="sm"
              className="gap-1.5"
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  generateMutation.isPending && 'animate-spin',
                )}
              />
              Generate Forecast
            </Button>
          </div>
        </div>

        {/* Metric Stat Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {METRIC_TYPES.map((metric) => {
              const config = METRIC_CONFIG[metric];
              const trend = trendMap[metric];
              const trendInfo = trend
                ? TREND_ICON[trend.trend] || TREND_ICON.stable
                : TREND_ICON.stable;
              const TrendIcon = trendInfo.icon;
              const MetricIcon = config.icon;
              const isSelected = selectedMetric === metric;

              return (
                <Card
                  key={metric}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    isSelected && 'ring-2 ring-primary',
                  )}
                  onClick={() => setSelectedMetric(metric)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <MetricIcon className="h-4 w-4 text-muted-foreground" />
                      <TrendIcon className={cn('h-3.5 w-3.5', trendInfo.color)} />
                    </div>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                    <p className="text-lg font-semibold mt-0.5">
                      {trend ? config.format(trend.current_value) : '--'}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {trend?.change_percent != null && (
                        <span
                          className={cn(
                            'text-[10px] font-medium',
                            trend.change_percent > 0
                              ? 'text-red-500'
                              : trend.change_percent < 0
                                ? 'text-green-500'
                                : 'text-muted-foreground',
                          )}
                        >
                          {trend.change_percent > 0 ? '+' : ''}
                          {trend.change_percent.toFixed(1)}%
                        </span>
                      )}
                      {trend?.projected_value != null && (
                        <span className="text-[10px] text-muted-foreground">
                          proj: {config.format(trend.projected_value)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Forecast Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {METRIC_CONFIG[selectedMetric].label} Forecast
                </CardTitle>
                <CardDescription>
                  Historical usage (solid) and projected (dashed)
                </CardDescription>
              </div>
              {detail && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Confidence: {((detail.confidence_score || 0) * 100).toFixed(0)}%
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGenerate(selectedMetric)}
                    disabled={generateMutation.isPending}
                  >
                    <RefreshCw
                      className={cn(
                        'h-3.5 w-3.5',
                        generateMutation.isPending && 'animate-spin',
                      )}
                    />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(v) => METRIC_CONFIG[selectedMetric].format(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      METRIC_CONFIG[selectedMetric].format(value),
                      undefined,
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                  {detail?.alert_threshold != null && (
                    <ReferenceLine
                      y={detail.alert_threshold}
                      stroke="#ef4444"
                      strokeDasharray="6 3"
                      label={{
                        value: 'Threshold',
                        position: 'right',
                        fill: '#ef4444',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke={METRIC_CONFIG[selectedMetric].color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Actual"
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke={METRIC_CONFIG[selectedMetric].color}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={{ r: 3 }}
                    name="Projected"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No forecast data yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => handleGenerate(selectedMetric)}
                    disabled={generateMutation.isPending}
                  >
                    Generate Forecast
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projected Overages */}
        {trends?.projected_overages && trends.projected_overages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Projected Overages
              </CardTitle>
              <CardDescription>
                Metrics projected to exceed their thresholds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trends.projected_overages.map((overage) => {
                  const config = METRIC_CONFIG[overage.metric_type as MetricType];
                  if (!config) return null;
                  const Icon = config.icon;
                  return (
                    <div
                      key={overage.metric_type}
                      className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-amber-600" />
                        <div>
                          <p className="text-sm font-medium">{config.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Threshold: {config.format(overage.threshold)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-amber-600">
                          {config.format(overage.projected_value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          +{overage.overage_percent.toFixed(1)}% over limit
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Forecasts Summary */}
        {forecasts && forecasts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecast Summary</CardTitle>
              <CardDescription>
                Overview of all metric forecasts ({period})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {forecasts.map((forecast) => {
                  const config =
                    METRIC_CONFIG[forecast.metric_type as MetricType];
                  if (!config) return null;
                  const trendInfo =
                    TREND_ICON[forecast.trend] || TREND_ICON.stable;
                  const TrendIcon = trendInfo.icon;
                  const MetricIcon = config.icon;

                  return (
                    <div
                      key={forecast.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        setSelectedMetric(forecast.metric_type as MetricType)
                      }
                    >
                      <MetricIcon
                        className="h-5 w-5 mt-0.5"
                        style={{ color: config.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{config.label}</p>
                          <TrendIcon
                            className={cn('h-3.5 w-3.5', trendInfo.color)}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {trendInfo.label}
                          </Badge>
                          {forecast.projected_value != null && (
                            <span className="text-xs text-muted-foreground">
                              {config.format(forecast.projected_value)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Confidence:{' '}
                          {((forecast.confidence_score || 0) * 100).toFixed(0)}%
                          | Generated:{' '}
                          {new Date(forecast.generated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
