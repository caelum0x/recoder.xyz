'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Clock,
  Bot,
  Plus,
  Play,
  ChevronDown,
  ChevronUp,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useHealthOverview,
  useHealthChecks,
  useCreateHealthCheck,
  useDeleteHealthCheck,
  useRunHealthCheck,
  useHealthResults,
} from '@/hooks/agents/use-agent-health-checks';
import type { UptimeSummary, HealthCheckConfig, HealthCheckResult } from '@/lib/api/agent-health-checks';

// ============================================================================
// Constants
// ============================================================================

const STATUS_CONFIG = {
  healthy: {
    label: 'Healthy',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    icon: CheckCircle2,
    dot: 'bg-green-500',
  },
  degraded: {
    label: 'Degraded',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    icon: AlertTriangle,
    dot: 'bg-yellow-500',
  },
  unhealthy: {
    label: 'Unhealthy',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: XCircle,
    dot: 'bg-red-500',
  },
  timeout: {
    label: 'Timeout',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    icon: Timer,
    dot: 'bg-red-500',
  },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

function uptimeColor(pct: number): string {
  if (pct >= 99) return 'text-green-600 dark:text-green-400';
  if (pct >= 95) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? {
    label: status,
    color: 'bg-muted text-muted-foreground border-border',
    icon: Activity,
    dot: 'bg-muted-foreground',
  };
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        cfg.color
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ============================================================================
// Result History Table
// ============================================================================

function ResultHistory({ agentId, configId }: { agentId: string; configId: string }) {
  const { data: results, isLoading } = useHealthResults(agentId, configId, { limit: 20 });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (!results?.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        No results yet. Run a check to see history.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-3 font-medium">Checked At</th>
            <th className="text-left py-1.5 pr-3 font-medium">Status</th>
            <th className="text-right py-1.5 pr-3 font-medium">Response (ms)</th>
            <th className="text-left py-1.5 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-1.5 pr-3 text-muted-foreground">
                {new Date(r.checked_at).toLocaleString()}
              </td>
              <td className="py-1.5 pr-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                {r.response_time_ms !== null ? `${r.response_time_ms}ms` : '--'}
              </td>
              <td className="py-1.5 text-muted-foreground truncate max-w-[160px]">
                {r.error_message ?? '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Health Check Config Row
// ============================================================================

function HealthCheckRow({
  config,
  agentId,
}: {
  config: HealthCheckConfig;
  agentId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const runCheck = useRunHealthCheck(agentId);
  const deleteCheck = useDeleteHealthCheck(agentId);

  const handleRun = async () => {
    try {
      const result = await runCheck.mutateAsync(config.id);
      toast.success(`Check completed: ${result.status} (${result.response_time_ms}ms)`);
    } catch {
      toast.error('Failed to run health check');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCheck.mutateAsync(config.id);
      toast.success('Health check deleted');
    } catch {
      toast.error('Failed to delete health check');
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{config.check_name}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {config.check_type} · every {config.interval_minutes}min · timeout {config.timeout_seconds}s
          </p>
        </div>
        {config.last_status && <StatusBadge status={config.last_status} />}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleRun();
          }}
          disabled={runCheck.isPending}
        >
          {runCheck.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </Button>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {expanded && (
        <div className="px-4 py-3 border-t space-y-3">
          <ResultHistory agentId={agentId} configId={config.id} />
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-7 text-xs"
              onClick={handleDelete}
              disabled={deleteCheck.isPending}
            >
              Delete Check
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Add Health Check Dialog
// ============================================================================

function AddHealthCheckDialog({ agentId: defaultAgentId }: { agentId?: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    agent_id: defaultAgentId ?? '',
    check_name: '',
    check_type: 'ping' as 'ping' | 'api_call' | 'response_quality' | 'latency',
    interval_minutes: '60',
    timeout_seconds: '30',
    failure_threshold: '3',
  });

  const createCheck = useCreateHealthCheck(form.agent_id);

  const handleSubmit = async () => {
    if (!form.agent_id || !form.check_name) {
      toast.error('Agent ID and check name are required');
      return;
    }
    try {
      await createCheck.mutateAsync({
        check_name: form.check_name,
        check_type: form.check_type,
        interval_minutes: parseInt(form.interval_minutes, 10),
        timeout_seconds: parseInt(form.timeout_seconds, 10),
        failure_threshold: parseInt(form.failure_threshold, 10),
      });
      toast.success('Health check created');
      setOpen(false);
      setForm((f) => ({ ...f, check_name: '' }));
    } catch {
      toast.error('Failed to create health check');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Health Check
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Health Check</DialogTitle>
          <DialogDescription>Configure a periodic health check for an agent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Agent ID</Label>
            <Input
              value={form.agent_id}
              onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              placeholder="agent_abc123"
              disabled={!!defaultAgentId}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Check Name</Label>
            <Input
              value={form.check_name}
              onChange={(e) => setForm((f) => ({ ...f, check_name: e.target.value }))}
              placeholder="ping-check"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Check Type</Label>
            <Select
              value={form.check_type}
              onValueChange={(v) => setForm((f) => ({ ...f, check_type: v as typeof form.check_type }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ping">Ping</SelectItem>
                <SelectItem value="api_call">API Call</SelectItem>
                <SelectItem value="response_quality">Response Quality</SelectItem>
                <SelectItem value="latency">Latency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Interval (min)</Label>
              <Input
                type="number"
                value={form.interval_minutes}
                onChange={(e) => setForm((f) => ({ ...f, interval_minutes: e.target.value }))}
                min="1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timeout (s)</Label>
              <Input
                type="number"
                value={form.timeout_seconds}
                onChange={(e) => setForm((f) => ({ ...f, timeout_seconds: e.target.value }))}
                min="1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fail Threshold</Label>
              <Input
                type="number"
                value={form.failure_threshold}
                onChange={(e) => setForm((f) => ({ ...f, failure_threshold: e.target.value }))}
                min="1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createCheck.isPending}>
            {createCheck.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Agent Uptime Card
// ============================================================================

function AgentUptimeCard({ summary }: { summary: UptimeSummary }) {
  const [expanded, setExpanded] = useState(false);
  const { data: checks, isLoading: checksLoading } = useHealthChecks(
    expanded ? summary.agent_id : ''
  );

  const pctColor = uptimeColor(summary.uptime_pct);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Bot className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-sm font-mono truncate max-w-[180px]">
                {summary.agent_id}
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StatusBadge status={summary.last_status ?? 'healthy'} />
              </div>
            </div>
          </div>
          <p className={cn('text-2xl font-bold tabular-nums', pctColor)}>
            {summary.uptime_pct.toFixed(1)}%
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 text-xs text-center mb-3">
          <div>
            <p className="text-muted-foreground mb-0.5">Avg Response</p>
            <p className="font-medium">{summary.avg_response_ms}ms</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Total Checks</p>
            <p className="font-medium">{summary.total_checks}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Failures</p>
            <p className="font-medium">{summary.failed_checks}</p>
          </div>
        </div>

        {summary.last_checked_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
            <Clock className="h-3 w-3" />
            Last checked: {new Date(summary.last_checked_at).toLocaleString()}
          </p>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" /> Details
            </>
          )}
        </Button>

        {expanded && (
          <div className="mt-3 space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Health Checks</p>
              <AddHealthCheckDialog agentId={summary.agent_id} />
            </div>
            {checksLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !checks?.length ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                No checks configured.
              </p>
            ) : (
              <div className="space-y-2">
                {checks.map((c) => (
                  <HealthCheckRow key={c.id} config={c} agentId={summary.agent_id} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AgentHealthPage() {
  const { data: overview, isLoading, refetch } = useHealthOverview();
  const [autoRefresh, setAutoRefresh] = useState(false);

  const doRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(doRefetch, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, doRefetch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agent Health Overview</h2>
          <p className="text-sm text-muted-foreground">
            Monitor uptime and run health checks for all agents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">
              Auto-refresh (30s)
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <AddHealthCheckDialog />
        </div>
      </div>

      {/* Overview grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !overview?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No health data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a health check and run it to see agent uptime data.
            </p>
            <div className="mt-4">
              <AddHealthCheckDialog />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {overview.map((summary) => (
            <AgentUptimeCard key={summary.agent_id} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}
