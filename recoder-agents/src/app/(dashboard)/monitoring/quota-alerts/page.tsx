'use client';

import { useState } from 'react';
import {
  Bell,
  BellOff,
  Plus,
  Trash2,
  Play,
  CheckCheck,
  Loader2,
  AlertTriangle,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useAlertRules,
  useCreateAlertRule,
  useUpdateAlertRule,
  useDeleteAlertRule,
  useCheckQuota,
  useAlertEvents,
  useMarkEventRead,
  useMarkAllEventsRead,
  useQuotaAlertStats,
  type QuotaAlertRule,
  type CreateAlertRuleData,
} from '@/hooks/monitoring/use-quota-alerts';
import type {
  MetricType,
  ComparisonOp,
  AlertChannel,
  ThresholdType,
} from '@/lib/api/quota-alerts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRIC_TYPES: MetricType[] = [
  'api_calls',
  'tokens',
  'cost_usd',
  'storage_mb',
  'agents_count',
  'threads_count',
];

const COMPARISON_LABELS: Record<ComparisonOp, string> = {
  gte: '≥',
  lte: '≤',
  gt: '>',
  lt: '<',
};

const CHANNEL_COLORS: Record<AlertChannel, string> = {
  in_app: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  email: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  webhook: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const METRIC_COLORS: Partial<Record<MetricType, string>> = {
  api_calls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  tokens: 'bg-green-500/10 text-green-400 border-green-500/20',
  cost_usd: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  storage_mb: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  agents_count: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  threads_count: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  icon: Icon,
  badge,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  badge?: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p className="text-xl font-semibold leading-tight">
            {value}
            {badge !== undefined && badge > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs h-5 px-1.5 font-bold">
                {badge}
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create Rule Dialog
// ---------------------------------------------------------------------------

const EMPTY_FORM: CreateAlertRuleData = {
  rule_name: '',
  metric_type: 'api_calls',
  threshold_value: 0,
  threshold_type: 'absolute',
  comparison: 'gte',
  alert_channel: 'in_app',
  cooldown_minutes: 60,
};

function CreateRuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState<CreateAlertRuleData>(EMPTY_FORM);
  const createMutation = useCreateAlertRule();

  const handleSubmit = async () => {
    if (!form.rule_name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    try {
      await createMutation.mutateAsync(form);
      toast.success('Alert rule created');
      onOpenChange(false);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Alert Rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Rule Name</Label>
            <Input
              placeholder="e.g. High Token Usage"
              value={form.rule_name}
              onChange={(e) => setForm((f) => ({ ...f, rule_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Metric Type</Label>
            <Select
              value={form.metric_type}
              onValueChange={(v) => setForm((f) => ({ ...f, metric_type: v as MetricType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_TYPES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Threshold Value</Label>
              <Input
                type="number"
                value={form.threshold_value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, threshold_value: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Threshold Type</Label>
              <Select
                value={form.threshold_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, threshold_type: v as ThresholdType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="absolute">Absolute</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Comparison</Label>
              <Select
                value={form.comparison}
                onValueChange={(v) => setForm((f) => ({ ...f, comparison: v as ComparisonOp }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gte">≥ (gte)</SelectItem>
                  <SelectItem value="lte">≤ (lte)</SelectItem>
                  <SelectItem value="gt">&gt; (gt)</SelectItem>
                  <SelectItem value="lt">&lt; (lt)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Alert Channel</Label>
              <Select
                value={form.alert_channel}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, alert_channel: v as AlertChannel }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_app">In App</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Cooldown (minutes)</Label>
            <Input
              type="number"
              min={1}
              value={form.cooldown_minutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, cooldown_minutes: parseInt(e.target.value) || 60 }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Simulate Check Panel
// ---------------------------------------------------------------------------

function SimulatePanel() {
  const [metricType, setMetricType] = useState<MetricType>('api_calls');
  const [metricValue, setMetricValue] = useState('');
  const [agentId, setAgentId] = useState('');
  const [result, setResult] = useState<{ triggered_count: number } | null>(null);
  const checkMutation = useCheckQuota();

  const handleCheck = async () => {
    if (!metricValue) {
      toast.error('Enter a metric value');
      return;
    }
    try {
      const res = await checkMutation.mutateAsync({
        metric_type: metricType,
        metric_value: parseFloat(metricValue),
        agent_id: agentId || undefined,
      });
      setResult(res);
      if (res.triggered_count > 0) {
        toast.warning(`${res.triggered_count} rule(s) triggered`);
      } else {
        toast.success('No rules triggered');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Simulate Check
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Metric Type</Label>
            <Select
              value={metricType}
              onValueChange={(v) => setMetricType(v as MetricType)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_TYPES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Metric Value</Label>
            <Input
              type="number"
              className="w-32"
              placeholder="0"
              value={metricValue}
              onChange={(e) => setMetricValue(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Agent ID (optional)</Label>
            <Input
              className="w-40"
              placeholder="agent-id"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
          <Button onClick={handleCheck} disabled={checkMutation.isPending}>
            {checkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="ml-1">Check</span>
          </Button>
        </div>
        {result !== null && (
          <p
            className={cn(
              'text-sm font-medium',
              result.triggered_count > 0 ? 'text-yellow-400' : 'text-green-400'
            )}
          >
            {result.triggered_count > 0
              ? `${result.triggered_count} rule(s) triggered`
              : 'No rules triggered'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function QuotaAlertsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: stats } = useQuotaAlertStats();
  const { data: rules, isLoading: rulesLoading } = useAlertRules();
  const { data: events, isLoading: eventsLoading } = useAlertEvents();
  const updateMutation = useUpdateAlertRule();
  const deleteMutation = useDeleteAlertRule();
  const markReadMutation = useMarkEventRead();
  const markAllReadMutation = useMarkAllEventsRead();

  const handleToggleActive = async (rule: QuotaAlertRule) => {
    try {
      await updateMutation.mutateAsync({ id: rule.id, data: { is_active: !rule.is_active } });
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this alert rule?')) return;
    try {
      await deleteMutation.mutateAsync(ruleId);
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleMarkRead = async (eventId: string) => {
    try {
      await markReadMutation.mutateAsync(eventId);
    } catch {
      toast.error('Failed to mark as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      toast.success('All events marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Quota Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define thresholds and receive alerts when usage limits are approached or exceeded.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Rules"
          value={stats?.active_rules_count ?? '—'}
          icon={Bell}
        />
        <StatCard
          title="Unread Events"
          value={stats?.unread_events_count ?? '—'}
          badge={stats?.unread_events_count}
          icon={AlertTriangle}
        />
        <StatCard
          title="Most Triggered Rule"
          value={stats?.most_triggered_rule ?? 'None'}
          icon={Activity}
        />
      </div>

      {/* Simulate Panel */}
      <SimulatePanel />

      {/* Tabs */}
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">
            Rules{' '}
            {rules && rules.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({rules.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="events">
            Events{' '}
            {stats?.unread_events_count ? (
              <span className="ml-1 rounded-full bg-red-500 text-white text-xs h-4 px-1 font-bold">
                {stats.unread_events_count}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Rules Tab */}
        <TabsContent value="rules" className="mt-4">
          {rulesLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading rules…
            </div>
          ) : !rules || rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <BellOff className="h-8 w-8" />
              <p>No alert rules yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Triggers</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.rule_name}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
                            METRIC_COLORS[rule.metric_type] ??
                              'bg-muted text-muted-foreground border-border'
                          )}
                        >
                          {rule.metric_type}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {COMPARISON_LABELS[rule.comparison]} {rule.threshold_value}
                        {rule.threshold_type === 'percentage' && '%'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {rule.agent_id ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
                            CHANNEL_COLORS[rule.alert_channel]
                          )}
                        >
                          {rule.alert_channel}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {rule.trigger_count}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() => handleToggleActive(rule)}
                          disabled={updateMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(rule.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {events?.length ?? 0} event(s) total
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading events…
            </div>
          ) : !events || events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <Bell className="h-8 w-8" />
              <p>No alert events yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    !ev.is_read
                      ? 'border-yellow-500/40 border-l-2 border-l-yellow-400 bg-yellow-500/5'
                      : 'border-border'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {ev.message ?? `Actual: ${ev.metric_value} vs Threshold: ${ev.threshold_value}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Actual: {ev.metric_value} &nbsp;·&nbsp; Threshold: {ev.threshold_value}{' '}
                      &nbsp;·&nbsp;{' '}
                      {new Date(ev.triggered_at).toLocaleString()}
                    </p>
                  </div>
                  {!ev.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => handleMarkRead(ev.id)}
                      disabled={markReadMutation.isPending}
                    >
                      Mark read
                    </Button>
                  )}
                  {ev.is_read && (
                    <span className="shrink-0 text-xs text-muted-foreground">read</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateRuleDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
