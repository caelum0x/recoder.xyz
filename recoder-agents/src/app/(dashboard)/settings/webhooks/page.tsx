'use client';

import React, { useState } from 'react';
import {
  Webhook,
  Plus,
  Trash2,
  Pencil,
  Send,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Globe,
  Filter,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
} from '@/hooks/integrations/use-agent-webhooks';
import {
  WEBHOOK_EVENTS,
  type Webhook as WebhookType,
  type WebhookDelivery,
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
} from '@/lib/api/agent-webhooks';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateUrl(url: string, max = 50): string {
  if (url.length <= max) return url;
  return url.slice(0, max) + '...';
}

function deliverySuccessRate(
  delivered: number | undefined,
  total: number | undefined
): string {
  if (!total || total === 0) return 'N/A';
  const rate = ((delivered || 0) / total) * 100;
  return `${rate.toFixed(0)}%`;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'delivered':
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs">
          <CheckCircle className="mr-1 h-3 w-3" />
          Delivered
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="text-xs">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    case 'retrying':
      return (
        <Badge variant="secondary" className="text-xs">
          <RefreshCw className="mr-1 h-3 w-3" />
          Retrying
        </Badge>
      );
    case 'pending':
    default:
      return (
        <Badge variant="outline" className="text-xs">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

const EVENT_GROUPS = [
  {
    label: 'Run Events',
    events: WEBHOOK_EVENTS.filter((e) => e.group === 'Run Events'),
  },
  {
    label: 'Thread Events',
    events: WEBHOOK_EVENTS.filter((e) => e.group === 'Thread Events'),
  },
  {
    label: 'Agent Events',
    events: WEBHOOK_EVENTS.filter((e) => e.group === 'Agent Events'),
  },
];

// ---------------------------------------------------------------------------
// Create / Edit Dialog
// ---------------------------------------------------------------------------

function WebhookFormDialog({
  webhook,
  open,
  onOpenChange,
}: {
  webhook?: WebhookType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!webhook;
  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();

  const [name, setName] = useState(webhook?.name || '');
  const [url, setUrl] = useState(webhook?.url || '');
  const [secret, setSecret] = useState('');
  const [autoGenerateSecret, setAutoGenerateSecret] = useState(!isEdit);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    webhook?.events || []
  );
  const [retryCount, setRetryCount] = useState(String(webhook?.retry_count ?? 3));
  const [timeoutMs, setTimeoutMs] = useState(String(webhook?.timeout_ms ?? 5000));

  const isPending = createMutation.isPending || updateMutation.isPending;

  function toggleEvent(value: string) {
    setSelectedEvents((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim() || selectedEvents.length === 0) {
      toast.error('Please fill in name, URL, and select at least one event');
      return;
    }

    if (isEdit && webhook) {
      const data: UpdateWebhookRequest = {
        name: name.trim(),
        url: url.trim(),
        events: selectedEvents,
        retry_count: parseInt(retryCount, 10),
        timeout_ms: parseInt(timeoutMs, 10),
      };
      if (secret) data.secret = secret;
      await updateMutation.mutateAsync({ webhookId: webhook.id, data });
    } else {
      const data: CreateWebhookRequest = {
        name: name.trim(),
        url: url.trim(),
        events: selectedEvents,
        retry_count: parseInt(retryCount, 10),
        timeout_ms: parseInt(timeoutMs, 10),
      };
      if (!autoGenerateSecret && secret) data.secret = secret;
      await createMutation.mutateAsync(data);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Webhook' : 'New Webhook'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update webhook configuration.'
              : 'Configure a new webhook endpoint to receive event notifications.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-name">Name</Label>
            <Input
              id="webhook-name"
              placeholder="My Webhook"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://example.com/webhook"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="webhook-secret">Secret</Label>
              {!isEdit && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="auto-secret" className="text-xs text-muted-foreground">
                    Auto-generate
                  </Label>
                  <Switch
                    id="auto-secret"
                    checked={autoGenerateSecret}
                    onCheckedChange={setAutoGenerateSecret}
                  />
                </div>
              )}
            </div>
            {!autoGenerateSecret && (
              <Input
                id="webhook-secret"
                placeholder={isEdit ? 'Leave empty to keep current' : 'Enter secret'}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            )}
            {autoGenerateSecret && !isEdit && (
              <p className="text-xs text-muted-foreground">
                A secret will be auto-generated for signature verification.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Events</Label>
            {EVENT_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.events.map((evt) => (
                    <label
                      key={evt.value}
                      className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted"
                    >
                      <Checkbox
                        checked={selectedEvents.includes(evt.value)}
                        onCheckedChange={() => toggleEvent(evt.value)}
                      />
                      {evt.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="retry-count">Retry Count (1-5)</Label>
              <Input
                id="retry-count"
                type="number"
                min={1}
                max={5}
                value={retryCount}
                onChange={(e) => setRetryCount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeout-ms">Timeout (ms)</Label>
              <Input
                id="timeout-ms"
                type="number"
                min={1000}
                max={30000}
                step={1000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Webhook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delivery Log
// ---------------------------------------------------------------------------

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useWebhookDeliveries(webhookId, {
    status: statusFilter || undefined,
    limit: 20,
  });
  const retryMutation = useRetryDelivery();

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const deliveries = data?.deliveries || [];

  return (
    <div className="border-t">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="retrying">Retrying</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {data?.total ?? 0} total
        </span>
      </div>

      {deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 text-center">
          No deliveries yet.
        </p>
      ) : (
        <div className="divide-y max-h-64 overflow-y-auto">
          {deliveries.map((d) => (
            <div key={d.id} className="px-4 py-2.5 text-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getStatusBadge(d.status)}
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.event_type}
                  </span>
                  {d.response_status && (
                    <span className="text-xs text-muted-foreground">
                      HTTP {d.response_status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    Attempt {d.attempt}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(d.created_at)}
                  </span>
                </div>
              </div>
              {(d.status === 'failed' || d.status === 'retrying') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={retryMutation.isPending}
                  onClick={() => retryMutation.mutate(d.id)}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhook Card
// ---------------------------------------------------------------------------

function WebhookCard({ webhook }: { webhook: WebhookType }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();

  const successRate = deliverySuccessRate(
    webhook.delivered_count,
    webhook.total_delivery_count
  );

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{webhook.name}</span>
                {webhook.agent_id && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    Agent: {webhook.agent_id.slice(0, 8)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate font-mono">
                  {truncateUrl(webhook.url)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex flex-wrap gap-1 max-w-48">
              {webhook.events.slice(0, 3).map((evt) => (
                <Badge key={evt} variant="secondary" className="text-xs">
                  {evt}
                </Badge>
              ))}
              {webhook.events.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{webhook.events.length - 3}
                </Badge>
              )}
            </div>

            <div className="hidden md:flex flex-col items-end text-xs text-muted-foreground">
              <span>Success: {successRate}</span>
              <span>Last: {formatTime(webhook.last_delivery_at)}</span>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Switch
                    checked={webhook.is_active}
                    onCheckedChange={(checked) =>
                      updateMutation.mutate({
                        webhookId: webhook.id,
                        data: { is_active: checked },
                      })
                    }
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {webhook.is_active ? 'Active' : 'Inactive'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={testMutation.isPending}
              onClick={() => {
                testMutation.mutate(webhook.id, {
                  onSuccess: (delivery) => {
                    if (delivery.status === 'delivered') {
                      toast.success('Test delivery succeeded');
                    } else {
                      toast.error(`Test delivery failed: HTTP ${delivery.response_status || 'timeout'}`);
                    }
                    setExpanded(true);
                  },
                });
              }}
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {expanded && <DeliveryLog webhookId={webhook.id} />}
      </Card>

      {/* Edit dialog */}
      {editing && (
        <WebhookFormDialog
          webhook={webhook}
          open={editing}
          onOpenChange={setEditing}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Webhook</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{webhook.name}&quot;? This will also delete all
              delivery history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate(webhook.id, {
                  onSuccess: () => setConfirmDelete(false),
                });
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WebhooksSettingsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: webhooks, isLoading, error } = useWebhooks();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Receive real-time notifications when events happen in your workspace.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Webhook
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Failed to load webhooks. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !webhooks || webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No webhooks configured</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
              Create a webhook to receive HTTP notifications when events like agent runs,
              thread messages, or deployments occur.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookCard key={wh.id} webhook={wh} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      {createOpen && (
        <WebhookFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}
