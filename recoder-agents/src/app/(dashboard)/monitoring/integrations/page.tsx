'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Clock,
  Plus,
  Timer,
  Trash2,
  Pencil,
  History,
  Zap,
  Globe,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  useIntegrationOverview,
  useIntegrationStats,
  useRegisterEndpoint,
  useUpdateEndpoint,
  useDeleteEndpoint,
  useCheckEndpoint,
  useEndpointHistory,
  type IntegrationOverview,
  type RegisterEndpointData,
} from '@/hooks/monitoring/use-integration-health';

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
  down: {
    label: 'Down',
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

const INTEGRATION_TYPES = ['webhook', 'api', 'oauth', 'database', 'stream'] as const;
type IntegrationType = (typeof INTEGRATION_TYPES)[number];

const TYPE_COLORS: Record<IntegrationType, string> = {
  webhook: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  api: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  oauth: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  database: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  stream: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
};

function uptimeColor(pct: number): string {
  if (pct >= 99) return 'text-green-600 dark:text-green-400';
  if (pct >= 95) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

// ============================================================================
// StatusBadge
// ============================================================================

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
// History Sheet
// ============================================================================

function HistorySheet({
  endpoint,
  open,
  onOpenChange,
}: {
  endpoint: IntegrationOverview;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: history, isLoading } = useEndpointHistory(open ? endpoint.id : '', 50);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Check History</SheetTitle>
          <SheetDescription>{endpoint.endpoint_name}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !history?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No checks yet. Click "Check Now" on the endpoint card.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-3 font-medium">Checked At</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Response (ms)</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Code</th>
                    <th className="text-left py-1.5 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                        {new Date(h.checked_at).toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-3">
                        <StatusBadge status={h.status} />
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {h.response_time_ms !== null ? `${h.response_time_ms}ms` : '--'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {h.status_code ?? '--'}
                      </td>
                      <td className="py-1.5 text-muted-foreground truncate max-w-[140px]">
                        {h.error_message ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Edit Endpoint Dialog
// ============================================================================

function EditEndpointDialog({
  endpoint,
  open,
  onOpenChange,
}: {
  endpoint: IntegrationOverview;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState({
    endpoint_name: endpoint.endpoint_name,
    endpoint_url: endpoint.endpoint_url,
    integration_type: endpoint.integration_type as IntegrationType,
    check_interval_minutes: String(endpoint.check_interval_minutes),
    timeout_seconds: String(endpoint.timeout_seconds),
    expected_status_code: String(endpoint.expected_status_code),
    is_active: endpoint.is_active,
  });

  const updateMutation = useUpdateEndpoint();

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: endpoint.id,
        data: {
          endpoint_name: form.endpoint_name,
          endpoint_url: form.endpoint_url,
          integration_type: form.integration_type,
          check_interval_minutes: parseInt(form.check_interval_minutes, 10),
          timeout_seconds: parseInt(form.timeout_seconds, 10),
          expected_status_code: parseInt(form.expected_status_code, 10),
          is_active: form.is_active,
        },
      });
      toast.success('Endpoint updated');
      onOpenChange(false);
    } catch {
      toast.error('Failed to update endpoint');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Endpoint</DialogTitle>
          <DialogDescription>Update integration endpoint settings.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Endpoint Name</Label>
            <Input
              value={form.endpoint_name}
              onChange={(e) => setForm((f) => ({ ...f, endpoint_name: e.target.value }))}
              placeholder="my-webhook"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              value={form.endpoint_url}
              onChange={(e) => setForm((f) => ({ ...f, endpoint_url: e.target.value }))}
              placeholder="https://example.com/webhook"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Integration Type</Label>
            <Select
              value={form.integration_type}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, integration_type: v as IntegrationType }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTEGRATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Interval (min)</Label>
              <Input
                type="number"
                min="1"
                value={form.check_interval_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, check_interval_minutes: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timeout (s)</Label>
              <Input
                type="number"
                min="1"
                value={form.timeout_seconds}
                onChange={(e) => setForm((f) => ({ ...f, timeout_seconds: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Code</Label>
              <Input
                type="number"
                value={form.expected_status_code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expected_status_code: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="edit-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label htmlFor="edit-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Register Endpoint Dialog
// ============================================================================

const DEFAULT_FORM: RegisterEndpointData & {
  check_interval_minutes_str: string;
  timeout_seconds_str: string;
  expected_status_code_str: string;
} = {
  endpoint_name: '',
  endpoint_url: '',
  integration_type: 'webhook',
  check_interval_minutes: 60,
  check_interval_minutes_str: '60',
  timeout_seconds: 10,
  timeout_seconds_str: '10',
  expected_status_code: 200,
  expected_status_code_str: '200',
  is_active: true,
};

function RegisterEndpointDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const registerMutation = useRegisterEndpoint();

  const handleSubmit = async () => {
    if (!form.endpoint_name || !form.endpoint_url) {
      toast.error('Endpoint name and URL are required');
      return;
    }
    try {
      await registerMutation.mutateAsync({
        endpoint_name: form.endpoint_name,
        endpoint_url: form.endpoint_url,
        integration_type: form.integration_type,
        check_interval_minutes: parseInt(form.check_interval_minutes_str, 10),
        timeout_seconds: parseInt(form.timeout_seconds_str, 10),
        expected_status_code: parseInt(form.expected_status_code_str, 10),
        is_active: form.is_active,
      });
      toast.success('Endpoint registered');
      setOpen(false);
      setForm(DEFAULT_FORM);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register endpoint';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Register Endpoint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register Integration Endpoint</DialogTitle>
          <DialogDescription>
            Add a new endpoint to monitor for availability and response time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Endpoint Name</Label>
            <Input
              value={form.endpoint_name}
              onChange={(e) => setForm((f) => ({ ...f, endpoint_name: e.target.value }))}
              placeholder="stripe-webhook"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              value={form.endpoint_url}
              onChange={(e) => setForm((f) => ({ ...f, endpoint_url: e.target.value }))}
              placeholder="https://api.example.com/webhook"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Integration Type</Label>
            <Select
              value={form.integration_type}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, integration_type: v as IntegrationType }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTEGRATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Interval (min)</Label>
              <Input
                type="number"
                min="1"
                value={form.check_interval_minutes_str}
                onChange={(e) =>
                  setForm((f) => ({ ...f, check_interval_minutes_str: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timeout (s)</Label>
              <Input
                type="number"
                min="1"
                value={form.timeout_seconds_str}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timeout_seconds_str: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Code</Label>
              <Input
                type="number"
                value={form.expected_status_code_str}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expected_status_code_str: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="register-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label htmlFor="register-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={registerMutation.isPending}>
            {registerMutation.isPending ? 'Registering…' : 'Register'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Endpoint Card
// ============================================================================

function EndpointCard({ endpoint }: { endpoint: IntegrationOverview }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const checkMutation = useCheckEndpoint();
  const deleteMutation = useDeleteEndpoint();

  const statusCfg = STATUS_CONFIG[endpoint.last_status as StatusKey] ?? STATUS_CONFIG.healthy;
  const typeColor = TYPE_COLORS[endpoint.integration_type as IntegrationType] ?? 'bg-muted text-muted-foreground border-border';
  const pctColor = uptimeColor(Number(endpoint.uptime_pct));

  const handleCheck = async () => {
    try {
      const result = await checkMutation.mutateAsync(endpoint.id);
      const msg = `${result.status} — ${result.response_time_ms}ms`;
      if (result.status === 'healthy') {
        toast.success(msg);
      } else if (result.status === 'degraded') {
        toast.warning(msg);
      } else {
        toast.error(msg);
      }
    } catch {
      toast.error('Check failed');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(endpoint.id);
      toast.success('Endpoint deleted');
    } catch {
      toast.error('Failed to delete endpoint');
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-medium truncate">
                  {endpoint.endpoint_name}
                </CardTitle>
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium border capitalize',
                    typeColor
                  )}
                >
                  {endpoint.integration_type}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                <Globe className="h-3 w-3 shrink-0" />
                {endpoint.endpoint_url}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', statusCfg.dot)} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {/* Stats row */}
          <div className="flex items-center justify-between">
            <span className={cn('text-lg font-bold tabular-nums', pctColor)}>
              {Number(endpoint.uptime_pct).toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground">uptime</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-center">
            <div className="bg-muted/40 rounded-md py-1.5">
              <p className="text-muted-foreground mb-0.5">Avg Response</p>
              <p className="font-medium tabular-nums">{endpoint.avg_response_ms}ms</p>
            </div>
            <div className="bg-muted/40 rounded-md py-1.5">
              <p className="text-muted-foreground mb-0.5">Status</p>
              <p className="font-medium capitalize">{endpoint.last_status}</p>
            </div>
          </div>

          {endpoint.last_checked_at && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {new Date(endpoint.last_checked_at).toLocaleString()}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 pt-1 flex-wrap">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs flex-1"
              onClick={handleCheck}
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Zap className="h-3 w-3 mr-1" />
              )}
              Check Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2 text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <HistorySheet endpoint={endpoint} open={historyOpen} onOpenChange={setHistoryOpen} />
      <EditEndpointDialog endpoint={endpoint} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

// ============================================================================
// Stats Row
// ============================================================================

function StatsRow() {
  const { data: stats, isLoading } = useIntegrationStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  const items = [
    {
      label: 'Total Endpoints',
      value: stats?.total_endpoints ?? 0,
      color: 'text-foreground',
      icon: Activity,
    },
    {
      label: 'Healthy',
      value: stats?.healthy_count ?? 0,
      color: 'text-green-600 dark:text-green-400',
      icon: CheckCircle2,
    },
    {
      label: 'Degraded',
      value: stats?.degraded_count ?? 0,
      color: 'text-yellow-600 dark:text-yellow-400',
      icon: AlertTriangle,
    },
    {
      label: 'Down',
      value: stats?.down_count ?? 0,
      color: 'text-red-600 dark:text-red-400',
      icon: XCircle,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map(({ label, value, color, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2.5">
              <Icon className={cn('h-5 w-5', color)} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function IntegrationHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data: overview, isLoading, refetch } = useIntegrationOverview(autoRefresh);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Integration Health</h2>
          <p className="text-sm text-muted-foreground">
            Monitor uptime and response times for your integration endpoints.
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
              Auto-Refresh (30s)
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <RegisterEndpointDialog />
        </div>
      </div>

      {/* Stats */}
      <StatsRow />

      {/* Endpoint Grid */}
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
            <p className="font-medium">No endpoints registered</p>
            <p className="text-sm text-muted-foreground mt-1">
              Register an integration endpoint to start monitoring its health.
            </p>
            <div className="mt-4 flex justify-center">
              <RegisterEndpointDialog />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {overview.map((ep) => (
            <EndpointCard key={ep.id} endpoint={ep} />
          ))}
        </div>
      )}
    </div>
  );
}
