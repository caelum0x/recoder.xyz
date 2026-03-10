'use client';

import { useState } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCostAlerts,
  useCreateCostAlert,
  useUpdateCostAlert,
  useDeleteCostAlert,
  useCostAlertHistory,
  useCheckCostAlerts,
} from '@/hooks/billing/use-cost-alerts';
import {
  ALERT_TYPE_LABELS,
  ALERT_PRESETS,
  type CostAlertRule,
  type CostAlertHistoryItem,
} from '@/lib/api/cost-alerts';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Alert type badge
// ---------------------------------------------------------------------------

const ALERT_TYPE_COLORS: Record<string, string> = {
  monthly_spend: 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  daily_spend: 'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  per_agent: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  per_model: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-400',
};

function AlertTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px]', ALERT_TYPE_COLORS[type] || '')}
    >
      {ALERT_TYPE_LABELS[type] || type}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Alert rule card
// ---------------------------------------------------------------------------

function AlertRuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: CostAlertRule;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {rule.name}
          </span>
          <AlertTypeBadge type={rule.alert_type} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">${rule.threshold_amount.toFixed(2)}</span>
          {rule.agent_id && <span>Agent: {rule.agent_id.slice(0, 8)}...</span>}
          {rule.model_filter && <span>Model: {rule.model_filter}</span>}
          {rule.last_triggered_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last: {new Date(rule.last_triggered_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <Switch
        checked={rule.active}
        onCheckedChange={onToggle}
        aria-label="Toggle alert active"
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
        onClick={onDelete}
        title="Delete rule"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create alert dialog
// ---------------------------------------------------------------------------

function CreateAlertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateCostAlert();

  const [name, setName] = useState('');
  const [alertType, setAlertType] = useState('monthly_spend');
  const [threshold, setThreshold] = useState('');
  const [agentId, setAgentId] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  const handleSubmit = () => {
    const amount = parseFloat(threshold);
    if (!name.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    createMutation.mutate(
      {
        name: name.trim(),
        alert_type: alertType,
        threshold_amount: amount,
        agent_id: alertType === 'per_agent' && agentId.trim() ? agentId.trim() : undefined,
        model_filter: alertType === 'per_model' && modelFilter.trim() ? modelFilter.trim() : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Cost alert created');
          onOpenChange(false);
          setName('');
          setThreshold('');
          setAgentId('');
          setModelFilter('');
        },
        onError: () => {
          toast.error('Failed to create cost alert');
        },
      },
    );
  };

  const applyPreset = (preset: (typeof ALERT_PRESETS)[number]) => {
    setName(preset.name);
    setAlertType(preset.alert_type);
    setThreshold(String(preset.threshold_amount));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Cost Alert</DialogTitle>
          <DialogDescription>
            Set a threshold to be notified when spending exceeds a limit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quick presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {ALERT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="px-2.5 py-1 text-xs rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Alert Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly $50 warning"
            />
          </div>

          {/* Alert type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Alert Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ALERT_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAlertType(key)}
                  className={cn(
                    'px-3 py-2 text-xs font-medium rounded-md border transition-colors text-left',
                    alertType === key
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Threshold */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Threshold ($)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="e.g. 50.00"
            />
          </div>

          {/* Agent ID (for per_agent) */}
          {alertType === 'per_agent' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent ID</label>
              <Input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="Agent ID to monitor"
              />
            </div>
          )}

          {/* Model filter (for per_model) */}
          {alertType === 'per_model' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Model Name</label>
              <Input
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="e.g. claude-sonnet-4"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !threshold || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Alert'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Alert history timeline
// ---------------------------------------------------------------------------

function AlertHistoryTimeline() {
  const { data, isLoading } = useCostAlertHistory({ limit: 20 });
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const alerts = data?.alerts ?? [];

  if (alerts.length === 0) {
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No alerts triggered yet. Your spending is within thresholds.
        </p>
      </div>
    );
  }

  const visibleAlerts = expanded ? alerts : alerts.slice(0, 5);

  return (
    <div>
      <div className="divide-y divide-border">
        {visibleAlerts.map((alert) => (
          <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                {alert.message || `Threshold exceeded: $${alert.actual_amount.toFixed(2)} / $${alert.threshold_amount.toFixed(2)}`}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <AlertTypeBadge type={alert.alert_type} />
                <span className="font-mono">
                  {alert.percentage_of_threshold.toFixed(1)}% of threshold
                </span>
                <span>{new Date(alert.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {alerts.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border text-center"
        >
          {expanded ? 'Show less' : `Show ${alerts.length - 5} more`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CostAlertManager() {
  const { data: rules, isLoading } = useCostAlerts();
  const updateMutation = useUpdateCostAlert();
  const deleteMutation = useDeleteCostAlert();
  const checkMutation = useCheckCostAlerts();
  const [createOpen, setCreateOpen] = useState(false);

  const handleToggle = (rule: CostAlertRule, active: boolean) => {
    updateMutation.mutate(
      { ruleId: rule.id, payload: { active } },
      {
        onError: () => toast.error('Failed to update alert'),
      },
    );
  };

  const handleDelete = (rule: CostAlertRule) => {
    deleteMutation.mutate(rule.id, {
      onSuccess: () => toast.success('Alert deleted'),
      onError: () => toast.error('Failed to delete alert'),
    });
  };

  const handleCheckNow = () => {
    checkMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.alerts_triggered > 0) {
          toast.error(
            `${result.alerts_triggered} alert${result.alerts_triggered > 1 ? 's' : ''} triggered out of ${result.rules_checked} checked`,
          );
        } else {
          toast.success(
            `All clear! ${result.rules_checked} rule${result.rules_checked > 1 ? 's' : ''} checked, no thresholds exceeded`,
          );
        }
      },
      onError: () => toast.error('Failed to check alerts'),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Bell className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Cost Alerts</h2>
            <p className="text-xs text-muted-foreground">
              Get notified when spending exceeds your thresholds
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCheckNow}
            disabled={checkMutation.isPending || !rules || rules.length === 0}
          >
            <Zap className={cn('h-3.5 w-3.5', checkMutation.isPending && 'animate-pulse')} />
            {checkMutation.isPending ? 'Checking...' : 'Check Now'}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Alert
          </Button>
        </div>
      </div>

      {/* Rules list */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            Alert Rules
            {rules && rules.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {rules.length}
              </Badge>
            )}
          </h3>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No cost alert rules configured yet.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Your First Alert
            </Button>
          </div>
        ) : (
          rules.map((rule) => (
            <AlertRuleCard
              key={rule.id}
              rule={rule}
              onToggle={(active) => handleToggle(rule, active)}
              onDelete={() => handleDelete(rule)}
            />
          ))
        )}
      </div>

      {/* Alert history */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            Alert History
          </h3>
        </div>
        <AlertHistoryTimeline />
      </div>

      {/* Create dialog */}
      <CreateAlertDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
