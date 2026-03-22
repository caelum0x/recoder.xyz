'use client';

import { useState } from 'react';
import {
  GitCompare,
  Trophy,
  Target,
  TrendingUp,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useComparisons,
  useComparison,
  useComparisonSummary,
  useCreateComparison,
  useDeleteComparison,
  useRecordComparisonMetric,
  useUpdateComparison,
} from '@/hooks/agents/use-agent-comparison-v2';
import type { AgentComparison, ComparisonSummary } from '@/lib/api/agent-comparison-v2';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ============================================================================
// Constants
// ============================================================================

const BAR_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
];

// ============================================================================
// Create Comparison Dialog
// ============================================================================

function CreateComparisonDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [comparisonName, setComparisonName] = useState('');
  const [agentIdsInput, setAgentIdsInput] = useState('');
  const [metricsInput, setMetricsInput] = useState('');
  const [notes, setNotes] = useState('');
  const createMutation = useCreateComparison();

  const handleSubmit = async () => {
    if (!comparisonName.trim() || !agentIdsInput.trim()) return;
    const agentIds = agentIdsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const comparisonMetrics = metricsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (agentIds.length === 0) return;

    try {
      await createMutation.mutateAsync({
        comparison_name: comparisonName.trim(),
        agent_ids: agentIds,
        comparison_metrics: comparisonMetrics,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      setComparisonName('');
      setAgentIdsInput('');
      setMetricsInput('');
      setNotes('');
      onCreated();
    } catch {
      // handled by mutation
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Comparison
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">New Agent Comparison</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Comparison Name <span className="text-red-500">*</span>
            </label>
            <input
              value={comparisonName}
              onChange={(e) => setComparisonName(e.target.value)}
              placeholder="e.g., Q1 Performance Review"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Agent IDs <span className="text-red-500">*</span>
            </label>
            <input
              value={agentIdsInput}
              onChange={(e) => setAgentIdsInput(e.target.value)}
              placeholder="agent-id-1, agent-id-2, agent-id-3"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Comma-separated agent IDs</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Metrics to Track</label>
            <input
              value={metricsInput}
              onChange={(e) => setMetricsInput(e.target.value)}
              placeholder="accuracy, latency, cost"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Comma-separated metric names</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this comparison"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-sm font-medium rounded-md border border-input hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              createMutation.isPending || !comparisonName.trim() || !agentIdsInput.trim()
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Record Metric Form
// ============================================================================

function RecordMetricForm({ comparison }: { comparison: AgentComparison }) {
  const [agentId, setAgentId] = useState(comparison.agent_ids[0] ?? '');
  const [metricName, setMetricName] = useState(comparison.comparison_metrics[0] ?? '');
  const [metricValue, setMetricValue] = useState('');
  const recordMutation = useRecordComparisonMetric();

  const handleSubmit = async () => {
    const val = parseFloat(metricValue);
    if (!agentId || !metricName || isNaN(val)) return;
    try {
      await recordMutation.mutateAsync({
        comparisonId: comparison.id,
        data: { agent_id: agentId, metric_name: metricName, metric_value: val },
      });
      setMetricValue('');
    } catch {
      // handled
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Record Metric</p>
      <div className="flex items-center gap-2 flex-wrap">
        {comparison.agent_ids.length > 0 ? (
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {comparison.agent_ids.map((id) => (
              <option key={id} value={id}>
                {id.length > 20 ? `${id.slice(0, 20)}...` : id}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="Agent ID"
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-40"
          />
        )}

        {comparison.comparison_metrics.length > 0 ? (
          <select
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {comparison.comparison_metrics.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            placeholder="Metric name"
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-32"
          />
        )}

        <input
          type="number"
          value={metricValue}
          onChange={(e) => setMetricValue(e.target.value)}
          placeholder="Value"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-24"
        />

        <button
          onClick={handleSubmit}
          disabled={recordMutation.isPending || !agentId || !metricName || !metricValue}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {recordMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Target className="h-3.5 w-3.5" />
          )}
          Record
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Summary Table
// ============================================================================

function SummaryTable({
  summary,
  agentIds,
}: {
  summary: ComparisonSummary;
  agentIds: string[];
}) {
  const metrics = Object.keys(summary);
  if (metrics.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">Metric Summary</p>
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Metric</th>
              {agentIds.map((id) => (
                <th key={id} className="text-center px-3 py-2 font-medium text-muted-foreground">
                  <span className="font-mono text-xs">
                    {id.length > 14 ? `${id.slice(0, 14)}...` : id}
                  </span>
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Best</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const data = summary[metric];
              const bestId = data.best_agent_id;
              return (
                <tr key={metric} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    {metric}
                  </td>
                  {agentIds.map((id) => {
                    const val = data[id];
                    const isBest = id === bestId;
                    return (
                      <td
                        key={id}
                        className={cn(
                          'px-3 py-2 text-center font-mono text-sm tabular-nums',
                          isBest &&
                            'bg-green-500/10 text-green-700 dark:text-green-400 font-semibold'
                        )}
                      >
                        {val != null ? (typeof val === 'number' ? val.toFixed(4) : val) : '--'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    {bestId ? (
                      <div className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                        <Trophy className="h-3.5 w-3.5" />
                        <span className="font-mono">
                          {bestId.length > 10 ? `${bestId.slice(0, 10)}...` : bestId}
                        </span>
                      </div>
                    ) : (
                      '--'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Bar Chart
// ============================================================================

function ComparisonBarChart({
  summary,
  agentIds,
}: {
  summary: ComparisonSummary;
  agentIds: string[];
}) {
  const metrics = Object.keys(summary);
  if (metrics.length === 0 || agentIds.length === 0) return null;

  const chartData = metrics.map((metric) => {
    const entry: Record<string, number | string> = { metric };
    agentIds.forEach((id) => {
      const shortId = id.length > 10 ? `${id.slice(0, 10)}...` : id;
      entry[shortId] = summary[metric][id] ?? 0;
    });
    return entry;
  });

  const agentKeys = agentIds.map((id) =>
    id.length > 10 ? `${id.slice(0, 10)}...` : id
  );

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">Performance Chart</p>
      <div className="w-full h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="metric"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
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
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'hsl(var(--foreground))' }}
            />
            {agentKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={BAR_COLORS[idx % BAR_COLORS.length]}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Detail Panel
// ============================================================================

function ComparisonDetail({ comparisonId }: { comparisonId: string }) {
  const { data: comparison, isLoading } = useComparison(comparisonId);
  const { data: summary, isLoading: summaryLoading } = useComparisonSummary(comparisonId);
  const updateMutation = useUpdateComparison();
  const [notes, setNotes] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!comparison) return null;

  const currentNotes = notes ?? comparison.notes ?? '';

  const handleSaveNotes = async () => {
    try {
      await updateMutation.mutateAsync({ id: comparison.id, data: { notes: currentNotes } });
      setEditingNotes(false);
    } catch {
      // handled
    }
  };

  return (
    <div className="space-y-5 px-4 pb-4">
      {/* Agents header */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Agents Being Compared</p>
        <div className="flex items-center gap-2 flex-wrap">
          {comparison.agent_ids.map((id) => (
            <span
              key={id}
              className="text-xs px-2 py-1 rounded-md bg-muted font-mono border border-border"
            >
              {id}
            </span>
          ))}
        </div>
      </div>

      {/* Record metric form */}
      <RecordMetricForm comparison={comparison} />

      {/* Summary */}
      {summaryLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading summary...
        </div>
      ) : summary && Object.keys(summary).length > 0 ? (
        <>
          <SummaryTable summary={summary} agentIds={comparison.agent_ids} />
          <ComparisonBarChart summary={summary} agentIds={comparison.agent_ids} />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No metric data yet. Record some metrics above.
        </p>
      )}

      {/* Notes */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">Notes</p>
          {!editingNotes ? (
            <button
              onClick={() => {
                setNotes(comparison.notes ?? '');
                setEditingNotes(true);
              }}
              className="text-xs text-primary hover:underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditingNotes(false)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={updateMutation.isPending}
                className="text-xs text-primary hover:underline"
              >
                Save
              </button>
            </div>
          )}
        </div>
        {editingNotes ? (
          <textarea
            value={currentNotes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {comparison.notes || 'No notes yet.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Row
// ============================================================================

function ComparisonRow({ comparison }: { comparison: AgentComparison }) {
  const [expanded, setExpanded] = useState(false);
  const deleteMutation = useDeleteComparison();

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <GitCompare className="h-4 w-4 text-blue-500 shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{comparison.comparison_name}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{comparison.agent_ids.length} agents</span>
            {comparison.comparison_metrics.length > 0 && (
              <span>{comparison.comparison_metrics.length} metrics</span>
            )}
            <span>{new Date(comparison.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteMutation.mutate(comparison.id);
          }}
          disabled={deleteMutation.isPending}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive shrink-0 ml-2"
          title="Delete comparison"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 pt-4">
          <ComparisonDetail comparisonId={comparison.id} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <GitCompare className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No comparisons yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Create one to start comparing agent performance across custom metrics.
      </p>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AgentComparisonPage() {
  const { data: comparisons, isLoading } = useComparisons();

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <GitCompare className="h-6 w-6" />
              Agent Comparison
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compare agents across custom metrics and track performance over time.
            </p>
          </div>
          <CreateComparisonDialog onCreated={() => {}} />
        </div>

        {/* Comparison list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading comparisons...</span>
            </div>
          ) : comparisons && comparisons.length > 0 ? (
            comparisons.map((comp) => <ComparisonRow key={comp.id} comparison={comp} />)
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}
