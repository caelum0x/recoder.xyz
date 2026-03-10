'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  LineChart as LineChartIcon,
  BarChart3,
  AreaChart,
  PieChart as PieChartIcon,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateChart, useUpdateChart } from '@/hooks/dashboard/use-custom-charts';
import type { CustomChart, CreateChartData } from '@/lib/api/custom-charts';
import { toast } from '@/lib/toast';

interface ChartBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editChart?: CustomChart | null;
}

const CHART_TYPES = [
  { value: 'line', label: 'Line', icon: LineChartIcon },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'pie', label: 'Pie', icon: PieChartIcon },
  { value: 'number', label: 'Number', icon: Hash },
] as const;

const DATA_SOURCES = [
  { value: 'agent_runs', label: 'Agent Runs' },
  { value: 'costs', label: 'Costs' },
  { value: 'tokens', label: 'Token Usage' },
  { value: 'errors', label: 'Errors' },
  { value: 'api_usage', label: 'API Usage' },
  { value: 'thread_count', label: 'Thread Count' },
] as const;

const TIME_RANGES = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

export function ChartBuilderDialog({ open, onOpenChange, editChart }: ChartBuilderDialogProps) {
  const [title, setTitle] = useState(editChart?.title || '');
  const [chartType, setChartType] = useState(editChart?.chart_type || 'line');
  const [dataSource, setDataSource] = useState(editChart?.data_source || 'agent_runs');
  const [agentId, setAgentId] = useState(editChart?.agent_id || '');
  const [timeRange, setTimeRange] = useState(editChart?.time_range || '30d');

  const createMutation = useCreateChart();
  const updateMutation = useUpdateChart();

  const isEditing = !!editChart;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Please enter a chart title');
      return;
    }

    const chartData: CreateChartData = {
      title: title.trim(),
      chart_type: chartType,
      data_source: dataSource,
      agent_id: agentId || null,
      time_range: timeRange,
    };

    if (isEditing && editChart) {
      updateMutation.mutate(
        { chartId: editChart.id, data: chartData },
        {
          onSuccess: () => {
            toast.success('Chart updated');
            onOpenChange(false);
          },
          onError: () => {
            toast.error('Failed to update chart');
          },
        }
      );
    } else {
      createMutation.mutate(chartData, {
        onSuccess: () => {
          toast.success('Chart created');
          onOpenChange(false);
          // Reset form
          setTitle('');
          setChartType('line');
          setDataSource('agent_runs');
          setAgentId('');
          setTimeRange('30d');
        },
        onError: () => {
          toast.error('Failed to create chart');
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Chart' : 'Add Chart'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="chart-title">Title</Label>
            <Input
              id="chart-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Daily Agent Runs"
              maxLength={200}
            />
          </div>

          {/* Chart Type */}
          <div className="space-y-2">
            <Label>Chart Type</Label>
            <div className="flex gap-1.5">
              {CHART_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setChartType(type.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors flex-1',
                      chartType === type.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-accent text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data Source */}
          <div className="space-y-2">
            <Label>Data Source</Label>
            <Select value={dataSource} onValueChange={setDataSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_SOURCES.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agent Filter */}
          <div className="space-y-2">
            <Label htmlFor="agent-filter">Agent Filter (optional)</Label>
            <Input
              id="agent-filter"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Agent ID to filter by"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to aggregate across all agents
            </p>
          </div>

          {/* Time Range */}
          <div className="space-y-2">
            <Label>Time Range</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>
            {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Chart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
