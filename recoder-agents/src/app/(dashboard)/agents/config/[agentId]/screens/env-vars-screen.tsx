'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Terminal,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Search,
  Download,
  Upload,
  Copy,
  Check,
  Lock,
  Clock,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
  useAgentEnvVars,
  useSetEnvVar,
  useDeleteEnvVar,
  useRevealEnvVar,
  useBulkSetEnvVars,
  useEnvVarAudit,
  useExportEnvVars,
} from '@/hooks/agents/use-agent-env-vars';
import type { AgentEnvVar, EnvVarAuditEntry } from '@/lib/api/agent-env-vars';

// ---- Types ----

interface EnvVarsScreenProps {
  agentId: string;
}

interface EnvVarFormData {
  key: string;
  value: string;
  is_secret: boolean;
  description: string;
}

const EMPTY_FORM: EnvVarFormData = { key: '', value: '', is_secret: false, description: '' };

const AUDIT_ACTION_STYLES: Record<string, { color: string; label: string }> = {
  created: { color: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Created' },
  updated: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'Updated' },
  deleted: { color: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'Deleted' },
  revealed: { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Revealed' },
};

// ---- Helpers ----

function parseEnvFile(content: string): Array<{ key: string; value: string; description?: string }> {
  const lines = content.split('\n');
  const vars: Array<{ key: string; value: string; description?: string }> = [];
  let pendingDescription: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pendingDescription = undefined;
      continue;
    }
    if (trimmed.startsWith('#')) {
      pendingDescription = trimmed.slice(1).trim();
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      vars.push({ key, value, description: pendingDescription });
      pendingDescription = undefined;
    }
  }

  return vars;
}

// ---- Main Component ----

export function EnvVarsScreen({ agentId }: EnvVarsScreenProps) {
  const { data: envVars, isLoading, isError } = useAgentEnvVars(agentId);
  const { data: auditLog } = useEnvVarAudit(agentId);
  const setEnvVarMutation = useSetEnvVar(agentId);
  const deleteMutation = useDeleteEnvVar(agentId);
  const revealMutation = useRevealEnvVar(agentId);
  const bulkMutation = useBulkSetEnvVars(agentId);
  const exportMutation = useExportEnvVars(agentId);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<EnvVarFormData>(EMPTY_FORM);
  const [bulkContent, setBulkContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AgentEnvVar | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  // Track revealed secrets and their auto-hide timers
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const revealTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(revealTimers.current).forEach(clearTimeout);
    };
  }, []);

  const filteredVars = useMemo(() => {
    if (!envVars) return [];
    if (!searchFilter) return envVars;
    const lower = searchFilter.toLowerCase();
    return envVars.filter(
      (v) =>
        v.key.toLowerCase().includes(lower) ||
        (v.description && v.description.toLowerCase().includes(lower))
    );
  }, [envVars, searchFilter]);

  // ---- Handlers ----

  const openAddDialog = useCallback(() => {
    setEditingKey(null);
    setFormData(EMPTY_FORM);
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((envVar: AgentEnvVar) => {
    setEditingKey(envVar.key);
    setFormData({
      key: envVar.key,
      value: '',
      is_secret: envVar.is_secret,
      description: envVar.description || '',
    });
    setIsDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    const key = formData.key.trim();
    if (!key) {
      toast.error('Key is required');
      return;
    }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      toast.error('Key must be UPPER_SNAKE_CASE (e.g. MY_API_KEY)');
      return;
    }
    if (!formData.value && !editingKey) {
      toast.error('Value is required');
      return;
    }
    if (!formData.value && editingKey) {
      toast.error('Please enter a new value');
      return;
    }

    try {
      await setEnvVarMutation.mutateAsync({
        key,
        value: formData.value,
        is_secret: formData.is_secret,
        description: formData.description || undefined,
      });
      toast.success(editingKey ? 'Variable updated' : 'Variable created');
      setIsDialogOpen(false);
      setFormData(EMPTY_FORM);
      setEditingKey(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save variable');
    }
  }, [formData, editingKey, setEnvVarMutation]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.key);
      toast.success(`Deleted "${deleteTarget.key}"`);
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.key];
        return next;
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete variable');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation]);

  const handleReveal = useCallback(
    async (key: string) => {
      // If already revealed, hide it
      if (revealedValues[key]) {
        setRevealedValues((prev) => {
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

      try {
        const result = await revealMutation.mutateAsync(key);
        if (result.value) {
          setRevealedValues((prev) => ({ ...prev, [key]: result.value }));
          // Auto-hide after 10 seconds
          revealTimers.current[key] = setTimeout(() => {
            setRevealedValues((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
            delete revealTimers.current[key];
          }, 10000);
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to reveal value');
      }
    },
    [revealedValues, revealMutation]
  );

  const handleCopy = useCallback(
    async (key: string) => {
      const value = revealedValues[key];
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      } catch {
        toast.error('Failed to copy to clipboard');
      }
    },
    [revealedValues]
  );

  const handleBulkImport = useCallback(async () => {
    const parsed = parseEnvFile(bulkContent);
    if (parsed.length === 0) {
      toast.error('No valid KEY=VALUE pairs found');
      return;
    }
    try {
      const result = await bulkMutation.mutateAsync(
        parsed.map((v) => ({
          key: v.key,
          value: v.value,
          is_secret: false,
          description: v.description,
        }))
      );
      toast.success(`Imported ${result.count} variable(s)`);
      setIsBulkDialogOpen(false);
      setBulkContent('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to import variables');
    }
  }, [bulkContent, bulkMutation]);

  const handleExport = useCallback(async () => {
    try {
      const result = await exportMutation.mutateAsync();
      const blob = new Blob([result.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-${agentId}.env`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} variable(s)`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export variables');
    }
  }, [agentId, exportMutation]);

  // ---- Loading State ----

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load environment variables</p>
      </div>
    );
  }

  const auditList = auditLog || [];

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Environment Variables</h2>
          {envVars && (
            <Badge variant="secondary" className="text-xs">
              {envVars.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBulkDialogOpen(true)}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!envVars || envVars.length === 0 || exportMutation.isPending}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            variant={showAuditTrail ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAuditTrail(!showAuditTrail)}
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Audit
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Variable
          </Button>
        </div>
      </div>

      {/* Search */}
      {envVars && envVars.length > 0 && !showAuditTrail && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter variables..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Empty State */}
      {(!envVars || envVars.length === 0) && !showAuditTrail && (
        <SpotlightCard className="p-8 text-center">
          <Terminal className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-medium mb-1">No environment variables</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add key-value configuration for your agent. Mark sensitive values as secrets.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Variable
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsBulkDialogOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import .env
            </Button>
          </div>
        </SpotlightCard>
      )}

      {/* Variables List */}
      {!showAuditTrail && filteredVars.map((envVar) => {
        const isRevealed = !!revealedValues[envVar.key];
        const isCopied = copiedKey === envVar.key;

        return (
          <SpotlightCard key={envVar.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono font-semibold text-foreground">
                    {envVar.key}
                  </code>
                  {envVar.is_secret && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Lock className="h-3 w-3" />
                      Secret
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={cn(
                      'text-xs',
                      isRevealed
                        ? 'font-mono text-foreground bg-muted px-2 py-0.5 rounded break-all'
                        : 'text-muted-foreground'
                    )}
                  >
                    {isRevealed
                      ? revealedValues[envVar.key]
                      : envVar.is_secret
                        ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                        : envVar.value}
                  </span>
                  {envVar.is_secret && (
                    <button
                      onClick={() => handleReveal(envVar.key)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      title={isRevealed ? 'Hide' : 'Reveal'}
                      disabled={revealMutation.isPending}
                    >
                      {isRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {isRevealed && (
                    <button
                      onClick={() => handleCopy(envVar.key)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      title="Copy value"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
                {envVar.description && (
                  <p className="text-xs text-muted-foreground mt-1.5">{envVar.description}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Added {format(new Date(envVar.created_at), 'MMM d, yyyy')}
                  {envVar.updated_at !== envVar.created_at && (
                    <> &middot; Updated {format(new Date(envVar.updated_at), 'MMM d, yyyy')}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditDialog(envVar)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(envVar)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </SpotlightCard>
        );
      })}

      {/* No results from search */}
      {!showAuditTrail && envVars && envVars.length > 0 && filteredVars.length === 0 && searchFilter && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No variables matching &ldquo;{searchFilter}&rdquo;
        </p>
      )}

      {/* Audit Trail */}
      {showAuditTrail && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Audit Trail</h3>
          </div>
          {auditList.length === 0 ? (
            <SpotlightCard className="p-6 text-center">
              <p className="text-xs text-muted-foreground">No audit events recorded yet.</p>
            </SpotlightCard>
          ) : (
            auditList.map((entry: EnvVarAuditEntry) => {
              const style = AUDIT_ACTION_STYLES[entry.action] || AUDIT_ACTION_STYLES.created;
              return (
                <SpotlightCard key={entry.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border', style.color)}>
                        {style.label}
                      </Badge>
                      <code className="text-xs font-mono text-foreground truncate">{entry.key}</code>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                      {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                </SpotlightCard>
              );
            })
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingKey ? 'Edit Variable' : 'Add Variable'}</DialogTitle>
            <DialogDescription>
              {editingKey
                ? 'Update the value or settings for this variable.'
                : 'Add a new environment variable for your agent.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="env-key">Key</Label>
              <Input
                id="env-key"
                placeholder="MY_API_KEY"
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
                UPPER_SNAKE_CASE (e.g., DATABASE_URL, API_KEY)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="env-value">Value</Label>
              <Textarea
                id="env-value"
                placeholder={editingKey ? 'Enter new value' : 'Enter value...'}
                value={formData.value}
                onChange={(e) => setFormData((prev) => ({ ...prev, value: e.target.value }))}
                rows={3}
                className="font-mono text-sm resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="env-secret">Mark as secret</Label>
                <p className="text-[10px] text-muted-foreground">
                  Secret values are masked and require reveal
                </p>
              </div>
              <Switch
                id="env-secret"
                checked={formData.is_secret}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_secret: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="env-desc">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="env-desc"
                placeholder="What is this variable used for?"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={setEnvVarMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.key.trim() || (!formData.value && !editingKey) || setEnvVarMutation.isPending}
            >
              {setEnvVarMutation.isPending ? 'Saving...' : editingKey ? 'Update' : 'Add Variable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import</DialogTitle>
            <DialogDescription>
              Paste environment variables in KEY=VALUE format (one per line).
              Lines starting with # are treated as descriptions for the next variable.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Textarea
              placeholder={"# Database connection\nDATABASE_URL=postgres://...\n\n# API Keys\nOPENAI_API_KEY=sk-..."}
              value={bulkContent}
              onChange={(e) => setBulkContent(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            {bulkContent && (
              <p className="text-xs text-muted-foreground mt-2">
                {parseEnvFile(bulkContent).length} variable(s) detected
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)} disabled={bulkMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkImport}
              disabled={!bulkContent.trim() || bulkMutation.isPending}
            >
              {bulkMutation.isPending ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variable</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <code className="font-mono font-semibold">{deleteTarget?.key}</code>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
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
