'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useChartData, useDeleteChart } from '@/hooks/dashboard/use-custom-charts';
import type { CustomChart } from '@/lib/api/custom-charts';
import { toast } from '@/lib/toast';

interface CustomChartCardProps {
  chart: CustomChart;
  onEdit: (chart: CustomChart) => void;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function formatValue(value: number, dataSource: string): string {
  if (dataSource === 'costs') return `$${value.toFixed(2)}`;
  if (dataSource === 'tokens') return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return String(Math.round(value));
}

function formatAxisDate(date: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function CustomChartCard({ chart, onEdit }: CustomChartCardProps) {
  const { data: chartData, isLoading } = useChartData(chart.id);
  const deleteMutation = useDeleteChart();

  const handleDelete = () => {
    deleteMutation.mutate(chart.id, {
      onSuccess: () => toast.success('Chart deleted'),
      onError: () => toast.error('Failed to delete chart'),
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-6 rounded" />
        </div>
        <Skeleton className="h-40 w-full rounded" />
      </div>
    );
  }

  const dataPoints = chartData?.data_points || [];
  const total = chartData?.total || 0;

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium truncate">{chart.title}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(chart)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Chart body */}
      {dataPoints.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          No data available for this period
        </div>
      ) : chart.chart_type === 'number' ? (
        <NumberDisplay value={total} dataSource={chart.data_source} />
      ) : chart.chart_type === 'pie' ? (
        <PieChartView dataPoints={dataPoints} dataSource={chart.data_source} />
      ) : (
        <TimeSeriesChart
          dataPoints={dataPoints}
          chartType={chart.chart_type}
          dataSource={chart.data_source}
        />
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Total: {formatValue(total, chart.data_source)}
        </span>
        <span>{chart.time_range}</span>
      </div>
    </div>
  );
}

function NumberDisplay({ value, dataSource }: { value: number; dataSource: string }) {
  return (
    <div className="h-40 flex items-center justify-center">
      <span className="text-4xl font-bold tabular-nums">
        {formatValue(value, dataSource)}
      </span>
    </div>
  );
}

function PieChartView({
  dataPoints,
  dataSource,
}: {
  dataPoints: { date: string; value: number }[];
  dataSource: string;
}) {
  // Group into a few slices for readability
  const sliceCount = Math.min(dataPoints.length, 6);
  const chunkSize = Math.ceil(dataPoints.length / sliceCount);
  const slices: { name: string; value: number }[] = [];

  for (let i = 0; i < dataPoints.length; i += chunkSize) {
    const chunk = dataPoints.slice(i, i + chunkSize);
    const name = chunk.length === 1
      ? formatAxisDate(chunk[0].date)
      : `${formatAxisDate(chunk[0].date)}-${formatAxisDate(chunk[chunk.length - 1].date)}`;
    const value = chunk.reduce((sum, dp) => sum + dp.value, 0);
    slices.push({ name, value });
  }

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={60}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {slices.map((_, index) => (
              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatValue(value, dataSource)}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimeSeriesChart({
  dataPoints,
  chartType,
  dataSource,
}: {
  dataPoints: { date: string; value: number }[];
  chartType: 'line' | 'bar' | 'area';
  dataSource: string;
}) {
  const chartData = dataPoints.map((dp) => ({
    date: formatAxisDate(dp.date),
    value: dp.value,
  }));

  const tooltipFormatter = (value: number) => formatValue(value, dataSource);

  const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
    fontSize: '12px',
  };

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" width={40} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : chartType === 'area' ? (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" width={40} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.15}
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" width={40} />
            <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
