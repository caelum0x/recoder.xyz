'use client';

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { KeyRound, Plus, Eye, EyeOff, Trash2, Pencil, ClipboardCopy, ShieldCheck, Clock, AlertTriangle, ScrollText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { format, parseISO, isPast } from 'date-fns';
import {
  useSecrets,
  useSecretStats,
  useCreateSecret,
  useUpdateSecret,
  useDeleteSecret,
  useRevealSecret,
  useSecretAccessLog,
} from '@/hooks/agents/use-agent-secrets';
import { type AgentSecret, type SecretType } from '@/lib/api/agent-secrets';

const SECRET_TYPES: { value: SecretType; label: string }[] = [
  { value: 'api_key', label: 'API Key' },
  { value: 'token', label: 'Token' },
  { value: 'password', label: 'Password' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other' },
];

function secretTypeBadgeClass(type: SecretType) {
  switch (type) {
    case 'api_key': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'token': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'password': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'certificate': return 'bg-green-500/10 text-green-500 border-green-500/20';
    default: return 'bg-muted text-muted-foreground';
  }
}

// ---------------------------------------------------------------------------
// Create / Edit Dialog
// ---------------------------------------------------------------------------

interface SecretFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: AgentSecret;
}

function SecretFormDialog({ open, onOpenChange, existing }: SecretFormDialogProps) {
  const [form, setForm] = useState({
    secret_name: existing?.secret_name ?? '',
    secret_value: '',
    description: existing?.description ?? '',
    secret_type: (existing?.secret_type ?? 'api_key') as SecretType,
    agent_id: existing?.agent_id ?? '',
    expires_at: existing?.expires_at ? existing.expires_at.slice(0, 16) : '',
  });

  const createSecret = useCreateSecret();
  const updateSecret = useUpdateSecret();

  const isPending = createSecret.isPending || updateSecret.isPending;

  function handleField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (existing) {
        const data: Record<string, unknown> = {
          secret_name: form.secret_name,
          description: form.description || undefined,
          secret_type: form.secret_type,
          expires_at: form.expires_at || undefined,
        };
        if (form.secret_value) data.secret_value = form.secret_value;
        await updateSecret.mutateAsync({ secretId: existing.id, data });
        toast.success('Secret updated');
      } else {
        await createSecret.mutateAsync({
          secret_name: form.secret_name,
          secret_value: form.secret_value,
          description: form.description || undefined,
          secret_type: form.secret_type,
          agent_id: form.agent_id || undefined,
          expires_at: form.expires_at || undefined,
        });
        toast.success('Secret created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save secret');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Secret' : 'Create Secret'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="secret_name">Name *</Label>
            <Input
              id="secret_name"
              value={form.secret_name}
              onChange={(e) => handleField('secret_name', e.target.value)}
              placeholder="MY_API_KEY"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secret_value">
              Value {existing ? '(leave blank to keep current)' : '*'}
            </Label>
            <Input
              id="secret_value"
              type="password"
              value={form.secret_value}
              onChange={(e) => handleField('secret_value', e.target.value)}
              placeholder="sk-..."
              required={!existing}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secret_type">Type</Label>
            <Select
              value={form.secret_type}
              onValueChange={(v) => handleField('secret_type', v)}
            >
              <SelectTrigger id="secret_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECRET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => handleField('description', e.target.value)}
              placeholder="What is this secret used for?"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent_id">Agent ID (optional)</Label>
            <Input
              id="agent_id"
              value={form.agent_id}
              onChange={(e) => handleField('agent_id', e.target.value)}
              placeholder="agent-uuid"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expires_at">Expires At (optional)</Label>
            <Input
              id="expires_at"
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => handleField('expires_at', e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : existing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reveal Dialog
// ---------------------------------------------------------------------------

interface RevealDialogProps {
  secret: AgentSecret;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RevealDialog({ secret, open, onOpenChange }: RevealDialogProps) {
  const [confirming, setConfirming] = useState(true);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);
  const revealSecret = useRevealSecret();

  async function handleReveal() {
    try {
      const result = await revealSecret.mutateAsync(secret.id);
      setRevealed(result.secret_value);
      setConfirming(false);
      let c = 10;
      const timer = setInterval(() => {
        c -= 1;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(timer);
          onOpenChange(false);
          setRevealed(null);
          setConfirming(true);
          setCountdown(10);
        }
      }, 1000);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to reveal secret');
    }
  }

  function handleCopy() {
    if (revealed) {
      navigator.clipboard.writeText(revealed);
      toast.success('Copied to clipboard');
    }
  }

  if (confirming) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reveal Secret Value?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will be logged in the access audit trail. The value will be visible for 10 seconds then automatically hidden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReveal} disabled={revealSecret.isPending}>
              {revealSecret.isPending ? 'Loading...' : 'Reveal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Secret Value — {secret.secret_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="relative">
            <code className="block w-full rounded-md bg-muted p-3 text-sm font-mono break-all">
              {revealed}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-7 w-7"
              onClick={handleCopy}
            >
              <ClipboardCopy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Auto-hides in {countdown} second{countdown !== 1 ? 's' : ''}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); setRevealed(null); setConfirming(true); setCountdown(10); }}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Access Log Sheet
// ---------------------------------------------------------------------------

interface AccessLogSheetProps {
  secretId: string;
  secretName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AccessLogSheet({ secretId, secretName, open, onOpenChange }: AccessLogSheetProps) {
  const { data: logs, isLoading } = useSecretAccessLog(secretId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Access Log — {secretName}
          </SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : !logs?.length ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No access events yet.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs font-mono text-foreground">
                  {format(parseISO(log.accessed_at), 'MMM d, yyyy HH:mm:ss')}
                </div>
                {log.ip_address && (
                  <div className="text-xs text-muted-foreground mt-0.5">IP: {log.ip_address}</div>
                )}
                {log.access_reason && (
                  <div className="text-xs text-muted-foreground mt-0.5">{log.access_reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgentSecretsPage() {
  const [agentIdFilter, setAgentIdFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editSecret, setEditSecret] = useState<AgentSecret | null>(null);
  const [revealSecret, setRevealSecret] = useState<AgentSecret | null>(null);
  const [logSecret, setLogSecret] = useState<AgentSecret | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: stats } = useSecretStats();
  const { data: secrets, isLoading } = useSecrets(agentIdFilter || undefined);
  const deleteSecret = useDeleteSecret();
  const updateSecret = useUpdateSecret();

  async function handleDelete(id: string) {
    try {
      await deleteSecret.mutateAsync(id);
      toast.success('Secret deleted');
      setDeleteId(null);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to delete secret');
    }
  }

  async function handleToggleActive(secret: AgentSecret) {
    try {
      await updateSecret.mutateAsync({
        secretId: secret.id,
        data: { is_active: !secret.is_active },
      });
      toast.success(secret.is_active ? 'Secret deactivated' : 'Secret activated');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to update secret');
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Agent Secrets Vault</h1>
            <p className="text-sm text-muted-foreground">Store and manage API keys, tokens, and credentials</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Secret
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Secrets</span>
            </div>
            <span className="text-2xl font-semibold tabular-nums">{stats.total}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-emerald-500">{stats.active}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Expired</span>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-red-500">{stats.expired}</span>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="Filter by agent ID..."
            value={agentIdFilter}
            onChange={(e) => setAgentIdFilter(e.target.value)}
          />
          {agentIdFilter && (
            <button
              onClick={() => setAgentIdFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : !secrets?.length ? (
          <div className="py-16 text-center">
            <KeyRound className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No secrets yet. Create one to get started.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Agent</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">Accesses</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Expires</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-muted-foreground">Active</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((secret) => {
                const isExpired = !!(secret.expires_at && isPast(parseISO(secret.expires_at)));
                return (
                  <tr key={secret.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-medium">{secret.secret_name}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', secretTypeBadgeClass(secret.secret_type as SecretType))}>
                        {secret.secret_type}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                      {secret.agent_id ? secret.agent_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground max-w-[180px] truncate">
                      {secret.description ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-xs">{secret.access_count}</td>
                    <td className="py-3 px-4 text-xs">
                      {secret.expires_at ? (
                        <span className={cn('flex items-center gap-1', isExpired && 'text-red-500')}>
                          {isExpired && <AlertTriangle className="h-3 w-3" />}
                          {format(parseISO(secret.expires_at), 'MMM d, yyyy')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Switch
                        checked={secret.is_active}
                        onCheckedChange={() => handleToggleActive(secret)}
                        className="scale-90"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Reveal"
                          onClick={() => setRevealSecret(secret)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Access Log"
                          onClick={() => setLogSecret(secret)}
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Edit"
                          onClick={() => setEditSecret(secret)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeleteId(secret.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialogs / Sheets */}
      <SecretFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editSecret && (
        <SecretFormDialog
          open
          onOpenChange={(o) => { if (!o) setEditSecret(null); }}
          existing={editSecret}
        />
      )}

      {revealSecret && (
        <RevealDialog
          secret={revealSecret}
          open
          onOpenChange={(o) => { if (!o) setRevealSecret(null); }}
        />
      )}

      {logSecret && (
        <AccessLogSheet
          secretId={logSecret.id}
          secretName={logSecret.secret_name}
          open
          onOpenChange={(o) => { if (!o) setLogSecret(null); }}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the secret and all its access logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
