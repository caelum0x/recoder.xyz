'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  GitCompare,
  BarChart3,
  Save,
  Trash2,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Eye,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useLiveComparison,
  useCreateComparison,
  useSavedComparisons,
  useDeleteComparison,
  useComparison,
} from '@/hooks/agents/use-agent-comparison';
import type { AgentMetricsSummary, SavedComparison } from '@/lib/api/agent-comparison';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

// ============================================================================
// Constants
// ============================================================================

const METRIC_ROWS = [
  { key: 'success_rate', label: 'Success Rate (%)', format: (v: number) => `${v.toFixed(1)}%`, higherIsBetter: true },
  { key: 'avg_latency_ms', label: 'Avg Latency (ms)', format: (v: number) => `${v.toFixed(0)}ms`, higherIsBetter: false },
  { key: 'avg_cost', label: 'Avg Cost ($)', format: (v: number) => `$${v.toFixed(4)}`, higherIsBetter: false },
  { key: 'total_runs', label: 'Total Runs', format: (v: number) => v.toLocaleString(), higherIsBetter: true },
  { key: 'avg_tokens', label: 'Avg Tokens', format: (v: number) => v.toLocaleString(), higherIsBetter: false },
  { key: 'health_score', label: 'Health Score', format: (v: number) => v.toFixed(1), higherIsBetter: true },
] as const;

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
];

const RADAR_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
];

// ============================================================================
// Helpers
// ============================================================================

function normalizeMetric(value: number, metricKey: string, agents: AgentMetricsSummary[]): number {
  const allValues = agents.map((a) => (a as unknown as Record<string, unknown>)[metricKey] as number);
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  if (max === min) return 50;

  const metric = METRIC_ROWS.find((m) => m.key === metricKey);
  const normalized = ((value - min) / (max - min)) * 100;
  // For metrics where lower is better, invert the normalization
  if (metric && !metric.higherIsBetter) {
    return 100 - normalized;
  }
  return normalized;
}

function getBestWorst(
  agents: AgentMetricsSummary[],
  metricKey: string,
  higherIsBetter: boolean
): { bestIdx: number; worstIdx: number } {
  if (agents.length === 0) return { bestIdx: -1, worstIdx: -1 };

  const values = agents.map((a) => (a as unknown as Record<string, unknown>)[metricKey] as number);
  const bestVal = higherIsBetter ? Math.max(...values) : Math.min(...values);
  const worstVal = higherIsBetter ? Math.min(...values) : Math.max(...values);

  const bestIdx = values.indexOf(bestVal);
  const worstIdx = values.indexOf(worstVal);

  // Don't highlight best/worst if all values are the same
  if (bestVal === worstVal) return { bestIdx: -1, worstIdx: -1 };

  return { bestIdx, worstIdx };
}

// ============================================================================
// Sub-components
// ============================================================================

function AgentSelector({
  agentIds,
  onAdd,
  onRemove,
}: {
  agentIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed && !agentIds.includes(trimmed) && agentIds.length < 5) {
      onAdd(trimmed);
      setInputValue('');
    }
  }, [inputValue, agentIds, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Enter agent ID..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
          disabled={agentIds.length >= 5}
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!inputValue.trim() || agentIds.length >= 5}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {agentIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agentIds.map((id) => (
            <Badge
              key={id}
              variant="secondary"
              className="gap-1 py-1 px-2 font-mono text-xs"
            >
              {id.length > 12 ? `${id.slice(0, 12)}...` : id}
              <button
                onClick={() => onRemove(id)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {agentIds.length}/5 agents selected (min 2 required)
      </p>
    </div>
  );
}

function ComparisonTable({ agents }: { agents: AgentMetricsSummary[] }) {
  if (agents.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Comparison Matrix
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Metric</TableHead>
                {agents.map((agent) => (
                  <TableHead key={agent.agent_id} className="text-center min-w-[120px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-semibold text-foreground truncate max-w-[120px]">
                        {agent.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {agent.agent_id.slice(0, 8)}...
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRIC_ROWS.map((metric) => {
                const { bestIdx, worstIdx } = getBestWorst(
                  agents,
                  metric.key,
                  metric.higherIsBetter
                );

                return (
                  <TableRow key={metric.key}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {metric.higherIsBetter ? (
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {metric.label}
                      </div>
                    </TableCell>
                    {agents.map((agent, idx) => {
                      const value = (agent as unknown as Record<string, unknown>)[metric.key] as number;
                      const isBest = idx === bestIdx;
                      const isWorst = idx === worstIdx;

                      return (
                        <TableCell
                          key={agent.agent_id}
                          className={cn(
                            'text-center font-mono text-sm transition-colors',
                            isBest && 'bg-green-500/10 text-green-700 dark:text-green-400 font-semibold',
                            isWorst && 'bg-red-500/10 text-red-700 dark:text-red-400'
                          )}
                        >
                          {metric.format(value)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonRadarChart({ agents }: { agents: AgentMetricsSummary[] }) {
  const radarData = useMemo(() => {
    return METRIC_ROWS.map((metric) => {
      const entry: Record<string, unknown> = { metric: metric.label };
      agents.forEach((agent) => {
        const value = (agent as unknown as Record<string, unknown>)[metric.key] as number;
        entry[agent.agent_id] = Math.round(normalizeMetric(value, metric.key, agents));
      });
      return entry;
    });
  }, [agents]);

  if (agents.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompare className="h-4 w-4" />
          Performance Radar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              {agents.map((agent, idx) => (
                <Radar
                  key={agent.agent_id}
                  name={agent.name}
                  dataKey={agent.agent_id}
                  stroke={RADAR_COLORS[idx % RADAR_COLORS.length]}
                  fill={RADAR_COLORS[idx % RADAR_COLORS.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 12, color: 'hsl(var(--foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                  fontSize: 12,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function SaveComparisonDialog({
  agentIds,
  onSaved,
}: {
  agentIds: string[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const createMutation = useCreateComparison();

  const handleSave = useCallback(async () => {
    try {
      await createMutation.mutateAsync({
        name: name.trim() || undefined,
        agent_ids: agentIds,
      });
      setName('');
      setOpen(false);
      onSaved();
    } catch {
      // Error handled by mutation
    }
  }, [name, agentIds, createMutation, onSaved]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={agentIds.length < 2}>
          <Save className="h-4 w-4 mr-1" />
          Save Comparison
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Comparison</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name (optional)</label>
            <Input
              placeholder="e.g., Q1 Agent Performance"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Comparing {agentIds.length} agents. Metrics will be captured at the current point in
              time.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SavedComparisonsList() {
  const { data: comparisons, isLoading } = useSavedComparisons();
  const deleteMutation = useDeleteComparison();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const { data: viewingComparison } = useComparison(viewingId);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="pt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!comparisons || comparisons.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Save className="h-4 w-4" />
          Saved Comparisons
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {comparisons.map((comp: SavedComparison) => (
            <div
              key={comp.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {comp.name || 'Unnamed Comparison'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {comp.agent_ids.length} agents
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comp.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewingId(viewingId === comp.id ? null : comp.id)}
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(comp.id)}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Inline view of selected comparison */}
        {viewingId && viewingComparison && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-3">
              {viewingComparison.name || 'Unnamed Comparison'} — Saved Snapshots
            </h4>
            {viewingComparison.metrics && Object.keys(viewingComparison.metrics).length > 0 ? (
              <ComparisonTable
                agents={Object.values(viewingComparison.metrics) as AgentMetricsSummary[]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No metric data available.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AgentComparePage() {
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [period, setPeriod] = useState('30d');
  const [hasCompared, setHasCompared] = useState(false);

  const {
    data: liveResult,
    isLoading: isComparing,
    refetch,
  } = useLiveComparison(
    hasCompared ? agentIds : [],
    period
  );

  const handleAddAgent = useCallback((id: string) => {
    setAgentIds((prev) => [...prev, id]);
    setHasCompared(false);
  }, []);

  const handleRemoveAgent = useCallback((id: string) => {
    setAgentIds((prev) => prev.filter((a) => a !== id));
    setHasCompared(false);
  }, []);

  const handleCompare = useCallback(() => {
    if (agentIds.length >= 2) {
      setHasCompared(true);
      refetch();
    }
  }, [agentIds, refetch]);

  const handlePeriodChange = useCallback(
    (value: string) => {
      setPeriod(value);
      if (hasCompared) {
        // refetch will happen automatically because period changes the query key
      }
    },
    [hasCompared]
  );

  const agents = liveResult?.agents || [];

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <GitCompare className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agent Comparison</h1>
            <p className="text-sm text-muted-foreground">
              <Link href="/agents" className="hover:underline">
                Agents
              </Link>
              <span className="mx-1.5">/</span>
              Compare
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Agent Selector */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Agents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AgentSelector
            agentIds={agentIds}
            onAdd={handleAddAgent}
            onRemove={handleRemoveAgent}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCompare}
              disabled={agentIds.length < 2 || isComparing}
            >
              {isComparing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <GitCompare className="h-4 w-4 mr-1" />
              )}
              Compare
            </Button>
            {hasCompared && agents.length > 0 && (
              <SaveComparisonDialog
                agentIds={agentIds}
                onSaved={() => {}}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isComparing && (
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Comparing agents...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {hasCompared && !isComparing && agents.length > 0 && (
        <>
          {/* Comparison Matrix Table */}
          <ComparisonTable agents={agents} />

          {/* Radar Chart */}
          <ComparisonRadarChart agents={agents} />
        </>
      )}

      {/* Empty result after comparison */}
      {hasCompared && !isComparing && agents.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitCompare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No data found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No analytics data found for the selected agents. Make sure the agent IDs are correct
              and the agents have completed runs.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Saved Comparisons */}
      <SavedComparisonsList />
    </div>
  );
}
