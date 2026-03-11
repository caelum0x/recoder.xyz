'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  DollarSign,
  Edit3,
  Filter,
  Info,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCostAlertRules,
  useCreateCostAlertRule,
  useUpdateCostAlertRule,
  useDeleteCostAlertRule,
  useCheckCostAlerts,
  useCostAlertHistory,
  useUpdateCostAlert,
} from '@/hooks/billing/use-agent-cost-alerts';
import type {
  CostAlertRule,
  CostAlertHistoryEntry,
  CreateCostAlertRuleData,
  CostAlertHistoryFilters,
} from '@/lib/api/agent-cost-alerts';

// ============================================================================
// Constants
// ============================================================================

const ALERT_TYPE_CONFIG = {
  info: { label: 'Info', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: Info },
  warning: { label: 'Warning', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', icon: BellRing },
} as const;

const PERIOD_CONFIG = {
  hourly: { label: 'Hourly', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  daily: { label: 'Daily', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  weekly: { label: 'Weekly', color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  monthly: { label: 'Monthly', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
} as const;

const STATUS_CONFIG = {
  triggered: { label: 'Triggered', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  acknowledged: { label: 'Acknowledged', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
} as const;

// ============================================================================
// Create Rule Dialog
// ============================================================================

function CreateRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutation = useCreateCostAlertRule();
  const [form, setForm] = useState<CreateCostAlertRuleData>({
    name: '',
    threshold_amount: 10,
    threshold_period: 'daily',
    alert_type: 'warning',
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await createMutation.mutateAsync(form);
    setForm({ name: '', threshold_amount: 10, threshold_period: 'daily', alert_type: 'warning' });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Alert Rule</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Daily spend limit"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Agent (optional -- leave blank for all)</label>
            <input
              value={form.agent_id ?? ''}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value || undefined })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Agent ID (blank = all agents)"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Threshold Amount ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.threshold_amount}
              onChange={(e) => setForm({ ...form, threshold_amount: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Period</label>
            <select
              value={form.threshold_period}
              onChange={(e) => setForm({ ...form, threshold_period: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Alert Type</label>
            <select
              value={form.alert_type}
              onChange={(e) => setForm({ ...form, alert_type: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || form.threshold_amount <= 0 || createMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Edit Rule Dialog
// ============================================================================

function EditRuleDialog({ rule, onClose }: { rule: CostAlertRule; onClose: () => void }) {
  const updateMutation = useUpdateCostAlertRule();
  const [form, setForm] = useState({
    name: rule.name,
    threshold_amount: rule.threshold_amount,
    threshold_period: rule.threshold_period,
    alert_type: rule.alert_type,
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await updateMutation.mutateAsync({ ruleId: rule.id, data: form });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit Rule</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Threshold ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.threshold_amount}
              onChange={(e) => setForm({ ...form, threshold_amount: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Period</label>
            <select
              value={form.threshold_period}
              onChange={(e) => setForm({ ...form, threshold_period: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Alert Type</label>
            <select
              value={form.alert_type}
              onChange={(e) => setForm({ ...form, alert_type: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || updateMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Rule Card
// ============================================================================

function RuleCard({
  rule,
  onEdit,
}: {
  rule: CostAlertRule;
  onEdit: () => void;
}) {
  const deleteMutation = useDeleteCostAlertRule();
  const toggleMutation = useUpdateCostAlertRule();
  const alertCfg = ALERT_TYPE_CONFIG[rule.alert_type] ?? ALERT_TYPE_CONFIG.warning;
  const periodCfg = PERIOD_CONFIG[rule.threshold_period] ?? PERIOD_CONFIG.daily;
  const AlertIcon = alertCfg.icon;

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition-colors',
      rule.is_active ? 'border-border' : 'border-border/50 opacity-60'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <AlertIcon className="h-4 w-4 shrink-0" />
            <p className="font-medium text-sm truncate">{rule.name}</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400">
              <DollarSign className="h-3 w-3" />
              {rule.threshold_amount.toFixed(2)}
            </span>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', periodCfg.color)}>
              {periodCfg.label}
            </span>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', alertCfg.color)}>
              {alertCfg.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {rule.agent_id ? `Agent: ${rule.agent_name ?? rule.agent_id}` : 'All agents'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {/* Active toggle */}
          <button
            onClick={() =>
              toggleMutation.mutate({
                ruleId: rule.id,
                data: { is_active: !rule.is_active },
              })
            }
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              rule.is_active ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                rule.is_active ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => deleteMutation.mutate(rule.id)}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Alert History Item
// ============================================================================

function AlertHistoryItem({ alert }: { alert: CostAlertHistoryEntry }) {
  const updateMutation = useUpdateCostAlert();
  const statusCfg = STATUS_CONFIG[alert.status] ?? STATUS_CONFIG.triggered;
  const alertType = (alert.alert_type ?? 'warning') as keyof typeof ALERT_TYPE_CONFIG;
  const alertCfg = ALERT_TYPE_CONFIG[alertType] ?? ALERT_TYPE_CONFIG.warning;

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4',
      alert.status === 'triggered' ? 'border-red-500/30 bg-red-500/5' : 'border-border'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{alert.rule_name ?? 'Alert'}</p>
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.color)}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-sm">
            <span className="text-red-500 font-medium">${alert.triggered_amount.toFixed(2)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">${alert.threshold_amount.toFixed(2)} threshold</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {alert.agent_name ?? alert.agent_id ?? 'All agents'} -- {new Date(alert.triggered_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {alert.status === 'triggered' && (
            <button
              onClick={() => updateMutation.mutate({ alertId: alert.id, status: 'acknowledged' })}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20"
            >
              <Bell className="h-3 w-3" /> Acknowledge
            </button>
          )}
          {(alert.status === 'triggered' || alert.status === 'acknowledged') && (
            <button
              onClick={() => updateMutation.mutate({ alertId: alert.id, status: 'resolved' })}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20"
            >
              <Check className="h-3 w-3" /> Resolve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function CostAlertsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState<CostAlertRule | null>(null);
  const [historyFilters, setHistoryFilters] = useState<CostAlertHistoryFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const { data: rules, isLoading: rulesLoading } = useCostAlertRules();
  const { data: history, isLoading: historyLoading } = useCostAlertHistory(historyFilters);
  const checkMutation = useCheckCostAlerts();

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Cost Alerts</h1>
          <p className="text-sm text-muted-foreground">Monitor and control agent spending</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted"
          >
            {checkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Check Now
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Rule
          </button>
        </div>
      </div>

      {/* Check result banner */}
      {checkMutation.data && (
        <div className={cn(
          'rounded-xl border p-4 text-sm',
          checkMutation.data.triggered > 0
            ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
            : 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400'
        )}>
          Checked {checkMutation.data.checked} rule{checkMutation.data.checked !== 1 ? 's' : ''}.{' '}
          {checkMutation.data.triggered > 0
            ? `${checkMutation.data.triggered} alert${checkMutation.data.triggered !== 1 ? 's' : ''} triggered!`
            : 'All within thresholds.'}
        </div>
      )}

      {/* Rules Section */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Alert Rules</h2>
        {rulesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border">
            <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No alert rules configured</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Create your first rule
            </button>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onEdit={() => setEditingRule(rule)} />
            ))}
          </div>
        )}
      </section>

      {/* History Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Alert History</h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted',
              showFilters && 'bg-muted'
            )}
          >
            <Filter className="h-3 w-3" /> Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card mb-3">
            <select
              value={historyFilters.status ?? ''}
              onChange={(e) => setHistoryFilters({ ...historyFilters, status: e.target.value || undefined })}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">All Status</option>
              <option value="triggered">Triggered</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <input
              placeholder="Agent ID..."
              value={historyFilters.agent_id ?? ''}
              onChange={(e) => setHistoryFilters({ ...historyFilters, agent_id: e.target.value || undefined })}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-48"
            />
            {(historyFilters.status || historyFilters.agent_id) && (
              <button
                onClick={() => setHistoryFilters({})}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border">
            <Check className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No alerts triggered yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((alert) => (
              <AlertHistoryItem key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>

      {/* Dialogs */}
      <CreateRuleDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {editingRule && <EditRuleDialog rule={editingRule} onClose={() => setEditingRule(null)} />}
    </div>
  );
}
