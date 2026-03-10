'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Gauge,
  AlertTriangle,
  Trash2,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useAgentQuota,
  useUpdateAgentQuota,
  useDeleteAgentQuota,
} from '@/hooks/agents/use-agent-quotas';

// ---- Types ----

interface QuotaScreenProps {
  agentId: string;
}

interface QuotaFormData {
  max_runs_per_day: string;
  max_tokens_per_day: string;
  max_cost_per_day: string;
  max_runs_per_month: string;
  max_tokens_per_month: string;
  max_cost_per_month: string;
  alert_threshold_pct: number;
  is_enforced: boolean;
}

const EMPTY_FORM: QuotaFormData = {
  max_runs_per_day: '',
  max_tokens_per_day: '',
  max_cost_per_day: '',
  max_runs_per_month: '',
  max_tokens_per_month: '',
  max_cost_per_month: '',
  alert_threshold_pct: 80,
  is_enforced: false,
};

// ---- Helpers ----

function getProgressColor(pct: number | null): string {
  if (pct === null) return 'bg-muted';
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getProgressBgColor(pct: number | null): string {
  if (pct === null) return 'bg-muted/30';
  if (pct >= 80) return 'bg-red-500/10';
  if (pct >= 60) return 'bg-amber-500/10';
  return 'bg-emerald-500/10';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function UsageCard({
  label,
  current,
  limit,
  pct,
  prefix = '',
}: {
  label: string;
  current: number;
  limit: number | null;
  pct: number | null;
  prefix?: string;
}) {
  const displayPct = pct !== null ? Math.min(pct, 100) : 0;

  return (
    <SpotlightCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {pct !== null && pct >= 80 && (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        )}
      </div>
      <div className="text-lg font-semibold text-foreground">
        {prefix}{formatNumber(current)}
        {limit !== null && (
          <span className="text-sm font-normal text-muted-foreground">
            {' / '}{prefix}{formatNumber(limit)}
          </span>
        )}
      </div>
      <div className={cn('h-2 rounded-full w-full', getProgressBgColor(pct))}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', getProgressColor(pct))}
          style={{ width: limit !== null ? `${displayPct}%` : '0%' }}
        />
      </div>
      {pct !== null && (
        <span className={cn(
          'text-xs font-medium',
          pct >= 80 ? 'text-red-500' : pct >= 60 ? 'text-amber-500' : 'text-emerald-500'
        )}>
          {pct.toFixed(1)}% used
        </span>
      )}
      {limit === null && (
        <span className="text-xs text-muted-foreground">No limit set</span>
      )}
    </SpotlightCard>
  );
}

// ---- Main Component ----

export function QuotaScreen({ agentId }: QuotaScreenProps) {
  const { data, isLoading, isError } = useAgentQuota(agentId);
  const updateMutation = useUpdateAgentQuota(agentId);
  const deleteMutation = useDeleteAgentQuota(agentId);

  const [formData, setFormData] = useState<QuotaFormData>(EMPTY_FORM);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync form data with server data
  useEffect(() => {
    if (data?.quota) {
      const q = data.quota;
      setFormData({
        max_runs_per_day: q.max_runs_per_day?.toString() ?? '',
        max_tokens_per_day: q.max_tokens_per_day?.toString() ?? '',
        max_cost_per_day: q.max_cost_per_day?.toString() ?? '',
        max_runs_per_month: q.max_runs_per_month?.toString() ?? '',
        max_tokens_per_month: q.max_tokens_per_month?.toString() ?? '',
        max_cost_per_month: q.max_cost_per_month?.toString() ?? '',
        alert_threshold_pct: q.alert_threshold_pct ?? 80,
        is_enforced: q.is_enforced ?? false,
      });
      setHasChanges(false);
    }
  }, [data?.quota]);

  const handleFieldChange = useCallback((field: keyof QuotaFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await updateMutation.mutateAsync({
        max_runs_per_day: formData.max_runs_per_day ? parseInt(formData.max_runs_per_day) : null,
        max_tokens_per_day: formData.max_tokens_per_day ? parseInt(formData.max_tokens_per_day) : null,
        max_cost_per_day: formData.max_cost_per_day ? parseFloat(formData.max_cost_per_day) : null,
        max_runs_per_month: formData.max_runs_per_month ? parseInt(formData.max_runs_per_month) : null,
        max_tokens_per_month: formData.max_tokens_per_month ? parseInt(formData.max_tokens_per_month) : null,
        max_cost_per_month: formData.max_cost_per_month ? parseFloat(formData.max_cost_per_month) : null,
        alert_threshold_pct: formData.alert_threshold_pct,
        is_enforced: formData.is_enforced,
      });
      toast.success('Quota updated successfully');
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update quota');
    }
  }, [formData, updateMutation]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync();
      toast.success('Quota removed - agent now has no limits');
      setFormData(EMPTY_FORM);
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove quota');
    } finally {
      setShowDeleteConfirm(false);
    }
  }, [deleteMutation]);

  // ---- Loading State ----

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1 space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // ---- Error State ----

  if (isError) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1">
          <SpotlightCard className="p-6 text-center">
            <p className="text-sm text-destructive">
              Failed to load quota data. Please try again.
            </p>
          </SpotlightCard>
        </div>
      </div>
    );
  }

  const usage = data?.usage;
  const quota = data?.quota;

  return (
    <div className="flex-1 overflow-auto pb-6 w-full min-w-0">
      <div className="px-1 pt-1 space-y-6 w-full">
        {/* Info Banner */}
        <SpotlightCard className="p-4">
          <div className="flex items-start gap-3">
            <Gauge className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Agent Quota Management
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Set daily and monthly limits on runs, tokens, and cost for this agent.
                When enforcement is enabled, the agent will be blocked from running once limits are reached.
              </p>
            </div>
          </div>
        </SpotlightCard>

        {/* Daily Usage Cards */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Daily Usage</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UsageCard
              label="Runs Today"
              current={usage?.runs_today ?? 0}
              limit={quota?.max_runs_per_day ?? null}
              pct={usage?.daily_runs_pct ?? null}
            />
            <UsageCard
              label="Tokens Today"
              current={usage?.tokens_today ?? 0}
              limit={quota?.max_tokens_per_day ?? null}
              pct={usage?.daily_tokens_pct ?? null}
            />
            <UsageCard
              label="Cost Today"
              current={usage?.cost_today ?? 0}
              limit={quota?.max_cost_per_day ?? null}
              pct={usage?.daily_cost_pct ?? null}
              prefix="$"
            />
          </div>
        </div>

        {/* Monthly Usage Cards */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Monthly Usage</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UsageCard
              label="Runs This Month"
              current={usage?.runs_month ?? 0}
              limit={quota?.max_runs_per_month ?? null}
              pct={usage?.monthly_runs_pct ?? null}
            />
            <UsageCard
              label="Tokens This Month"
              current={usage?.tokens_month ?? 0}
              limit={quota?.max_tokens_per_month ?? null}
              pct={usage?.monthly_tokens_pct ?? null}
            />
            <UsageCard
              label="Cost This Month"
              current={usage?.cost_month ?? 0}
              limit={quota?.max_cost_per_month ?? null}
              pct={usage?.monthly_cost_pct ?? null}
              prefix="$"
            />
          </div>
        </div>

        {/* Quota Configuration Form */}
        <SpotlightCard className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Configure Limits</h3>
            {quota && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove All Limits
              </Button>
            )}
          </div>

          {/* Daily Limits */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Daily Limits
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-runs-day" className="text-xs">Max Runs / Day</Label>
                <Input
                  id="max-runs-day"
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={formData.max_runs_per_day}
                  onChange={(e) => handleFieldChange('max_runs_per_day', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-tokens-day" className="text-xs">Max Tokens / Day</Label>
                <Input
                  id="max-tokens-day"
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={formData.max_tokens_per_day}
                  onChange={(e) => handleFieldChange('max_tokens_per_day', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-cost-day" className="text-xs">Max Cost / Day ($)</Label>
                <Input
                  id="max-cost-day"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unlimited"
                  value={formData.max_cost_per_day}
                  onChange={(e) => handleFieldChange('max_cost_per_day', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Monthly Limits */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Monthly Limits
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="max-runs-month" className="text-xs">Max Runs / Month</Label>
                <Input
                  id="max-runs-month"
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={formData.max_runs_per_month}
                  onChange={(e) => handleFieldChange('max_runs_per_month', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-tokens-month" className="text-xs">Max Tokens / Month</Label>
                <Input
                  id="max-tokens-month"
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={formData.max_tokens_per_month}
                  onChange={(e) => handleFieldChange('max_tokens_per_month', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-cost-month" className="text-xs">Max Cost / Month ($)</Label>
                <Input
                  id="max-cost-month"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unlimited"
                  value={formData.max_cost_per_month}
                  onChange={(e) => handleFieldChange('max_cost_per_month', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Alert Threshold */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-xs">Alert Threshold</Label>
                <p className="text-xs text-muted-foreground">
                  Get alerted when usage reaches this percentage of any limit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground w-10 text-right">
                  {formData.alert_threshold_pct}%
                </span>
              </div>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={formData.alert_threshold_pct}
              onChange={(e) => handleFieldChange('alert_threshold_pct', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Enforce Limits Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              {formData.is_enforced ? (
                <Shield className="h-5 w-5 text-primary mt-0.5" />
              ) : (
                <ShieldOff className="h-5 w-5 text-muted-foreground mt-0.5" />
              )}
              <div className="space-y-1">
                <span className="text-sm font-medium text-foreground">Enforce Limits</span>
                <p className="text-xs text-muted-foreground">
                  When enabled, agent runs will be blocked once any limit is reached at 100%.
                  When disabled, limits are advisory only and alerts will still fire.
                </p>
              </div>
            </div>
            <Switch
              checked={formData.is_enforced}
              onCheckedChange={(checked) => handleFieldChange('is_enforced', checked)}
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasChanges}
              className="min-w-[120px]"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Quota'}
            </Button>
          </div>
        </SpotlightCard>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove All Limits</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove all quota limits for this agent?
              The agent will be able to run without any restrictions. You can
              re-configure limits at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Removing...' : 'Remove Limits'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
