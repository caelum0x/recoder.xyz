'use client';

import { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  Filter,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSlaDefinitions,
  useCreateSla,
  useUpdateSla,
  useDeleteSla,
  useMeasureSla,
  useSlaMeasurements,
  useSlaDashboard,
} from '@/hooks/monitoring/use-sla-monitoring';
import { useAgents } from '@/hooks/agents/use-agents';
import { useAuth } from '@/components/AuthProvider';
import { toast } from '@/lib/toast';
import type { SlaDefinition, CreateSlaData, SlaMeasurement } from '@/lib/api/sla-monitoring';

// ============================================================================
// Constants
// ============================================================================

const METRIC_TYPES = [
  { value: 'response_time', label: 'Response Time', unit: 'ms', icon: Clock },
  { value: 'uptime', label: 'Uptime', unit: 'percent', icon: TrendingUp },
  { value: 'error_rate', label: 'Error Rate', unit: 'percent', icon: AlertTriangle },
  { value: 'throughput', label: 'Throughput', unit: 'count', icon: Activity },
  { value: 'resolution_time', label: 'Resolution Time', unit: 'seconds', icon: Target },
] as const;

const EVALUATION_WINDOWS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

function getComplianceColor(rate: number | null): string {
  if (rate === null) return 'text-muted-foreground';
  if (rate >= 95) return 'text-green-600 dark:text-green-400';
  if (rate >= 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getComplianceBg(rate: number | null): string {
  if (rate === null) return 'bg-muted';
  if (rate >= 95) return 'bg-green-500/10 border-green-500/20';
  if (rate >= 90) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function getComplianceBarColor(rate: number | null): string {
  if (rate === null) return 'bg-muted-foreground/30';
  if (rate >= 95) return 'bg-green-500';
  if (rate >= 90) return 'bg-amber-500';
  return 'bg-red-500';
}

// ============================================================================
// Compliance Banner
// ============================================================================

function ComplianceBanner() {
  const { data: dashboard, isLoading } = useSlaDashboard();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-2" />
        <div className="h-10 w-24 bg-muted rounded" />
      </div>
    );
  }

  const rate = dashboard?.overall_compliance_pct ?? 100;

  return (
    <div className={cn('rounded-xl border p-6', getComplianceBg(rate))}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Overall SLA Compliance</p>
          <p className={cn('text-4xl font-bold tabular-nums mt-1', getComplianceColor(rate))}>
            {rate.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {dashboard?.active_slas ?? 0} active SLAs &middot; {dashboard?.total_measurements ?? 0} measurements &middot; {dashboard?.total_breaches ?? 0} breaches
          </p>
        </div>
        <div className="flex items-center justify-center h-16 w-16 rounded-full border-2" style={{ borderColor: rate >= 95 ? '#22c55e' : rate >= 90 ? '#f59e0b' : '#ef4444' }}>
          {rate >= 95 ? (
            <ShieldCheck className="h-8 w-8 text-green-500" />
          ) : rate >= 90 ? (
            <Shield className="h-8 w-8 text-amber-500" />
          ) : (
            <ShieldAlert className="h-8 w-8 text-red-500" />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// New SLA Dialog
// ============================================================================

function NewSlaDialog({
  isOpen,
  onClose,
  agents,
}: {
  isOpen: boolean;
  onClose: () => void;
  agents: Array<{ agent_id: string; name: string }>;
}) {
  const createSla = useCreateSla();
  const [form, setForm] = useState<CreateSlaData>({
    name: '',
    metric_type: 'response_time',
    target_value: 200,
    target_unit: 'ms',
    evaluation_window: 'daily',
  });

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      await createSla.mutateAsync(form);
      toast.success('SLA created successfully');
      setForm({ name: '', metric_type: 'response_time', target_value: 200, target_unit: 'ms', evaluation_window: 'daily' });
      onClose();
    } catch {
      toast.error('Failed to create SLA');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">New SLA Definition</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              placeholder="e.g. API Response Time SLA"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Agent (optional)</label>
            <select
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={form.agent_id || ''}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value || undefined })}
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Metric Type</label>
            <select
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={form.metric_type}
              onChange={(e) => {
                const mt = METRIC_TYPES.find((m) => m.value === e.target.value);
                setForm({
                  ...form,
                  metric_type: e.target.value,
                  target_unit: mt?.unit || 'ms',
                });
              }}
            >
              {METRIC_TYPES.map((mt) => (
                <option key={mt.value} value={mt.value}>{mt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Target Value</label>
              <input
                type="number"
                step="any"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Evaluation Window</label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                value={form.evaluation_window}
                onChange={(e) => setForm({ ...form, evaluation_window: e.target.value })}
              >
                {EVALUATION_WINDOWS.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createSla.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {createSla.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create SLA
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SLA Card
// ============================================================================

function SlaCard({
  sla,
  onSelect,
  isSelected,
}: {
  sla: SlaDefinition;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const deleteSla = useDeleteSla();
  const metricConfig = METRIC_TYPES.find((m) => m.value === sla.metric_type);
  const Icon = metricConfig?.icon || Gauge;
  const compliance = sla.compliance_rate;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-md',
        isSelected ? 'ring-2 ring-primary border-primary' : 'border-border'
      )}
      onClick={() => onSelect(sla.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg', getComplianceBg(compliance))}>
            <Icon className={cn('h-4 w-4', getComplianceColor(compliance))} />
          </div>
          <div>
            <h4 className="text-sm font-medium truncate max-w-[180px]">{sla.name}</h4>
            <p className="text-xs text-muted-foreground">{metricConfig?.label || sla.metric_type}</p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this SLA?')) {
              deleteSla.mutate(sla.id, {
                onSuccess: () => toast.success('SLA deleted'),
                onError: () => toast.error('Failed to delete SLA'),
              });
            }
          }}
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Compliance</span>
          <span className={cn('font-semibold tabular-nums', getComplianceColor(compliance))}>
            {compliance !== null ? `${compliance.toFixed(1)}%` : 'N/A'}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getComplianceBarColor(compliance))}
            style={{ width: `${compliance ?? 0}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Target: {sla.target_value} {sla.target_unit}</span>
        <span>{sla.evaluation_window}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
        <span>{sla.total_measurements} measurements</span>
        <span>{sla.breach_count} breaches</span>
      </div>
    </div>
  );
}

// ============================================================================
// Measurement History
// ============================================================================

function MeasurementHistory({ slaId }: { slaId: string }) {
  const [breachOnly, setBreachOnly] = useState(false);
  const { data: measurements, isLoading } = useSlaMeasurements(slaId, { breach_only: breachOnly, limit: 50 });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Measurement History</h4>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={breachOnly}
            onChange={(e) => setBreachOnly(e.target.checked)}
            className="rounded border-border"
          />
          Breaches only
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !measurements?.length ? (
        <p className="text-sm text-muted-foreground text-center py-6">No measurements yet</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {measurements.map((m) => (
            <div
              key={m.id}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg text-xs',
                m.is_breach ? 'bg-red-500/5 border border-red-500/20' : 'bg-muted/50'
              )}
            >
              <div className="flex items-center gap-2">
                {m.is_breach ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                )}
                <span className="font-medium tabular-nums">{Number(m.measured_value).toFixed(2)}</span>
              </div>
              <span className="text-muted-foreground">
                {new Date(m.measured_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Recent Breaches Table
// ============================================================================

function RecentBreachesTable() {
  const { data: dashboard } = useSlaDashboard();
  const breaches = dashboard?.recent_breaches ?? [];

  if (!breaches.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No recent breaches</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          Recent Breaches
        </h4>
      </div>
      <div className="divide-y divide-border max-h-64 overflow-y-auto">
        {breaches.map((b) => (
          <div key={b.id} className="px-4 py-3 flex items-center justify-between text-xs">
            <div>
              <p className="font-medium text-sm">{b.sla_name}</p>
              <p className="text-muted-foreground">
                {b.metric_type}: {Number(b.measured_value).toFixed(2)} (target: {Number(b.target_value).toFixed(2)} {b.target_unit})
              </p>
            </div>
            <span className="text-muted-foreground whitespace-nowrap">
              {new Date(b.measured_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function SlaMonitoringPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [selectedSlaId, setSelectedSlaId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [filterMetric, setFilterMetric] = useState<string>('');

  const { data: slas, isLoading: slasLoading } = useSlaDefinitions();
  const { data: agentsData } = useAgents(
    { limit: 100 },
    { enabled: !!user && !isAuthLoading }
  );
  const measureSla = useMeasureSla();

  const agents = useMemo(() => {
    if (!agentsData) return [];
    const list = Array.isArray(agentsData) ? agentsData : (agentsData as any)?.agents ?? [];
    return list.map((a: any) => ({ agent_id: a.agent_id, name: a.name }));
  }, [agentsData]);

  const filteredSlas = useMemo(() => {
    if (!slas) return [];
    return slas.filter((s) => {
      if (filterAgent && s.agent_id !== filterAgent) return false;
      if (filterMetric && s.metric_type !== filterMetric) return false;
      return true;
    });
  }, [slas, filterAgent, filterMetric]);

  const handleMeasure = async () => {
    try {
      const result = await measureSla.mutateAsync();
      toast.success(`Measured ${result.measured} SLAs (${result.breaches} breaches)`);
    } catch {
      toast.error('Failed to measure SLAs');
    }
  };

  return (
    <div className="flex-1 overflow-auto pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">SLA Monitoring</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track service level agreements and compliance metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMeasure}
              disabled={measureSla.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50"
            >
              {measureSla.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Measure Now
            </button>
            <button
              onClick={() => setIsNewDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New SLA
            </button>
          </div>
        </div>

        {/* Compliance Banner */}
        <ComplianceBanner />

        {/* Filters */}
        <div className="flex items-center gap-3 mt-6 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
          >
            <option value="">All agents</option>
            {agents.map((a: { agent_id: string; name: string }) => (
              <option key={a.agent_id} value={a.agent_id}>{a.name}</option>
            ))}
          </select>
          <select
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            value={filterMetric}
            onChange={(e) => setFilterMetric(e.target.value)}
          >
            <option value="">All metrics</option>
            {METRIC_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>{mt.label}</option>
            ))}
          </select>
          {(filterAgent || filterMetric) && (
            <button
              onClick={() => { setFilterAgent(''); setFilterMetric(''); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* SLA Cards */}
        {slasLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
                <div className="h-4 w-32 bg-muted rounded mb-3" />
                <div className="h-2 w-full bg-muted rounded mb-2" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !filteredSlas.length ? (
          <div className="text-center py-12">
            <Gauge className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {slas?.length ? 'No SLAs match your filters' : 'No SLA definitions yet. Create one to start monitoring.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {filteredSlas.map((sla) => (
              <SlaCard
                key={sla.id}
                sla={sla}
                onSelect={setSelectedSlaId}
                isSelected={selectedSlaId === sla.id}
              />
            ))}
          </div>
        )}

        {/* Measurement History for selected SLA */}
        {selectedSlaId && (
          <div className="mt-6">
            <MeasurementHistory slaId={selectedSlaId} />
          </div>
        )}

        {/* Recent Breaches */}
        <div className="mt-6">
          <RecentBreachesTable />
        </div>
      </div>

      {/* New SLA Dialog */}
      <NewSlaDialog
        isOpen={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        agents={agents}
      />
    </div>
  );
}
