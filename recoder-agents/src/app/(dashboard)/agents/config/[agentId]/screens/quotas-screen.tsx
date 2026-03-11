'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAgentQuotas,
  useSetQuota,
  useDeleteQuota,
  useResetQuotas,
  useQuotaViolations,
} from '@/hooks/agents/use-agent-resource-quotas';
import { toast } from '@/lib/toast';
import type { AgentQuota, SetQuotaData } from '@/lib/api/agent-resource-quotas';

// ============================================================================
// Constants
// ============================================================================

interface QuotasScreenProps {
  agentId: string;
}

const RESOURCE_TYPES = [
  { value: 'runs_per_day', label: 'Runs / Day', icon: Zap, description: 'Maximum agent runs per day' },
  { value: 'runs_per_hour', label: 'Runs / Hour', icon: Clock, description: 'Maximum agent runs per hour' },
  { value: 'max_tokens', label: 'Max Tokens', icon: Gauge, description: 'Maximum tokens per session' },
  { value: 'max_cost_daily', label: 'Max Cost / Day', icon: AlertTriangle, description: 'Maximum daily cost in USD' },
  { value: 'max_concurrent', label: 'Max Concurrent', icon: Zap, description: 'Maximum concurrent runs' },
  { value: 'max_duration_seconds', label: 'Max Duration', icon: Clock, description: 'Maximum run duration in seconds' },
] as const;

function getUsageColor(pct: number): string {
  if (pct >= 90) return 'text-red-600 dark:text-red-400';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getUsageBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

function getUsageBg(pct: number): string {
  if (pct >= 90) return 'bg-red-500/10 border-red-500/20';
  if (pct >= 70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-green-500/10 border-green-500/20';
}

// ============================================================================
// Set Quota Dialog
// ============================================================================

function SetQuotaDialog({
  isOpen,
  onClose,
  agentId,
  existingTypes,
}: {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  existingTypes: string[];
}) {
  const setQuota = useSetQuota();
  const [form, setForm] = useState<SetQuotaData>({
    resource_type: 'runs_per_day',
    quota_value: 100,
  });

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (form.quota_value <= 0) {
      toast.error('Quota value must be positive');
      return;
    }
    try {
      await setQuota.mutateAsync({ agentId, data: form });
      toast.success('Quota set successfully');
      onClose();
    } catch {
      toast.error('Failed to set quota');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Set Quota</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Resource Type</label>
            <select
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={form.resource_type}
              onChange={(e) => setForm({ ...form, resource_type: e.target.value })}
            >
              {RESOURCE_TYPES.map((rt) => (
                <option key={rt.value} value={rt.value}>
                  {rt.label} {existingTypes.includes(rt.value) ? '(update)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Quota Value</label>
            <input
              type="number"
              step="any"
              min="0"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={form.quota_value}
              onChange={(e) => setForm({ ...form, quota_value: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {RESOURCE_TYPES.find((r) => r.value === form.resource_type)?.description}
            </p>
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
            disabled={setQuota.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {setQuota.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Set Quota
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Quota Card
// ============================================================================

function QuotaCard({ quota, agentId }: { quota: AgentQuota; agentId: string }) {
  const deleteQuota = useDeleteQuota();
  const rtConfig = RESOURCE_TYPES.find((r) => r.value === quota.resource_type);
  const Icon = rtConfig?.icon || Gauge;
  const pct = quota.usage_pct;

  return (
    <div className={cn('rounded-xl border bg-card p-4 transition-all', getUsageBg(pct))}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center h-8 w-8 rounded-lg bg-background border')}>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h4 className="text-sm font-medium">{rtConfig?.label || quota.resource_type}</h4>
            <p className="text-xs text-muted-foreground">{rtConfig?.description}</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm('Remove this quota?')) {
              deleteQuota.mutate(
                { agentId, quotaId: quota.id },
                {
                  onSuccess: () => toast.success('Quota removed'),
                  onError: () => toast.error('Failed to remove quota'),
                }
              );
            }
          }}
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">
            {Number(quota.current_usage).toFixed(1)} / {Number(quota.quota_value).toFixed(1)}
          </span>
          <span className={cn('font-semibold tabular-nums', getUsageColor(pct))}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getUsageBarColor(pct))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Last reset: {new Date(quota.last_reset_at).toLocaleDateString()}</span>
        <span className={cn(
          'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
          quota.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
        )}>
          {quota.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Violations Log
// ============================================================================

function ViolationsLog({ agentId }: { agentId: string }) {
  const { data: violations, isLoading } = useQuotaViolations(agentId);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          Violations Log
        </h4>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !violations?.length ? (
        <div className="px-4 py-8 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No quota violations</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-64 overflow-y-auto">
          {violations.map((v) => (
            <div key={v.id} className="px-4 py-3 flex items-center justify-between text-xs">
              <div>
                <p className="font-medium text-sm text-red-600 dark:text-red-400">
                  {RESOURCE_TYPES.find((r) => r.value === v.resource_type)?.label || v.resource_type}
                </p>
                <p className="text-muted-foreground">
                  Attempted: {Number(v.attempted_value).toFixed(2)} / Limit: {Number(v.quota_value).toFixed(2)}
                </p>
              </div>
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(v.violated_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export function QuotasScreen({ agentId }: QuotasScreenProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: quotas, isLoading } = useAgentQuotas(agentId);
  const resetQuotas = useResetQuotas();

  const existingTypes = useMemo(
    () => (quotas ?? []).map((q) => q.resource_type),
    [quotas]
  );

  const handleReset = async () => {
    if (!confirm('Reset all usage counters for this agent?')) return;
    try {
      const result = await resetQuotas.mutateAsync(agentId);
      toast.success(`Reset ${result.reset_count} quota counters`);
    } catch {
      toast.error('Failed to reset quotas');
    }
  };

  return (
    <div className="flex-1 overflow-auto pb-6">
      <div className="px-1 pt-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Resource Quotas
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set limits on agent resource consumption
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={resetQuotas.isPending || !quotas?.length}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50"
            >
              {resetQuotas.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Reset Usage
            </button>
            <button
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Set Quota
            </button>
          </div>
        </div>

        {/* Quota Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
                <div className="h-4 w-32 bg-muted rounded mb-3" />
                <div className="h-2 w-full bg-muted rounded mb-2" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !quotas?.length ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No resource quotas configured. Set quotas to limit agent resource consumption.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quotas.map((q) => (
              <QuotaCard key={q.id} quota={q} agentId={agentId} />
            ))}
          </div>
        )}

        {/* Violations Log */}
        <div className="mt-6">
          <ViolationsLog agentId={agentId} />
        </div>
      </div>

      {/* Set Quota Dialog */}
      <SetQuotaDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        agentId={agentId}
        existingTypes={existingTypes}
      />
    </div>
  );
}
