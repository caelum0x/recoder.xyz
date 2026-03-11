'use client';

import { useState } from 'react';
import {
  BarChart2,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Edit2,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useMetricsDashboard,
  useMetricDefinitions,
  useCreateMetricDef,
  useUpdateMetricDef,
  useDeleteMetricDef,
  useRecordMetricValue,
  useMetricValues,
  useMetricAggregate,
  type MetricDashboardItem,
  type MetricDefinition,
  type CreateMetricDefData,
} from '@/hooks/monitoring/use-custom-metrics';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Trend icon
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
// Sparkline (mini chart) using values
// ---------------------------------------------------------------------------

function Sparkline({
  metricId,
  color,
  chartType,
}: {
  metricId: string;
  color: string;
  chartType: string;
}) {
  const { data: values } = useMetricValues(metricId, 24);

  if (!values || values.length < 2) {
    return <div className="h-10 flex items-center justify-center text-xs text-muted-foreground">—</div>;
  }

  const chartData = values
    .slice(0, 20)
    .reverse()
    .map((v) => ({ v: parseFloat(String(v.value)) }));

  return (
    <ResponsiveContainer width="100%" height={40}>
      {chartType === 'bar' ? (
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  item,
  onSelect,
  selected,
}: {
  item: MetricDashboardItem;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const updateDef = useUpdateMetricDef();
  const deleteDef = useDeleteMetricDef();
  const { data: agg } = useMetricAggregate(item.id);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateDef.mutate(
      { metricId: item.id, data: { is_active: !item.is_active } },
      {
        onSuccess: () => toast.success(`Metric ${item.is_active ? 'deactivated' : 'activated'}`),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete metric "${item.display_name}" and all its data?`)) return;
    deleteDef.mutate(item.id, {
      onSuccess: () => toast.success('Metric deleted'),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md space-y-3 w-full',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-semibold text-sm truncate">{item.display_name}</span>
          </div>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleToggle}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            title={item.is_active ? 'Deactivate' : 'Activate'}
          >
            {item.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Latest value (large) */}
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold tabular-nums">
          {item.latest_value != null ? parseFloat(String(item.latest_value)).toFixed(2) : '—'}
        </span>
        <span className="text-sm text-muted-foreground mb-1">{item.unit}</span>
        {agg && <TrendIcon trend={agg.trend} />}
      </div>

      {/* Min / Max / Avg */}
      {agg && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Min</span>
            <p className="font-medium tabular-nums">
              {agg.min != null ? agg.min.toFixed(2) : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Avg</span>
            <p className="font-medium tabular-nums">
              {agg.avg != null ? agg.avg.toFixed(2) : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Max</span>
            <p className="font-medium tabular-nums">
              {agg.max != null ? agg.max.toFixed(2) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Sparkline */}
      <Sparkline metricId={item.id} color={item.color} chartType={item.chart_type} />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{item.aggregation} · {item.chart_type}</span>
        <span>{item.values_last_24h} values (24h)</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — chart + record form
// ---------------------------------------------------------------------------

function MetricDetail({ metricId }: { metricId: string }) {
  const { data: defs } = useMetricDefinitions();
  const def = defs?.find((d) => d.id === metricId);
  const { data: values, isLoading } = useMetricValues(metricId, 24);
  const recordValue = useRecordMetricValue();

  const [newValue, setNewValue] = useState('');
  const [dimensions, setDimensions] = useState<{ key: string; value: string }[]>([]);

  if (!def) return null;

  const chartData =
    values
      ?.slice()
      .reverse()
      .map((v) => ({
        time: new Date(v.recorded_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value: parseFloat(String(v.value)),
      })) ?? [];

  const handleAddDimension = () => {
    setDimensions((d) => [...d, { key: '', value: '' }]);
  };

  const handleRemoveDimension = (idx: number) => {
    setDimensions((d) => d.filter((_, i) => i !== idx));
  };

  const handleRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newValue);
    if (isNaN(val)) {
      toast.error('Enter a valid number');
      return;
    }
    const dims: Record<string, string> = {};
    for (const d of dimensions) {
      if (d.key) dims[d.key] = d.value;
    }
    recordValue.mutate(
      { metricId, data: { value: val, dimensions: dims } },
      {
        onSuccess: () => {
          toast.success('Value recorded');
          setNewValue('');
          setDimensions([]);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading values…</span>
        </div>
      );
    }
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-muted-foreground">No values recorded in the last 24h.</p>
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={200}>
        {def.chart_type === 'bar' ? (
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="value" name={def.display_name} fill={def.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : def.chart_type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${def.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={def.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={def.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              name={def.display_name}
              stroke={def.color}
              fill={`url(#grad-${def.id})`}
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={def.display_name}
              stroke={def.color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: def.color }} />
        <h3 className="font-semibold">{def.display_name}</h3>
        <span className="text-xs text-muted-foreground">({def.metric_name})</span>
      </div>

      {renderChart()}

      {/* Record value form */}
      <form onSubmit={handleRecord} className="space-y-3 pt-2 border-t border-border">
        <h4 className="text-sm font-medium">Record Value</h4>
        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            placeholder={`Value (${def.unit})`}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={recordValue.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {recordValue.isPending ? 'Saving…' : 'Record'}
          </button>
        </div>

        {/* Dimensions */}
        {dimensions.map((dim, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Key"
              value={dim.key}
              onChange={(e) =>
                setDimensions((d) =>
                  d.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item))
                )
              }
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Value"
              value={dim.value}
              onChange={(e) =>
                setDimensions((d) =>
                  d.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item))
                )
              }
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => handleRemoveDimension(idx)}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddDimension}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Dimension
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Metric dialog
// ---------------------------------------------------------------------------

const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count', 'last'] as const;
const CHART_TYPES = ['line', 'bar', 'area', 'gauge', 'number'] as const;
const DEFAULT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

function NewMetricDialog({ onClose }: { onClose: () => void }) {
  const createDef = useCreateMetricDef();
  const [form, setForm] = useState<CreateMetricDefData>({
    metric_name: '',
    display_name: '',
    description: '',
    unit: 'count',
    aggregation: 'sum',
    chart_type: 'line',
    color: '#6366f1',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDef.mutate(form, {
      onSuccess: () => {
        toast.success('Metric created');
        onClose();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">New Custom Metric</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Metric Name (slug)</label>
              <input
                type="text"
                placeholder="e.g. daily_signups"
                value={form.metric_name}
                onChange={(e) => setForm((f) => ({ ...f, metric_name: e.target.value }))}
                pattern="[a-z0-9_-]+"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Lowercase, underscores, hyphens only</p>
            </div>

            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Display Name</label>
              <input
                type="text"
                placeholder="Daily Sign-ups"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Description (optional)</label>
              <textarea
                placeholder="What does this metric measure?"
                value={form.description ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Unit</label>
              <input
                type="text"
                placeholder="count"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Aggregation</label>
              <select
                value={form.aggregation}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    aggregation: e.target.value as CreateMetricDefData['aggregation'],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {AGGREGATIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Chart Type</label>
              <select
                value={form.chart_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    chart_type: e.target.value as CreateMetricDefData['chart_type'],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {CHART_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 rounded border border-border cursor-pointer"
                />
                <div className="flex gap-1 flex-wrap">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
                        form.color === c ? 'border-foreground' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDef.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createDef.isPending ? 'Creating…' : 'Create Metric'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CustomMetricsPage() {
  const { data: dashboard, isLoading } = useMetricsDashboard();
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [showNewMetric, setShowNewMetric] = useState(false);

  const handleSelect = (id: string) => {
    setSelectedMetricId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex-1 overflow-auto">
      {showNewMetric && <NewMetricDialog onClose={() => setShowNewMetric(false)} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="h-6 w-6" />
              Custom Metrics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define, record, and visualize your own business and operational metrics.
            </p>
          </div>
          <button
            onClick={() => setShowNewMetric(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            New Metric
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading metrics…</span>
          </div>
        ) : !dashboard || dashboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <BarChart2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No metrics yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Create your first custom metric to start tracking and visualizing your data.
            </p>
            <button
              onClick={() => setShowNewMetric(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Metric
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Metric cards grid */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dashboard.map((item) => (
                <MetricCard
                  key={item.id}
                  item={item}
                  onSelect={handleSelect}
                  selected={selectedMetricId === item.id}
                />
              ))}
            </div>

            {/* Detail panel */}
            <div className="lg:col-span-1">
              {selectedMetricId ? (
                <MetricDetail metricId={selectedMetricId} />
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 flex flex-col items-center justify-center text-center h-64">
                  <Edit2 className="h-6 w-6 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Select a metric card to view details and record values.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
