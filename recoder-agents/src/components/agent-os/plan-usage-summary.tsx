'use client';

import { useMemo, useState } from 'react';
import { ArrowUpCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAccountState } from '@/hooks/billing';
import {
  UpgradeDialog,
  type UpgradeContext,
} from '@/components/billing/upgrade-dialog';

const UNLIMITED_THRESHOLD = 99999;
const WARN_PERCENT = 80;

function isUnlimited(max: number): boolean {
  return max < 0 || max >= UNLIMITED_THRESHOLD;
}

function usagePercent(current: number, max: number): number {
  if (isUnlimited(max) || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

interface UsageMetric {
  key: string;
  label: string;
  current: number;
  max: number;
  ok: boolean;
}

function UsageBar({ metric }: { metric: UsageMetric }) {
  const unlimited = isUnlimited(metric.max);
  const percent = usagePercent(metric.current, metric.max);
  const warning = !unlimited && (percent >= WARN_PERCENT || !metric.ok);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{metric.label}</span>
        <span className={cn('font-medium', warning && 'text-amber-600 dark:text-amber-400')}>
          {metric.current}
          {unlimited ? ' · unlimited' : ` / ${metric.max}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            unlimited
              ? 'bg-emerald-500/40'
              : percent >= 100
                ? 'bg-red-500'
                : percent >= WARN_PERCENT
                  ? 'bg-amber-500'
                  : 'bg-primary',
          )}
          style={{ width: unlimited ? '8%' : `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Shows the operator's current plan limits and usage for the agent work loop
 * (runs, AI workers, chats), with an upgrade prompt surfaced inline — the
 * "see billing limits + upgrade prompts on the same loop" launch-gate step.
 */
export function PlanUsageSummary() {
  const { data: accountState, isLoading } = useAccountState();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const limits = accountState?.limits;
  const tierName =
    accountState?.subscription?.tier_display_name ||
    accountState?.tier?.display_name ||
    'Current plan';

  const metrics = useMemo<UsageMetric[]>(() => {
    if (!limits) return [];
    return [
      {
        key: 'concurrent_runs',
        label: 'Concurrent runs',
        current: limits.concurrent_runs.running_count,
        max: limits.concurrent_runs.limit,
        ok: limits.concurrent_runs.can_start,
      },
      {
        key: 'ai_worker_count',
        label: 'AI workers',
        current: limits.ai_worker_count.current_count,
        max: limits.ai_worker_count.limit,
        ok: limits.ai_worker_count.can_create,
      },
      {
        key: 'threads',
        label: 'Chats',
        current: limits.threads.current,
        max: limits.threads.max,
        ok: limits.threads.can_create,
      },
    ];
  }, [limits]);

  // Pick the most relevant upgrade context: a hard-blocked limit wins, then any
  // metric over the warning threshold, else a generic prompt.
  const { upgradeContext, atLimit } = useMemo<{
    upgradeContext: UpgradeContext;
    atLimit: boolean;
  }>(() => {
    const runs = metrics.find((m) => m.key === 'concurrent_runs');
    const workers = metrics.find((m) => m.key === 'ai_worker_count');
    if (runs && !runs.ok && !isUnlimited(runs.max)) {
      return { upgradeContext: 'run_limit_reached', atLimit: true };
    }
    if (workers && !workers.ok && !isUnlimited(workers.max)) {
      return { upgradeContext: 'agent_limit_reached', atLimit: true };
    }
    const approaching = metrics.some(
      (m) => !isUnlimited(m.max) && usagePercent(m.current, m.max) >= WARN_PERCENT,
    );
    return { upgradeContext: 'generic', atLimit: approaching };
  }, [metrics]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading plan usage…</p>;
  }

  if (!limits) {
    return (
      <p className="text-sm text-muted-foreground">
        Plan usage is unavailable. Billing data could not be loaded.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{tierName}</span>
        </div>
        <Badge variant="outline" className="rounded px-2 py-0.5 text-[11px]">
          {accountState?.subscription?.status ?? 'active'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <UsageBar key={metric.key} metric={metric} />
        ))}
      </div>

      {atLimit ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {upgradeContext === 'run_limit_reached'
              ? 'You have reached your concurrent run limit for this plan.'
              : upgradeContext === 'agent_limit_reached'
                ? 'You have reached your AI worker limit for this plan.'
                : 'You are approaching your plan limits.'}
          </p>
          <Button
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => setUpgradeOpen(true)}
          >
            <ArrowUpCircle className="mr-1 h-3.5 w-3.5" />
            Upgrade plan
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setUpgradeOpen(true)}
          >
            <ArrowUpCircle className="mr-1 h-3.5 w-3.5" />
            View upgrade options
          </Button>
        </div>
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        context={upgradeContext}
      />
    </div>
  );
}
