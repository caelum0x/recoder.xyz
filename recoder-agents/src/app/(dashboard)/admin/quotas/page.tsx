'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Shield,
  ShieldOff,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import {
  useQuotasOverview,
  useQuotaAlerts,
} from '@/hooks/agents/use-agent-quotas';
import type { QuotaOverviewItem, QuotaAlert } from '@/lib/api/agent-quotas';

// ---- Helpers ----

function getStatusBadge(pct: number | null): React.ReactNode {
  if (pct === null) return <Badge variant="outline" className="text-[10px]">No limit</Badge>;
  if (pct >= 100) return <Badge variant="destructive" className="text-[10px]">Exceeded</Badge>;
  if (pct >= 80) return <Badge className="text-[10px] bg-red-500/10 text-red-500 border-red-500/20">Warning</Badge>;
  if (pct >= 60) return <Badge className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">Approaching</Badge>;
  return <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">OK</Badge>;
}

function formatPct(pct: number | null): string {
  if (pct === null) return '--';
  return `${pct.toFixed(1)}%`;
}

function getMaxPct(item: QuotaOverviewItem): number {
  const pcts = [
    item.daily_runs_pct,
    item.daily_tokens_pct,
    item.daily_cost_pct,
    item.monthly_runs_pct,
    item.monthly_tokens_pct,
    item.monthly_cost_pct,
  ].filter((p): p is number => p !== null);
  return pcts.length > 0 ? Math.max(...pcts) : -1;
}

// ---- Alert Banner ----

function AlertBanner({ alerts }: { alerts: QuotaAlert[] }) {
  if (alerts.length === 0) return null;

  const totalExceeded = alerts.reduce(
    (count, a) => count + a.alerts.filter((ai) => ai.exceeded).length,
    0
  );
  const totalWarning = alerts.reduce(
    (count, a) => count + a.alerts.filter((ai) => !ai.exceeded).length,
    0
  );

  return (
    <SpotlightCard className="p-4 border-red-500/20 bg-red-500/5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium text-foreground">
            Quota Alerts Active
          </p>
          <p className="text-xs text-muted-foreground">
            {totalExceeded > 0 && (
              <span className="text-red-500 font-medium">{totalExceeded} limit(s) exceeded</span>
            )}
            {totalExceeded > 0 && totalWarning > 0 && ' and '}
            {totalWarning > 0 && (
              <span className="text-amber-500 font-medium">{totalWarning} approaching limit(s)</span>
            )}
            {' across '}{alerts.length} agent(s).
          </p>
          <div className="space-y-1.5 mt-2">
            {alerts.map((alert) => (
              <div key={alert.agent_id} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{alert.agent_name}:</span>
                <div className="flex gap-1 flex-wrap">
                  {alert.alerts.map((ai, idx) => (
                    <Badge
                      key={idx}
                      variant={ai.exceeded ? 'destructive' : 'outline'}
                      className="text-[10px]"
                    >
                      {ai.metric} ({ai.pct.toFixed(0)}%)
                    </Badge>
                  ))}
                </div>
                {alert.is_enforced && (
                  <Shield className="h-3 w-3 text-primary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ---- Main Page ----

export default function AdminQuotasPage() {
  const { data: overview, isLoading: overviewLoading } = useQuotasOverview();
  const { data: alerts, isLoading: alertsLoading } = useQuotaAlerts();

  const [searchQuery, setSearchQuery] = useState('');
  const [onlyNearLimit, setOnlyNearLimit] = useState(false);

  const isLoading = overviewLoading || alertsLoading;

  // Filter and sort
  const filteredOverview = useMemo(() => {
    if (!overview) return [];
    let items = [...overview];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.agent_name?.toLowerCase().includes(q));
    }

    // Near/over limit filter
    if (onlyNearLimit) {
      items = items.filter((i) => {
        const maxP = getMaxPct(i);
        return maxP >= 60;
      });
    }

    // Sort: agents with highest usage percentage first
    items.sort((a, b) => getMaxPct(b) - getMaxPct(a));

    return items;
  }, [overview, searchQuery, onlyNearLimit]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Agent Quotas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor and manage usage limits across all agents
            </p>
          </div>
        </div>

        {/* Alert Banner */}
        {alerts && alerts.length > 0 && <AlertBanner alerts={alerts} />}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="near-limit-filter"
              checked={onlyNearLimit}
              onCheckedChange={setOnlyNearLimit}
            />
            <Label htmlFor="near-limit-filter" className="text-sm text-muted-foreground cursor-pointer">
              Only near/over limits
            </Label>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SpotlightCard className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Agents</p>
            <p className="text-2xl font-semibold mt-1">{overview?.length ?? 0}</p>
          </SpotlightCard>
          <SpotlightCard className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">With Quotas</p>
            <p className="text-2xl font-semibold mt-1">
              {overview?.filter((o) => o.has_quota).length ?? 0}
            </p>
          </SpotlightCard>
          <SpotlightCard className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Enforcing</p>
            <p className="text-2xl font-semibold mt-1">
              {overview?.filter((o) => o.is_enforced).length ?? 0}
            </p>
          </SpotlightCard>
          <SpotlightCard className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Alerts Active</p>
            <p className="text-2xl font-semibold mt-1 text-red-500">
              {alerts?.length ?? 0}
            </p>
          </SpotlightCard>
        </div>

        {/* Overview Table */}
        <SpotlightCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Agent
                  </th>
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Daily Usage
                  </th>
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Monthly Usage
                  </th>
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Enforcement
                  </th>
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOverview.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center p-8 text-muted-foreground">
                      {searchQuery || onlyNearLimit
                        ? 'No agents match the current filters.'
                        : 'No agents found.'}
                    </td>
                  </tr>
                )}
                {filteredOverview.map((item) => {
                  const maxDailyPct = Math.max(
                    item.daily_runs_pct ?? -1,
                    item.daily_tokens_pct ?? -1,
                    item.daily_cost_pct ?? -1
                  );
                  const maxMonthlyPct = Math.max(
                    item.monthly_runs_pct ?? -1,
                    item.monthly_tokens_pct ?? -1,
                    item.monthly_cost_pct ?? -1
                  );

                  return (
                    <tr
                      key={item.agent_id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-medium text-foreground">
                          {item.agent_name || 'Unnamed Agent'}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {item.agent_id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {item.has_quota ? (
                          <div className="space-y-1">
                            <span className={cn(
                              'text-sm font-medium',
                              maxDailyPct >= 80 ? 'text-red-500' : maxDailyPct >= 60 ? 'text-amber-500' : 'text-foreground'
                            )}>
                              {maxDailyPct >= 0 ? `${maxDailyPct.toFixed(1)}%` : '--'}
                            </span>
                            {getStatusBadge(maxDailyPct >= 0 ? maxDailyPct : null)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No limit</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.has_quota ? (
                          <div className="space-y-1">
                            <span className={cn(
                              'text-sm font-medium',
                              maxMonthlyPct >= 80 ? 'text-red-500' : maxMonthlyPct >= 60 ? 'text-amber-500' : 'text-foreground'
                            )}>
                              {maxMonthlyPct >= 0 ? `${maxMonthlyPct.toFixed(1)}%` : '--'}
                            </span>
                            {getStatusBadge(maxMonthlyPct >= 0 ? maxMonthlyPct : null)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No limit</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.is_enforced ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="text-xs text-primary font-medium">Active</span>
                          </div>
                        ) : item.has_quota ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <ShieldOff className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Advisory</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {getStatusBadge(getMaxPct(item) >= 0 ? getMaxPct(item) : null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}
