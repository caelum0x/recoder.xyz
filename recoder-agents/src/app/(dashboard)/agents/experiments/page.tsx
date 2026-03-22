'use client';

import React, { useState } from 'react';
import {
  FlaskConical,
  Play,
  Square,
  Trash2,
  BarChart2,
  Plus,
  Trophy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useExperiments,
  useCreateExperiment,
  useDeleteExperiment,
  useStartExperiment,
  useStopExperiment,
  useRecordResult,
  useExperimentResults,
  useExperimentSummary,
} from '@/hooks/agents/use-ab-testing';
import type { ABExperiment, ABAggregatedResult, ABSummary } from '@/lib/api/ab-testing';

// ============================================================================
// Constants
// ============================================================================

const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    color: 'bg-muted text-muted-foreground border-border',
    icon: AlertCircle,
  },
  running: {
    label: 'Running',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    icon: Loader2,
  },
  paused: {
    label: 'Paused',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    icon: AlertCircle,
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: XCircle,
  },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? {
    label: status,
    color: 'bg-muted text-muted-foreground border-border',
    icon: AlertCircle,
  };
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        cfg.color
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {cfg.label}
    </span>
  );
}

function WinnerBadge({ winner }: { winner: 'a' | 'b' | 'tie' | null }) {
  if (!winner) return null;
  const label =
    winner === 'a' ? '🏆 Variant A' : winner === 'b' ? '🏆 Variant B' : '🤝 Tie';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
      {label}
    </span>
  );
}

// ============================================================================
// Traffic Split Bar
// ============================================================================

function TrafficSplitBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>A</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
        <div className="h-full bg-orange-500 flex-1" />
      </div>
      <span>B</span>
      <span className="ml-1 text-muted-foreground">
        {pct}/{100 - pct}
      </span>
    </div>
  );
}

// ============================================================================
// Summary Table
// ============================================================================

function SummaryTable({ summary }: { summary: ABSummary[] }) {
  if (!summary.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No metric data yet. Record results below.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b">
          <tr className="text-muted-foreground">
            <th className="text-left py-2 pr-3 font-medium">Metric</th>
            <th className="text-right py-2 pr-3 font-medium">Variant A</th>
            <th className="text-right py-2 pr-3 font-medium">Variant B</th>
            <th className="text-right py-2 pr-3 font-medium">Diff %</th>
            <th className="text-left py-2 font-medium">Suggested</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.metric_name} className="border-b last:border-0 hover:bg-muted/20">
              <td className="py-2 pr-3 font-medium">{row.metric_name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{row.variant_a_avg.toFixed(4)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{row.variant_b_avg.toFixed(4)}</td>
              <td
                className={cn(
                  'py-2 pr-3 text-right tabular-nums font-medium',
                  row.pct_diff > 0
                    ? 'text-green-600 dark:text-green-400'
                    : row.pct_diff < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
                )}
              >
                {row.pct_diff > 0 ? '+' : ''}
                {row.pct_diff.toFixed(2)}%
              </td>
              <td className="py-2">
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-medium',
                    row.suggested_winner === 'b'
                      ? 'bg-orange-500/10 text-orange-600'
                      : row.suggested_winner === 'a'
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {row.suggested_winner === 'tie' ? 'Tie' : `Variant ${row.suggested_winner.toUpperCase()}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Results Chart
// ============================================================================

function ResultsChart({ results }: { results: ABAggregatedResult[] }) {
  // Group by metric_name and pivot to [{metric, a, b}]
  const metricMap: Record<string, { a?: number; b?: number }> = {};
  for (const r of results) {
    if (!metricMap[r.metric_name]) metricMap[r.metric_name] = {};
    metricMap[r.metric_name][r.variant as 'a' | 'b'] = Number(r.avg_value);
  }
  const chartData = Object.entries(metricMap).map(([metric, vals]) => ({
    metric,
    'Variant A': vals.a ?? 0,
    'Variant B': vals.b ?? 0,
  }));

  if (!chartData.length) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Variant A" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Variant B" fill="hsl(32 95% 58%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Record Result Mini Form
// ============================================================================

function RecordResultForm({ experimentId }: { experimentId: string }) {
  const [form, setForm] = useState({
    variant: 'a' as 'a' | 'b',
    metric_name: '',
    metric_value: '',
  });
  const record = useRecordResult();

  const handleRecord = async () => {
    if (!form.metric_name || !form.metric_value) {
      toast.error('Metric name and value are required');
      return;
    }
    try {
      await record.mutateAsync({
        id: experimentId,
        data: {
          variant: form.variant,
          metric_name: form.metric_name,
          metric_value: parseFloat(form.metric_value),
        },
      });
      toast.success('Result recorded');
      setForm((f) => ({ ...f, metric_name: '', metric_value: '' }));
    } catch {
      toast.error('Failed to record result');
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Record Result</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Variant</Label>
          <Select
            value={form.variant}
            onValueChange={(v) => setForm((f) => ({ ...f, variant: v as 'a' | 'b' }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">A</SelectItem>
              <SelectItem value="b">B</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Metric</Label>
          <Input
            value={form.metric_name}
            onChange={(e) => setForm((f) => ({ ...f, metric_name: e.target.value }))}
            placeholder="latency_ms"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            type="number"
            value={form.metric_value}
            onChange={(e) => setForm((f) => ({ ...f, metric_value: e.target.value }))}
            placeholder="0.00"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <Button
        size="sm"
        className="h-7 text-xs"
        onClick={handleRecord}
        disabled={record.isPending}
      >
        {record.isPending ? 'Recording...' : 'Record'}
      </Button>
    </div>
  );
}

// ============================================================================
// Experiment Results Sheet
// ============================================================================

function ExperimentResultsSheet({
  experiment,
  open,
  onClose,
}: {
  experiment: ABExperiment;
  open: boolean;
  onClose: () => void;
}) {
  const id = open ? experiment.id : null;
  const { data: results, isLoading: resultsLoading } = useExperimentResults(id);
  const { data: summary, isLoading: summaryLoading } = useExperimentSummary(id);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{experiment.experiment_name}</SheetTitle>
          <SheetDescription>
            Agent: <span className="font-mono text-xs">{experiment.agent_id}</span>
          </SheetDescription>
        </SheetHeader>

        {/* Summary table */}
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Metric Summary</p>
          {summaryLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <SummaryTable summary={summary ?? []} />
          )}
        </div>

        {/* Chart */}
        {results && results.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Comparison Chart</p>
            <ResultsChart results={results} />
          </div>
        )}

        {/* Record result */}
        <div className="mb-4">
          <RecordResultForm experimentId={experiment.id} />
        </div>

        {/* Raw results table */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Aggregated Results</p>
          {resultsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !results?.length ? (
            <p className="text-xs text-muted-foreground text-center py-4">No results recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b">
                  <tr className="text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Variant</th>
                    <th className="text-left py-2 pr-3 font-medium">Metric</th>
                    <th className="text-right py-2 pr-3 font-medium">Avg Value</th>
                    <th className="text-right py-2 font-medium">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            r.variant === 'a'
                              ? 'bg-blue-500/10 text-blue-600'
                              : 'bg-orange-500/10 text-orange-600'
                          )}
                        >
                          {r.variant.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-medium">{r.metric_name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {Number(r.avg_value).toFixed(4)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.total_samples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Create Experiment Dialog
// ============================================================================

function CreateExperimentDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    experiment_name: '',
    description: '',
    agent_id: '',
    traffic_split_pct: 50,
    variant_a_config: '{}',
    variant_b_config: '{}',
  });

  const create = useCreateExperiment();

  const handleSubmit = async () => {
    if (!form.experiment_name || !form.agent_id) {
      toast.error('Experiment name and Agent ID are required');
      return;
    }

    let variantA: Record<string, unknown> = {};
    let variantB: Record<string, unknown> = {};
    try {
      variantA = JSON.parse(form.variant_a_config);
      variantB = JSON.parse(form.variant_b_config);
    } catch {
      toast.error('Invalid JSON in variant configs');
      return;
    }

    try {
      await create.mutateAsync({
        experiment_name: form.experiment_name,
        description: form.description || undefined,
        agent_id: form.agent_id,
        traffic_split_pct: form.traffic_split_pct,
        variant_a_config: variantA,
        variant_b_config: variantB,
      });
      toast.success('Experiment created');
      setOpen(false);
      setForm({
        experiment_name: '',
        description: '',
        agent_id: '',
        traffic_split_pct: 50,
        variant_a_config: '{}',
        variant_b_config: '{}',
      });
    } catch {
      toast.error('Failed to create experiment');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Create Experiment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create A/B Experiment</DialogTitle>
          <DialogDescription>Configure a new A/B experiment for agent variants.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Experiment Name *</Label>
            <Input
              value={form.experiment_name}
              onChange={(e) => setForm((f) => ({ ...f, experiment_name: e.target.value }))}
              placeholder="e.g. prompt-v2-vs-v3"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Agent ID *</Label>
            <Input
              value={form.agent_id}
              onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              placeholder="agent_abc123"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Traffic Split (A: {form.traffic_split_pct}% / B: {100 - form.traffic_split_pct}%)</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.traffic_split_pct}
              onChange={(e) =>
                setForm((f) => ({ ...f, traffic_split_pct: parseInt(e.target.value, 10) }))
              }
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Variant A Config (JSON)</Label>
            <Textarea
              value={form.variant_a_config}
              onChange={(e) => setForm((f) => ({ ...f, variant_a_config: e.target.value }))}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Variant B Config (JSON)</Label>
            <Textarea
              value={form.variant_b_config}
              onChange={(e) => setForm((f) => ({ ...f, variant_b_config: e.target.value }))}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Experiment Card
// ============================================================================

function ExperimentCard({ experiment }: { experiment: ABExperiment }) {
  const [resultsOpen, setResultsOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopWinner, setStopWinner] = useState<'a' | 'b' | 'tie' | undefined>(undefined);

  const start = useStartExperiment();
  const stop = useStopExperiment();
  const del = useDeleteExperiment();

  const handleStart = async () => {
    try {
      await start.mutateAsync(experiment.id);
      toast.success('Experiment started');
    } catch {
      toast.error('Failed to start experiment');
    }
  };

  const handleStop = async () => {
    try {
      await stop.mutateAsync({ id: experiment.id, winner: stopWinner });
      toast.success('Experiment stopped');
      setStopDialogOpen(false);
    } catch {
      toast.error('Failed to stop experiment');
    }
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(experiment.id);
      toast.success('Experiment deleted');
    } catch {
      toast.error('Failed to delete experiment');
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{experiment.experiment_name}</CardTitle>
              <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                {experiment.agent_id}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge status={experiment.status} />
              {experiment.winner && <WinnerBadge winner={experiment.winner} />}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {experiment.description && (
            <p className="text-xs text-muted-foreground">{experiment.description}</p>
          )}

          <TrafficSplitBar pct={experiment.traffic_split_pct} />

          {experiment.started_at && (
            <p className="text-xs text-muted-foreground">
              Started: {new Date(experiment.started_at).toLocaleDateString()}
              {experiment.ended_at &&
                ` · Ended: ${new Date(experiment.ended_at).toLocaleDateString()}`}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {experiment.status === 'draft' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={handleStart}
                disabled={start.isPending}
              >
                <Play className="h-3 w-3 mr-1" />
                Start
              </Button>
            )}
            {experiment.status === 'running' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setStopDialogOpen(true)}
                disabled={stop.isPending}
              >
                <Square className="h-3 w-3 mr-1" />
                Stop
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setResultsOpen(true)}
            >
              <BarChart2 className="h-3 w-3 mr-1" />
              Results
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive ml-auto"
              onClick={handleDelete}
              disabled={del.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stop dialog */}
      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Stop Experiment</DialogTitle>
            <DialogDescription>
              Optionally declare a winner before stopping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Winner (optional)</Label>
            <Select
              value={stopWinner ?? 'none'}
              onValueChange={(v) =>
                setStopWinner(v === 'none' ? undefined : (v as 'a' | 'b' | 'tie'))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="No winner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No winner</SelectItem>
                <SelectItem value="a">Variant A</SelectItem>
                <SelectItem value="b">Variant B</SelectItem>
                <SelectItem value="tie">Tie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStop} disabled={stop.isPending}>
              {stop.isPending ? 'Stopping...' : 'Stop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resultsOpen && (
        <ExperimentResultsSheet
          experiment={experiment}
          open={resultsOpen}
          onClose={() => setResultsOpen(false)}
        />
      )}
    </>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function ABExperimentsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('');

  const filters = {
    agent_id: agentFilter || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  };

  const { data: experiments, isLoading } = useExperiments(filters);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">A/B Experiments</h2>
          <p className="text-sm text-muted-foreground">
            Compare agent variant configurations with statistical A/B testing.
          </p>
        </div>
        <CreateExperimentDialog />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Agent ID</Label>
          <Input
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            placeholder="Filter by agent..."
            className="h-8 w-52 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Experiment cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !experiments?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No experiments yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first A/B experiment to compare agent variant performance.
            </p>
            <div className="mt-4">
              <CreateExperimentDialog />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {experiments.map((exp) => (
            <ExperimentCard key={exp.id} experiment={exp} />
          ))}
        </div>
      )}
    </div>
  );
}
