'use client';

import React, { useState, useMemo } from 'react';
import {
  Gauge,
  Plus,
  Play,
  Trash2,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Trophy,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  useAgentBenchmarksV2,
  useCreateBenchmarkV2,
  useDeleteBenchmarkV2,
  useRunBenchmarkV2,
  useBenchmarkResultsV2,
  useBenchmarkSummaryV2,
  type BenchmarkDefinition,
} from '@/hooks/agents/use-agent-benchmarks-v2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarksScreenProps {
  agentId: string;
}

const BENCHMARK_TYPES = [
  { id: 'latency', label: 'Latency', unit: 'ms' },
  { id: 'throughput', label: 'Throughput', unit: 'ops/s' },
  { id: 'accuracy', label: 'Accuracy', unit: '%' },
  { id: 'cost', label: 'Cost', unit: '$' },
  { id: 'custom', label: 'Custom', unit: 'score' },
] as const;

const TYPE_COLORS: Record<string, string> = {
  latency: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  throughput: 'bg-green-500/10 text-green-500 border-green-500/20',
  accuracy: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  cost: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  custom: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BenchmarksScreen({ agentId }: BenchmarksScreenProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('latency');
  const [expandedBenchmark, setExpandedBenchmark] = useState<string | null>(null);

  const { data: benchmarksData, isLoading: benchmarksLoading } = useAgentBenchmarksV2(agentId);
  const { data: summaryData, isLoading: summaryLoading } = useBenchmarkSummaryV2(agentId);
  const createMutation = useCreateBenchmarkV2();
  const deleteMutation = useDeleteBenchmarkV2();
  const runMutation = useRunBenchmarkV2();

  const benchmarks = benchmarksData?.benchmarks ?? [];
  const summaries = summaryData?.summaries ?? [];

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate(
      { agentId, benchmark_name: newName.trim(), benchmark_type: newType },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setNewName('');
          setNewType('latency');
        },
      }
    );
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (benchmarksLoading) {
    return (
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-6 pb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </ScrollArea>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScrollArea className="flex-1 overflow-y-auto">
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Performance Benchmarks
            </h2>
            <p className="text-sm text-muted-foreground">
              Create, run, and track benchmarks for this agent.
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                New Benchmark
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Benchmark</DialogTitle>
                <DialogDescription>
                  Define a new benchmark to track agent performance.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Name</label>
                  <Input
                    placeholder="e.g., Response latency test"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Type</label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BENCHMARK_TYPES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label} ({t.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : null}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Section */}
        {!summaryLoading && summaries.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryStatCard
              icon={Trophy}
              label="Best Overall Score"
              value={
                (() => {
                  const best = summaries.reduce((max, s) =>
                    (s.best_score ?? -Infinity) > (max.best_score ?? -Infinity) ? s : max
                  , summaries[0]);
                  return best.best_score != null
                    ? `${best.best_score.toFixed(2)}`
                    : '--';
                })()
              }
              sub={
                (() => {
                  const best = summaries.reduce((max, s) =>
                    (s.best_score ?? -Infinity) > (max.best_score ?? -Infinity) ? s : max
                  , summaries[0]);
                  return best.benchmark_name;
                })()
              }
              color="green"
            />
            <SummaryStatCard
              icon={Activity}
              label="Total Benchmarks"
              value={String(benchmarks.length)}
              sub={`${summaries.reduce((sum, s) => sum + s.run_count, 0)} total runs`}
              color="blue"
            />
            <SummaryStatCard
              icon={TrendingUp}
              label="Avg Improvement"
              value={
                (() => {
                  const improvements = summaries
                    .filter((s) => s.improvement_pct != null)
                    .map((s) => s.improvement_pct!);
                  if (improvements.length === 0) return '--';
                  const avg = improvements.reduce((a, b) => a + b, 0) / improvements.length;
                  return `${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%`;
                })()
              }
              color="amber"
            />
          </div>
        )}

        {/* Benchmark List */}
        <SpotlightCard className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Benchmarks</h3>
            <Badge variant="outline" className="text-xs">
              {benchmarks.length} defined
            </Badge>
          </div>

          {benchmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Gauge className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No benchmarks defined yet.</p>
              <p className="text-xs mt-1">Click &quot;New Benchmark&quot; to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {benchmarks.map((b) => (
                <BenchmarkItem
                  key={b.id}
                  benchmark={b}
                  agentId={agentId}
                  isExpanded={expandedBenchmark === b.id}
                  onToggle={() =>
                    setExpandedBenchmark((prev) =>
                      prev === b.id ? null : b.id
                    )
                  }
                  onRun={() =>
                    runMutation.mutate({ agentId, benchmarkId: b.id })
                  }
                  onDelete={() =>
                    deleteMutation.mutate({ agentId, benchmarkId: b.id })
                  }
                  isRunning={
                    runMutation.isPending &&
                    runMutation.variables?.benchmarkId === b.id
                  }
                  isDeleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables?.benchmarkId === b.id
                  }
                />
              ))}
            </div>
          )}
        </SpotlightCard>
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorClasses = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  };

  return (
    <SpotlightCard className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold mt-0.5">{value}</p>
          {sub && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {sub}
            </p>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
}

function BenchmarkItem({
  benchmark,
  agentId,
  isExpanded,
  onToggle,
  onRun,
  onDelete,
  isRunning,
  isDeleting,
}: {
  benchmark: BenchmarkDefinition;
  agentId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  onDelete: () => void;
  isRunning: boolean;
  isDeleting: boolean;
}) {
  const typeColor =
    TYPE_COLORS[benchmark.benchmark_type] ??
    'bg-muted text-muted-foreground border-muted';

  return (
    <div className="rounded-lg border bg-card">
      {/* Row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={onToggle}
      >
        <div className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {benchmark.benchmark_name}
            </span>
            <Badge
              variant="outline"
              className={cn('text-xs font-normal border', typeColor)}
            >
              {benchmark.benchmark_type}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>
              Score:{' '}
              {benchmark.latest_score != null
                ? Number(benchmark.latest_score).toFixed(2)
                : '--'}
            </span>
            <span>
              Best:{' '}
              {benchmark.best_score != null
                ? Number(benchmark.best_score).toFixed(2)
                : '--'}
            </span>
            <span>Runs: {benchmark.run_count ?? 0}</span>
            {benchmark.latest_run_at && (
              <span>
                Last:{' '}
                {formatDistanceToNow(new Date(benchmark.latest_run_at), {
                  addSuffix: true,
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            onClick={onRun}
            disabled={isRunning}
          >
            {isRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Run
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Results */}
      {isExpanded && (
        <BenchmarkResultsPanel agentId={agentId} benchmarkId={benchmark.id} />
      )}
    </div>
  );
}

function BenchmarkResultsPanel({
  agentId,
  benchmarkId,
}: {
  agentId: string;
  benchmarkId: string;
}) {
  const { data, isLoading } = useBenchmarkResultsV2(agentId, benchmarkId);
  const results = data?.results ?? [];

  if (isLoading) {
    return (
      <div className="border-t p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="border-t p-4 text-center text-sm text-muted-foreground">
        No results yet. Click &quot;Run&quot; to execute this benchmark.
      </div>
    );
  }

  return (
    <div className="border-t">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 px-3 font-medium">Score</th>
              <th className="text-left py-2 px-3 font-medium">Metrics</th>
              <th className="text-right py-2 px-3 font-medium">Duration</th>
              <th className="text-left py-2 px-3 font-medium">Status</th>
              <th className="text-right py-2 px-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                key={r.id}
                className="border-b border-muted/30 hover:bg-muted/10 transition-colors"
              >
                <td className="py-2 px-3 font-medium tabular-nums">
                  {Number(r.score).toFixed(4)}
                </td>
                <td className="py-2 px-3 text-muted-foreground">
                  {r.metrics
                    ? Object.entries(r.metrics)
                        .filter(([k]) => k !== 'unit')
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ') || '--'
                    : '--'}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                  {r.duration_ms != null ? `${r.duration_ms}ms` : '--'}
                </td>
                <td className="py-2 px-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      r.status === 'completed'
                        ? 'text-green-500 border-green-500/30'
                        : r.status === 'failed'
                        ? 'text-red-500 border-red-500/30'
                        : 'text-amber-500 border-amber-500/30'
                    )}
                  >
                    {r.status}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right text-muted-foreground">
                  {r.run_at
                    ? formatDistanceToNow(new Date(r.run_at), {
                        addSuffix: true,
                      })
                    : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
