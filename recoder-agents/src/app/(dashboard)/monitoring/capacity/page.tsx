'use client';

import { useState } from 'react';
import {
  BarChart2,
  Plus,
  Bell,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Trash2,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useCurrentMetrics,
  useCapacityPlans,
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
  useCapacityAlerts,
  useSetCapacityAlert,
  useCheckCapacity,
  useRecordMetric,
  type CapacityPlan,
  type CapacityAlert,
} from '@/hooks/monitoring/use-capacity-planning';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usagePct(current: number, max: number | null): number | null {
  if (!max || max <= 0) return null;
  return Math.min((current / max) * 100, 100);
}

function gaugeColor(pct: number | null): string {
  if (pct === null) return 'bg-muted';
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

function gaugeTextColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 90) return 'text-red-600 dark:text-red-400';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-muted/60 text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Record Metric Dialog
// ---------------------------------------------------------------------------

function RecordMetricDialog({ onClose }: { onClose: () => void }) {
  const recordMetric = useRecordMetric();
  const [form, setForm] = useState({
    metric_name: '',
    current_value: 0,
    max_capacity: '',
    unit: 'count',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    recordMetric.mutate(
      {
        metric_name: form.metric_name,
        current_value: form.current_value,
        max_capacity: form.max_capacity ? parseFloat(form.max_capacity) : undefined,
        unit: form.unit || 'count',
      },
      {
        onSuccess: () => {
          toast.success('Metric recorded');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">Record Metric</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Metric Name</label>
            <input
              type="text"
              required
              value={form.metric_name}
              onChange={(e) => setForm((f) => ({ ...f, metric_name: e.target.value }))}
              placeholder="e.g. api_requests, storage_gb"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Current Value</label>
            <input
              type="number"
              step="any"
              required
              value={form.current_value}
              onChange={(e) => setForm((f) => ({ ...f, current_value: parseFloat(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Max Capacity (optional)</label>
            <input
              type="number"
              step="any"
              value={form.max_capacity}
              onChange={(e) => setForm((f) => ({ ...f, max_capacity: e.target.value }))}
              placeholder="Leave blank if unlimited"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Unit</label>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="count, GB, ms, ..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
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
              disabled={recordMetric.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {recordMetric.isPending ? 'Recording…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Plan Dialog
// ---------------------------------------------------------------------------

function CreatePlanDialog({ onClose }: { onClose: () => void }) {
  const createPlan = useCreatePlan();
  const [form, setForm] = useState({
    plan_name: '',
    description: '',
    target_date: '',
    status: 'draft',
    recommendations: '',
    metric_projections: '',
    growth_assumptions: '',
  });
  const [jsonError, setJsonError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setJsonError('');

    let metric_projections: Record<string, unknown>[] = [];
    let growth_assumptions: Record<string, unknown> = {};

    try {
      if (form.metric_projections.trim()) {
        metric_projections = JSON.parse(form.metric_projections);
      }
    } catch {
      setJsonError('Metric Projections must be valid JSON array');
      return;
    }

    try {
      if (form.growth_assumptions.trim()) {
        growth_assumptions = JSON.parse(form.growth_assumptions);
      }
    } catch {
      setJsonError('Growth Assumptions must be valid JSON object');
      return;
    }

    const recommendations = form.recommendations
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    createPlan.mutate(
      {
        plan_name: form.plan_name,
        description: form.description || undefined,
        target_date: form.target_date || undefined,
        metric_projections,
        growth_assumptions,
        recommendations,
      },
      {
        onSuccess: () => {
          toast.success('Plan created');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-6">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">Create Capacity Plan</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Plan Name</label>
            <input
              type="text"
              required
              value={form.plan_name}
              onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Target Date</label>
            <input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {['draft', 'active', 'completed', 'archived'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Recommendations (one per line)
            </label>
            <textarea
              value={form.recommendations}
              onChange={(e) => setForm((f) => ({ ...f, recommendations: e.target.value }))}
              rows={3}
              placeholder="Scale database by 2x&#10;Add caching layer"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Metric Projections (JSON array)
            </label>
            <textarea
              value={form.metric_projections}
              onChange={(e) => setForm((f) => ({ ...f, metric_projections: e.target.value }))}
              rows={3}
              placeholder='[{"metric":"api_requests","projected":50000}]'
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Growth Assumptions (JSON object)
            </label>
            <textarea
              value={form.growth_assumptions}
              onChange={(e) => setForm((f) => ({ ...f, growth_assumptions: e.target.value }))}
              rows={3}
              placeholder='{"monthly_growth_pct":20}'
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none font-mono text-xs"
            />
          </div>
          {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
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
              disabled={createPlan.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createPlan.isPending ? 'Creating…' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert Row
// ---------------------------------------------------------------------------

function AlertRow({ alert }: { alert: CapacityAlert }) {
  const setAlert = useSetCapacityAlert();
  const [threshold, setThreshold] = useState(alert.threshold_pct);

  const handleThresholdChange = (val: number) => {
    setThreshold(val);
    setAlert.mutate(
      { metric_name: alert.metric_name, threshold_pct: val, is_active: alert.is_active },
      { onError: (e) => toast.error(e.message) }
    );
  };

  const handleToggle = () => {
    setAlert.mutate(
      { metric_name: alert.metric_name, threshold_pct: threshold, is_active: !alert.is_active },
      {
        onSuccess: () => toast.success(`Alert ${alert.is_active ? 'disabled' : 'enabled'}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const pct = alert.usage_pct;

  return (
    <tr className="border-b border-border last:border-b-0 text-sm">
      <td className="px-4 py-3 font-medium font-mono text-xs">{alert.metric_name}</td>
      <td className="px-4 py-3 w-48">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            onMouseUp={(e) => handleThresholdChange(parseInt((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => handleThresholdChange(parseInt((e.target as HTMLInputElement).value))}
            className="w-full accent-primary"
          />
          <span className="text-xs tabular-nums w-8">{threshold}%</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleToggle}
          disabled={setAlert.isPending}
          className={cn(
            'text-xs px-2 py-1 rounded-full transition-colors',
            alert.is_active
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {alert.is_active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className={cn('px-4 py-3 tabular-nums text-sm', gaugeTextColor(pct))}>
        {pct !== null ? `${pct.toFixed(1)}%` : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {alert.last_triggered_at
          ? new Date(alert.last_triggered_at).toLocaleString()
          : '—'}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CapacityPlanningPage() {
  const { data: metrics, isLoading: metricsLoading } = useCurrentMetrics();
  const { data: plans, isLoading: plansLoading } = useCapacityPlans();
  const { data: alerts, isLoading: alertsLoading } = useCapacityAlerts();
  const checkCapacity = useCheckCapacity();
  const deletePlan = useDeletePlan();
  const updatePlan = useUpdatePlan();
  const setAlert = useSetCapacityAlert();

  const [showRecordMetric, setShowRecordMetric] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [newAlertMetric, setNewAlertMetric] = useState('');

  const handleCheckAll = () => {
    checkCapacity.mutate(undefined, {
      onSuccess: (result) => {
        if (result.triggered.length > 0) {
          toast.error(`${result.triggered.length} alert(s) triggered`);
        } else {
          toast.success('All alerts checked — none triggered');
        }
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleDeletePlan = (id: string) => {
    deletePlan.mutate(id, {
      onSuccess: () => toast.success('Plan deleted'),
      onError: (e) => toast.error(e.message),
    });
  };

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlertMetric.trim()) return;
    setAlert.mutate(
      { metric_name: newAlertMetric.trim(), threshold_pct: 80, is_active: true },
      {
        onSuccess: () => {
          toast.success('Alert rule added');
          setNewAlertMetric('');
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      {showRecordMetric && <RecordMetricDialog onClose={() => setShowRecordMetric(false)} />}
      {showCreatePlan && <CreatePlanDialog onClose={() => setShowCreatePlan(false)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="h-6 w-6" />
              Capacity Planning
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track capacity metrics, plan for growth, and configure alert rules.
            </p>
          </div>
          <button
            onClick={() => setShowRecordMetric(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Record Metric
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Current Metrics
            </h2>
          </div>
          {metricsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : metrics && metrics.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {metrics.map((m) => {
                const pct = usagePct(m.current_value, m.max_capacity);
                return (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border bg-background p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium font-mono">{m.metric_name}</span>
                      <span className={cn('text-sm font-bold tabular-nums', gaugeTextColor(pct))}>
                        {m.current_value.toLocaleString()}
                        {m.unit !== 'count' ? ` ${m.unit}` : ''}
                      </span>
                    </div>
                    {m.max_capacity !== null && (
                      <>
                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-700',
                              gaugeColor(pct)
                            )}
                            style={{ width: `${pct ?? 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pct?.toFixed(0)}% of {m.max_capacity.toLocaleString()}{' '}
                          {m.unit !== 'count' ? m.unit : ''}
                        </p>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.recorded_at).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <BarChart2 className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No metrics recorded yet. Click &ldquo;Record Metric&rdquo; to start tracking.
              </p>
            </div>
          )}
        </div>

        {/* Capacity Plans */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Capacity Plans
            </h2>
            <button
              onClick={() => setShowCreatePlan(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Plan
            </button>
          </div>
          {plansLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : plans && plans.length > 0 ? (
            <div className="divide-y divide-border">
              {plans.map((plan: CapacityPlan) => (
                <div key={plan.id} className="px-4 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{plan.plan_name}</span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          STATUS_COLORS[plan.status] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {plan.status}
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {plan.description}
                      </p>
                    )}
                    {plan.target_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Target: {new Date(plan.target_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={plan.status}
                      onChange={(e) =>
                        updatePlan.mutate(
                          { id: plan.id, data: { status: e.target.value as CapacityPlan['status'] } },
                          { onError: (err) => toast.error(err.message) }
                        )
                      }
                      className="text-xs rounded-lg border border-border bg-background px-2 py-1"
                    >
                      {['draft', 'active', 'completed', 'archived'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      disabled={deletePlan.isPending}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No capacity plans yet. Create one to start planning for growth.
              </p>
            </div>
          )}
        </div>

        {/* Alert Rules */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Alert Rules
            </h2>
            <button
              onClick={handleCheckAll}
              disabled={checkCapacity.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {checkCapacity.isPending ? 'Checking…' : 'Check All Alerts'}
            </button>
          </div>

          {/* Add alert rule form */}
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <form onSubmit={handleAddAlert} className="flex items-center gap-2">
              <input
                type="text"
                value={newAlertMetric}
                onChange={(e) => setNewAlertMetric(e.target.value)}
                placeholder="Metric name to watch…"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={setAlert.isPending || !newAlertMetric.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Alert
              </button>
            </form>
          </div>

          {alertsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : alerts && alerts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Metric</th>
                    <th className="px-4 py-2 text-left">Threshold</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Usage %</th>
                    <th className="px-4 py-2 text-left">Last Triggered</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert: CapacityAlert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No alert rules configured. Add a metric name above to set an alert.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
