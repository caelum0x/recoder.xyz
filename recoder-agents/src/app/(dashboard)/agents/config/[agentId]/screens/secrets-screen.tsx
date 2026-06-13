'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Info,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useSecrets,
  useCreateSecret,
  useUpdateSecret,
  useDeleteSecret,
  useRevealSecret,
} from '@/hooks/agents/use-agent-secrets';
import type { AgentSecret } from '@/lib/api/agent-secrets';

// ---- Types ----

interface SecretsScreenProps {
  agentId: string;
}

interface SecretFormData {
  key: string;
  value: string;
  description: string;
}

const EMPTY_FORM: SecretFormData = { key: '', value: '', description: '' };

// ---- Main Component ----

export function SecretsScreen({ agentId }: SecretsScreenProps) {
  const { data: secrets, isLoading, isError } = useSecrets(agentId);
  const createMutation = useCreateSecret();
  const updateMutation = useUpdateSecret();
  const deleteMutation = useDeleteSecret();
  const revealMutation = useRevealSecret();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<SecretFormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentSecret | null>(null);

  // Track revealed secrets and their auto-hide timers
  const [revealedSecrets, setRevealedSecrets] = useState<
    Record<string, string>
  >({});
  const revealTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(revealTimers.current).forEach(clearTimeout);
    };
  }, []);

  // ---- Handlers ----

  const openAddDialog = useCallback(() => {
    setEditingKey(null);
    setFormData(EMPTY_FORM);
    setShowPassword(false);
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((secret: AgentSecret) => {
    setEditingKey(secret.secret_name);
    setFormData({
      key: secret.secret_name,
      value: '',
      description: secret.description || '',
    });
    setShowPassword(false);
    setIsDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedKey = formData.key.trim();
    if (!trimmedKey) {
      toast.error('Secret key is required');
      return;
    }
    if (!formData.value && !editingKey) {
      toast.error('Secret value is required');
      return;
    }
    // For edits, if value is empty the user may only want to update the description
    // but we still require a value to avoid storing empty secrets
    if (!formData.value && editingKey) {
      toast.error('Please enter a new value for the secret');
      return;
    }

    try {
      if (editingKey) {
        // Find the secret to get the actual ID
        const existingSecret = (secrets || []).find((s) => s.secret_name === editingKey);
        if (existingSecret) {
          await updateMutation.mutateAsync({
            secretId: existingSecret.id,
            data: {
              secret_name: trimmedKey,
              secret_value: formData.value,
              description: formData.description.trim() || undefined,
            },
          });
        }
      } else {
        await createMutation.mutateAsync({
          secret_name: trimmedKey,
          secret_value: formData.value,
          description: formData.description.trim() || undefined,
          agent_id: agentId,
        });
      }
      toast.success(
        editingKey ? 'Secret updated successfully' : 'Secret created successfully'
      );
      setIsDialogOpen(false);
      setFormData(EMPTY_FORM);
      setEditingKey(null);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save secret');
    }
  }, [formData, editingKey, createMutation, updateMutation, agentId, secrets]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`Secret "${deleteTarget.secret_name}" deleted`);
      // Clear revealed value if it was shown
      setRevealedSecrets((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.secret_name];
        return next;
      });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete secret');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation]);

  const handleReveal = useCallback(
    async (key: string) => {
      // If already revealed, hide it
      if (revealedSecrets[key]) {
        setRevealedSecrets((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        if (revealTimers.current[key]) {
          clearTimeout(revealTimers.current[key]);
          delete revealTimers.current[key];
        }
        return;
      }

      // Find the secret by name to get its id
      const secret = (secrets || []).find((s) => s.secret_name === key);
      if (!secret) return;

      try {
        const result = await revealMutation.mutateAsync(secret.id);
        if (result.secret_value) {
          setRevealedSecrets((prev) => ({ ...prev, [key]: result.secret_value! }));
          // Auto-hide after 5 seconds
          revealTimers.current[key] = setTimeout(() => {
            setRevealedSecrets((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
            delete revealTimers.current[key];
          }, 5000);
        }
      } catch (error: any) {
        toast.error(error?.message || 'Failed to reveal secret');
      }
    },
    [revealedSecrets, revealMutation, secrets]
  );

  const handleCopy = useCallback(
    async (key: string) => {
      const value = revealedSecrets[key];
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      } catch {
        toast.error('Failed to copy to clipboard');
      }
    },
    [revealedSecrets]
  );

  // ---- Loading State ----

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1 space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
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
              Failed to load secrets. Please try again.
            </p>
          </SpotlightCard>
        </div>
      </div>
    );
  }

  const secretsList = secrets || [];

  // ---- Render ----

  return (
    <div className="flex-1 overflow-auto pb-6 w-full min-w-0">
      <div className="px-1 pt-1 space-y-4 w-full">
        {/* Info Banner */}
        <SpotlightCard className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Agent Secrets & Environment Variables
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Secrets are available to your agent at runtime as environment
                variables. Values are stored securely and never displayed in
                logs.
              </p>
            </div>
          </div>
        </SpotlightCard>

        {/* Add Secret Button */}
        <div className="flex justify-end">
          <Button
            onClick={openAddDialog}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Secret
          </Button>
        </div>

        {/* Empty State */}
        {secretsList.length === 0 && (
          <SpotlightCard className="p-8 text-center">
            <KeyRound className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              No secrets configured
            </p>
            <p className="text-xs text-muted-foreground">
              Add environment variables for your agent to use at runtime.
            </p>
          </SpotlightCard>
        )}

        {/* Secrets List */}
        {secretsList.length > 0 && (
          <div className="space-y-2">
            {secretsList.map((secret) => {
              const isRevealed = !!revealedSecrets[secret.secret_name];
              const isCopied = copiedKey === secret.secret_name;

              return (
                <SpotlightCard key={secret.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Key + Description */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono font-semibold text-foreground">
                          {secret.secret_name}
                        </code>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          ENV
                        </Badge>
                      </div>
                      {secret.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {secret.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        {/* Masked / Revealed Value */}
                        <span
                          className={cn(
                            'text-xs',
                            isRevealed
                              ? 'font-mono text-foreground bg-muted px-2 py-0.5 rounded break-all'
                              : 'text-muted-foreground'
                          )}
                        >
                          {isRevealed ? revealedSecrets[secret.secret_name] : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </span>
                        {isRevealed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopy(secret.secret_name)}
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">
                        Added{' '}
                        {format(
                          new Date(secret.created_at),
                          'MMM d, yyyy'
                        )}
                      </p>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleReveal(secret.secret_name)}
                        disabled={revealMutation.isPending}
                        title={isRevealed ? 'Hide value' : 'Reveal value'}
                      >
                        {isRevealed ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(secret)}
                        title="Edit secret"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDeleteTarget(secret)}
                        title="Delete secret"
                      >
                        <Trash2 className="h-4 w-4 text-destructive/70" />
                      </Button>
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Add / Edit Dialog ---- */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingKey ? 'Edit Secret' : 'Add Secret'}
            </DialogTitle>
            <DialogDescription>
              {editingKey
                ? 'Update the value or description for this secret.'
                : 'Create a new environment variable for your agent.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Key Input */}
            <div className="space-y-2">
              <Label htmlFor="secret-key">Key</Label>
              <Input
                id="secret-key"
                placeholder="API_KEY"
                value={formData.key}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                  }))
                }
                disabled={!!editingKey}
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Use UPPER_SNAKE_CASE (e.g., OPENAI_API_KEY, DATABASE_URL)
              </p>
            </div>

            {/* Value Input */}
            <div className="space-y-2">
              <Label htmlFor="secret-value">Value</Label>
              <div className="relative">
                <Input
                  id="secret-value"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={
                    editingKey ? 'Enter new value' : 'sk-...'
                  }
                  value={formData.value}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Description Input */}
            <div className="space-y-2">
              <Label htmlFor="secret-description">
                Description{' '}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="secret-description"
                placeholder="What is this secret used for?"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                createMutation.isPending || updateMutation.isPending ||
                !formData.key.trim() ||
                !formData.value
              }
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingKey
                  ? 'Update Secret'
                  : 'Add Secret'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Confirmation ---- */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the secret{' '}
              <code className="font-mono font-semibold">
                {deleteTarget?.secret_name}
              </code>
              ? This action cannot be undone. Your agent will no longer have
              access to this environment variable at runtime.
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
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
