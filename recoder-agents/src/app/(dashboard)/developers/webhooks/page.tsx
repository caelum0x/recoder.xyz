'use client';

import { useState, useCallback } from 'react';
import {
  Webhook,
  Plus,
  Pencil,
  Trash2,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
  useRevealSigningSecret,
  useRotateSigningSecret,
} from '@/hooks/platform/use-webhooks';
import {
  WEBHOOK_EVENTS,
  type WebhookEndpointListItem,
  type WebhookEndpoint,
} from '@/lib/api/webhooks';
import { toast } from '@/lib/toast';
import { WebhookVerificationGuide } from '@/components/developers/webhook-verification-guide';
import { RecentWebhookEvents } from '@/components/developers/webhook-event-log';

// ---------------------------------------------------------------------------
// Delivery status helpers
// ---------------------------------------------------------------------------

function DeliveryStatusBadge({
  deliveredAt,
  failedAt,
}: {
  deliveredAt?: string;
  failedAt?: string;
}) {
  if (deliveredAt) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        <CheckCircle2 className="h-3 w-3" />
        Delivered
      </Badge>
    );
  }
  if (failedAt) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400"
      >
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
    >
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Delivery list for an endpoint
// ---------------------------------------------------------------------------

function DeliveryList({ webhookId }: { webhookId: string }) {
  const { data, isLoading } = useWebhookDeliveries(webhookId);
  const retryMutation = useRetryDelivery();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const deliveries = data?.deliveries ?? [];

  if (deliveries.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No deliveries yet. Send a test event to see delivery history.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {deliveries.map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-3 px-4 py-2.5 text-sm"
        >
          <DeliveryStatusBadge
            deliveredAt={d.delivered_at}
            failedAt={d.failed_at}
          />
          <code className="flex-shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-xs font-mono">
            {d.event}
          </code>
          {d.response_status && (
            <span className="text-xs text-muted-foreground">
              HTTP {d.response_status}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {d.attempts}/{d.max_attempts} attempts
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(d.created_at).toLocaleString()}
          </span>
          {!d.delivered_at && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={retryMutation.isPending}
              onClick={() => {
                retryMutation.mutate(d.id, {
                  onSuccess: (res) => {
                    if (res.success) {
                      toast.success('Delivery retried');
                    } else {
                      toast.error(res.message || 'Retry failed');
                    }
                  },
                });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhook card
// ---------------------------------------------------------------------------

function SigningSecretSection({ webhookId }: { webhookId: string }) {
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const revealMutation = useRevealSigningSecret();
  const rotateMutation = useRotateSigningSecret();

  const handleReveal = () => {
    if (revealedSecret) {
      setShowSecret((v) => !v);
      return;
    }
    revealMutation.mutate(webhookId, {
      onSuccess: (data) => {
        setRevealedSecret(data.signing_secret);
        setShowSecret(true);
      },
      onError: () => {
        toast.error('Failed to reveal signing secret');
      },
    });
  };

  const handleRotate = () => {
    rotateMutation.mutate(webhookId, {
      onSuccess: (data) => {
        setRevealedSecret(data.signing_secret);
        setShowSecret(true);
        toast.success('Signing secret rotated');
      },
      onError: () => {
        toast.error('Failed to rotate signing secret');
      },
    });
  };

  const handleCopy = () => {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(revealedSecret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Signing Secret
        </h4>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 min-w-0">
          <code className="text-xs font-mono text-foreground truncate flex-1">
            {revealedSecret
              ? showSecret
                ? revealedSecret
                : `${revealedSecret.slice(0, 8)}${'*'.repeat(24)}`
              : '********************************'}
          </code>
          {revealedSecret && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => setShowSecret((v) => !v)}
              >
                {showSecret ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs h-7 flex-shrink-0"
          onClick={handleReveal}
          disabled={revealMutation.isPending}
        >
          <Eye className="h-3 w-3" />
          {revealedSecret ? 'Toggle' : 'Reveal'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs h-7 flex-shrink-0"
          onClick={handleRotate}
          disabled={rotateMutation.isPending}
        >
          <RotateCw className={cn('h-3 w-3', rotateMutation.isPending && 'animate-spin')} />
          Rotate
        </Button>
      </div>
    </div>
  );
}

function WebhookCard({
  webhook,
  onEdit,
  onDelete,
  onTest,
  onToggle,
}: {
  webhook: WebhookEndpointListItem;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggle: (active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button
          type="button"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* URL */}
        <code className="text-sm font-mono text-foreground truncate flex-1">
          {webhook.url}
        </code>

        {/* Event count badge */}
        <Badge variant="secondary" className="flex-shrink-0">
          {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
        </Badge>

        {/* Active toggle */}
        <Switch
          checked={webhook.active}
          onCheckedChange={onToggle}
          aria-label="Toggle webhook active"
        />

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onTest}
            title="Send test event"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Description */}
      {webhook.description && (
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          {webhook.description}
        </p>
      )}

      {/* Expanded: signing secret + delivery history */}
      {expanded && (
        <div className="border-t border-border">
          {/* Signing secret section */}
          <SigningSecretSection webhookId={webhook.id} />

          {/* Delivery history */}
          <div className="border-t border-border">
            <div className="px-4 pt-3 pb-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Deliveries
              </h4>
            </div>
            <DeliveryList webhookId={webhook.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit dialog
// ---------------------------------------------------------------------------

function WebhookDialog({
  open,
  onOpenChange,
  editingWebhook,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingWebhook?: WebhookEndpointListItem | null;
}) {
  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();

  const [url, setUrl] = useState(editingWebhook?.url ?? '');
  const [description, setDescription] = useState(
    editingWebhook?.description ?? '',
  );
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    editingWebhook?.events ?? [],
  );
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const isEditing = !!editingWebhook;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleEventToggle = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    );
  };

  const handleSubmit = async () => {
    if (!url.trim() || selectedEvents.length === 0) return;

    if (isEditing) {
      updateMutation.mutate(
        {
          id: editingWebhook.id,
          payload: {
            url: url.trim(),
            events: selectedEvents,
            description: description.trim() || undefined,
          },
        },
        {
          onSuccess: () => {
            toast.success('Webhook updated');
            onOpenChange(false);
          },
        },
      );
    } else {
      createMutation.mutate(
        {
          url: url.trim(),
          events: selectedEvents,
          description: description.trim() || undefined,
        },
        {
          onSuccess: (data) => {
            toast.success('Webhook created');
            setCreatedSecret(data.secret);
          },
        },
      );
    }
  };

  const handleCopySecret = useCallback(() => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret).then(() => {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    });
  }, [createdSecret]);

  // If we just created a webhook, show the secret screen
  if (createdSecret) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Signing Secret</DialogTitle>
            <DialogDescription>
              Copy this secret now. It will not be shown again in full. Use it
              to verify webhook signatures.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <code className="text-xs font-mono text-foreground flex-1 break-all">
              {showSecret ? createdSecret : `${createdSecret.slice(0, 8)}${'*'.repeat(56)}`}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => setShowSecret((v) => !v)}
            >
              {showSecret ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleCopySecret}
            >
              {secretCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Webhook Endpoint' : 'Add Webhook Endpoint'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the URL, events, or description for this endpoint.'
              : 'Configure a URL to receive webhook events from Recoder.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Endpoint URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/recoder"
              className={cn(
                'w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono',
                'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
              )}
            />
          </div>

          {/* Events */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <Checkbox
                    checked={selectedEvents.includes(event)}
                    onCheckedChange={() => handleEventToggle(event)}
                  />
                  <code className="text-xs font-mono">{event}</code>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Description{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Production event handler"
              rows={2}
              className={cn(
                'w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none',
                'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
              )}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!url.trim() || selectedEvents.length === 0 || isPending}
          >
            {isPending
              ? 'Saving...'
              : isEditing
                ? 'Update Endpoint'
                : 'Create Endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteDialog({
  open,
  onOpenChange,
  webhook,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: WebhookEndpointListItem | null;
  onConfirm: () => void;
}) {
  const deleteMutation = useDeleteWebhook();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Webhook</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this webhook endpoint? All delivery
            history will also be removed. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {webhook && (
          <code className="rounded-md bg-muted/50 px-3 py-2 text-xs font-mono text-foreground break-all">
            {webhook.url}
          </code>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!webhook) return;
              deleteMutation.mutate(webhook.id, {
                onSuccess: () => {
                  toast.success('Webhook deleted');
                  onConfirm();
                  onOpenChange(false);
                },
              });
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="ml-auto h-5 w-20" />
            <Skeleton className="h-5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 px-6 text-center">
      <div className="p-3 rounded-full bg-primary/10 mb-4">
        <Webhook className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No webhook endpoints</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Create a webhook endpoint to receive real-time notifications when events
        happen in your account -- agent creation, thread completion, and more.
      </p>
      <Button onClick={onAdd} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add Endpoint
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const updateMutation = useUpdateWebhook();
  const testMutation = useTestWebhook();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] =
    useState<WebhookEndpointListItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<WebhookEndpointListItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleEdit = (webhook: WebhookEndpointListItem) => {
    setEditingWebhook(webhook);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingWebhook(null);
    setDialogOpen(true);
  };

  const handleDelete = (webhook: WebhookEndpointListItem) => {
    setDeleteTarget(webhook);
    setDeleteOpen(true);
  };

  const handleTest = (webhook: WebhookEndpointListItem) => {
    testMutation.mutate(webhook.id, {
      onSuccess: (res) => {
        if (res.success) {
          toast.success('Test webhook sent');
        } else {
          toast.error(res.message || 'Test failed');
        }
      },
    });
  };

  const handleToggle = (webhook: WebhookEndpointListItem, active: boolean) => {
    updateMutation.mutate({
      id: webhook.id,
      payload: { active },
    });
  };

  return (
    <div className="min-h-[100dvh]">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Webhook className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold">Webhooks</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-lg">
              Receive real-time HTTP callbacks when events occur in your Recoder
              account. Configure endpoints, manage subscriptions, and monitor
              delivery status.
            </p>
          </div>
          {webhooks && webhooks.length > 0 && (
            <Button onClick={handleAdd} className="gap-1.5 flex-shrink-0">
              <Plus className="h-4 w-4" />
              Add Endpoint
            </Button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : !webhooks || webhooks.length === 0 ? (
          <EmptyState onAdd={handleAdd} />
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => (
              <WebhookCard
                key={wh.id}
                webhook={wh}
                onEdit={() => handleEdit(wh)}
                onDelete={() => handleDelete(wh)}
                onTest={() => handleTest(wh)}
                onToggle={(active) => handleToggle(wh, active)}
              />
            ))}
          </div>
        )}

        {/* Event Log */}
        {webhooks && webhooks.length > 0 && <RecentWebhookEvents />}

        {/* Verification Guide */}
        <WebhookVerificationGuide />
      </div>

      {/* Create / Edit dialog */}
      {dialogOpen && (
        <WebhookDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingWebhook(null);
          }}
          editingWebhook={editingWebhook}
        />
      )}

      {/* Delete dialog */}
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        webhook={deleteTarget}
        onConfirm={() => setDeleteTarget(null)}
      />
    </div>
  );
}
