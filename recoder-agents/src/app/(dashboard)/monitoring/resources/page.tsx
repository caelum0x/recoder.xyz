'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Activity,
  Bell,
  BellOff,
  Plus,
  Trash2,
  RefreshCw,
  Server,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useCurrentResources,
  useResourceHistory,
  useAlertRules,
  useCreateAlertRule,
  useUpdateAlertRule,
  useDeleteAlertRule,
  useCheckAlerts,
  useRecordSnapshot,
  type ResourceAlertRule,
  type CreateAlertRuleData,
} from '@/hooks/monitoring/use-resource-monitoring';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function pctColor(pct: number) {
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 60) return 'bg-amber-500';
  return 'bg-green-500';
}

function pctTextColor(pct: number) {
  if (pct >= 80) return 'text-red-600 dark:text-red-400';
  if (pct >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

// ---------------------------------------------------------------------------
// GaugeBar — styled progress bar for a single metric
// ---------------------------------------------------------------------------

function GaugeBar({
  label,
  value,
  max = 100,
  unit = '%',
  icon: Icon,
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  icon: React.ElementType;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className={cn('text-lg font-bold tabular-nums', pctTextColor(pct))}>
          {value.toFixed(1)}
          {unit}
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', pctColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{pct.toFixed(0)}% of {max}{unit}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time-series chart
// ---------------------------------------------------------------------------

function ResourceHistoryChart({ agentId }: { agentId?: string }) {
  const { data: history, isLoading } = useResourceHistory(agentId, 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading history...</span>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-muted-foreground">No history data in the past hour.</p>
      </div>
    );
  }

  const chartData = history.map((b) => ({
    time: new Date(b.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: parseFloat((b.avg_cpu ?? 0).toFixed(1)),
    memory: parseFloat((b.avg_memory ?? 0).toFixed(1)),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} unit="%" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Area
          type="monotone"
          dataKey="cpu"
          name="CPU %"
          stroke="#6366f1"
          fill="url(#cpuGrad)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="memory"
          name="Memory %"
          stroke="#22c55e"
          fill="url(#memGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Per-agent resource row
// ---------------------------------------------------------------------------

function AgentResourceRow({
  snapshot,
}: {
  snapshot: {
    id: string;
    agent_id: string | null;
    cpu_percent: number;
    memory_mb: number;
    memory_percent: number;
    disk_mb: number;
    active_connections: number;
    recorded_at: string;
  };
}) {
  return (
    <tr className="border-b border-border last:border-b-0 text-sm">
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {snapshot.agent_id ? snapshot.agent_id.slice(0, 12) + '...' : 'global'}
      </td>
      <td className={cn('px-4 py-3 tabular-nums font-medium', pctTextColor(snapshot.cpu_percent))}>
        {snapshot.cpu_percent.toFixed(1)}%
      </td>
      <td className={cn('px-4 py-3 tabular-nums font-medium', pctTextColor(snapshot.memory_percent))}>
        {snapshot.memory_mb.toFixed(0)} MB ({snapshot.memory_percent.toFixed(1)}%)
      </td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">
        {snapshot.disk_mb.toFixed(0)} MB
      </td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">
        {snapshot.active_connections}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(snapshot.recorded_at).toLocaleTimeString()}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Alert rule row
// ---------------------------------------------------------------------------

function AlertRuleRow({ rule }: { rule: ResourceAlertRule }) {
  const updateRule = useUpdateAlertRule();
  const deleteRule = useDeleteAlertRule();

  const handleToggle = () => {
    updateRule.mutate(
      { ruleId: rule.id, data: { is_active: !rule.is_active } },
      {
        onSuccess: () => toast.success(`Alert rule ${rule.is_active ? 'disabled' : 'enabled'}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = () => {
    deleteRule.mutate(rule.id, {
      onSuccess: () => toast.success('Alert rule deleted'),
      onError: (e) => toast.error(e.message),
    });
  };

  const comparisonLabel = { gt: '>', lt: '<', eq: '=' }[rule.comparison] ?? rule.comparison;

  return (
    <tr className="border-b border-border last:border-b-0 text-sm">
      <td className="px-4 py-3 font-medium">{rule.metric}</td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">
        {comparisonLabel} {rule.threshold}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {rule.agent_id ? rule.agent_id.slice(0, 12) + '...' : 'All agents'}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{rule.cooldown_minutes}m</td>
      <td className="px-4 py-3">
        <button
          onClick={handleToggle}
          disabled={updateRule.isPending}
          className={cn(
            'flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors',
            rule.is_active
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {rule.is_active ? (
            <Bell className="h-3 w-3" />
          ) : (
            <BellOff className="h-3 w-3" />
          )}
          {rule.is_active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleDelete}
          disabled={deleteRule.isPending}
          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// New Alert Rule dialog (inline form)
// ---------------------------------------------------------------------------

const METRICS = ['cpu_percent', 'memory_percent', 'disk_mb', 'active_connections'] as const;
const COMPARISONS = [
  { value: 'gt', label: 'Greater than (>)' },
  { value: 'lt', label: 'Less than (<)' },
  { value: 'eq', label: 'Equal to (=)' },
] as const;

function NewAlertRuleForm({ onClose }: { onClose: () => void }) {
  const createRule = useCreateAlertRule();
  const [form, setForm] = useState<CreateAlertRuleData>({
    metric: 'cpu_percent',
    threshold: 80,
    comparison: 'gt',
    cooldown_minutes: 15,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRule.mutate(form, {
      onSuccess: () => {
        toast.success('Alert rule created');
        onClose();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">New Alert Rule</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Metric</label>
            <select
              value={form.metric}
              onChange={(e) =>
                setForm((f) => ({ ...f, metric: e.target.value as CreateAlertRuleData['metric'] }))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Comparison</label>
            <select
              value={form.comparison}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  comparison: e.target.value as CreateAlertRuleData['comparison'],
                }))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {COMPARISONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Threshold</label>
            <input
              type="number"
              step="0.01"
              value={form.threshold}
              onChange={(e) =>
                setForm((f) => ({ ...f, threshold: parseFloat(e.target.value) }))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Agent ID (optional)</label>
            <input
              type="text"
              placeholder="Leave empty to match all agents"
              value={form.agent_id ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, agent_id: e.target.value || undefined }))
              }
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Cooldown (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={form.cooldown_minutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, cooldown_minutes: parseInt(e.target.value) }))
              }
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
              disabled={createRule.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createRule.isPending ? 'Creating…' : 'Create Rule'}
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

export default function ResourceMonitoringPage() {
  const { data: current, isLoading: currentLoading, refetch: refetchCurrent } = useCurrentResources();
  const { data: alertRules, isLoading: rulesLoading } = useAlertRules();
  const checkAlertsMutation = useCheckAlerts();
  const recordSnapshotMutation = useRecordSnapshot();
  const [showNewRule, setShowNewRule] = useState(false);

  // Aggregate totals across all snapshots for gauge display
  const totals = (current ?? []).reduce(
    (acc, s) => ({
      cpu: acc.cpu + s.cpu_percent,
      memory: acc.memory + s.memory_percent,
      disk: acc.disk + s.disk_mb,
      connections: acc.connections + s.active_connections,
      count: acc.count + 1,
    }),
    { cpu: 0, memory: 0, disk: 0, connections: 0, count: 0 }
  );
  const avgCpu = totals.count > 0 ? totals.cpu / totals.count : 0;
  const avgMemory = totals.count > 0 ? totals.memory / totals.count : 0;
  const totalDisk = totals.disk;
  const totalConnections = totals.connections;

  const handleCheckAlerts = () => {
    checkAlertsMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.triggered.length > 0) {
          toast.error(`${result.triggered.length} alert(s) triggered out of ${result.checked} rules`);
        } else {
          toast.success(`Checked ${result.checked} rules — no alerts triggered`);
        }
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const handleRecordSnapshot = () => {
    recordSnapshotMutation.mutate(
      {
        cpu_percent: avgCpu,
        memory_percent: avgMemory,
        disk_mb: totalDisk,
        active_connections: totalConnections,
      },
      {
        onSuccess: () => {
          toast.success('Snapshot recorded');
          refetchCurrent();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      {showNewRule && <NewAlertRuleForm onClose={() => setShowNewRule(false)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Server className="h-6 w-6" />
              Resource Monitoring
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live CPU, memory, disk, and connection metrics across agents.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRecordSnapshot}
              disabled={recordSnapshotMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', recordSnapshotMutation.isPending && 'animate-spin')}
              />
              Record Snapshot
            </button>
            <button
              onClick={handleCheckAlerts}
              disabled={checkAlertsMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Check Alerts
            </button>
          </div>
        </div>

        {/* Live gauges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GaugeBar label="Avg CPU" value={avgCpu} max={100} unit="%" icon={Cpu} />
          <GaugeBar label="Avg Memory" value={avgMemory} max={100} unit="%" icon={MemoryStick} />
          <GaugeBar label="Total Disk" value={totalDisk} max={51200} unit=" MB" icon={HardDrive} />
          <GaugeBar
            label="Active Connections"
            value={totalConnections}
            max={1000}
            unit=""
            icon={Network}
          />
        </div>

        {/* Time-series chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            CPU &amp; Memory — Last Hour
          </h2>
          <ResourceHistoryChart />
        </div>

        {/* Per-agent breakdown */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Per-Agent Breakdown</h2>
          </div>
          {currentLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : current && current.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Agent</th>
                    <th className="px-4 py-2 text-left">CPU</th>
                    <th className="px-4 py-2 text-left">Memory</th>
                    <th className="px-4 py-2 text-left">Disk</th>
                    <th className="px-4 py-2 text-left">Connections</th>
                    <th className="px-4 py-2 text-left">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((snap) => (
                    <AgentResourceRow key={snap.id} snapshot={snap} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Server className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No resource snapshots yet. Click &ldquo;Record Snapshot&rdquo; to capture current metrics.
              </p>
            </div>
          )}
        </div>

        {/* Alert rules */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Alert Rules
            </h2>
            <button
              onClick={() => setShowNewRule(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Alert Rule
            </button>
          </div>

          {rulesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : alertRules && alertRules.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Metric</th>
                    <th className="px-4 py-2 text-left">Condition</th>
                    <th className="px-4 py-2 text-left">Scope</th>
                    <th className="px-4 py-2 text-left">Cooldown</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {alertRules.map((rule) => (
                    <AlertRuleRow key={rule.id} rule={rule} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No alert rules configured. Create one to get notified when thresholds are exceeded.
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Current resources refresh every 10 seconds
        </p>
      </div>
    </div>
  );
}
