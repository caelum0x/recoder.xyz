'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
  ShieldCheck,
  ShieldAlert,
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
  useUpsertEnvVar,
  useDeleteEnvVar,
  useBulkSetEnvVars,
  useExportEnvVars,
} from '@/hooks/agents/use-agent-env-vars';
import type { AgentEnvVar } from '@/lib/api/agent-env-vars';

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

function parseEnvFile(content: string): Array<{ key: string; value: string }> {
  const lines = content.split('\n');
  const vars: Array<{ key: string; value: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      vars.push({ key, value });
    }
  }

  return vars;
}

export function EnvVarsScreen({ agentId }: EnvVarsScreenProps) {
  const { data: envVars, isLoading, isError } = useAgentEnvVars(agentId);
  const upsertMutation = useUpsertEnvVar(agentId);
  const deleteMutation = useDeleteEnvVar(agentId);
  const bulkMutation = useBulkSetEnvVars(agentId);
  const exportMutation = useExportEnvVars(agentId);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<EnvVarFormData>(EMPTY_FORM);
  const [bulkContent, setBulkContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AgentEnvVar | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  const openAddDialog = useCallback(() => {
    setEditingKey(null);
    setFormData(EMPTY_FORM);
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((envVar: AgentEnvVar) => {
    setEditingKey(envVar.key);
    setFormData({
      key: envVar.key,
      value: '', // Don't pre-fill value for security
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

    try {
      await upsertMutation.mutateAsync({
        key,
        value: formData.value,
        is_secret: formData.is_secret,
        description: formData.description || undefined,
      });
      toast.success(editingKey ? 'Variable updated' : 'Variable created');
      setIsDialogOpen(false);
      setFormData(EMPTY_FORM);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save variable');
    }
  }, [formData, editingKey, upsertMutation]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.key);
      toast.success(`Deleted "${deleteTarget.key}"`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete variable');
    }
  }, [deleteTarget, deleteMutation]);

  const handleBulkImport = useCallback(async () => {
    const parsed = parseEnvFile(bulkContent);
    if (parsed.length === 0) {
      toast.error('No valid variables found. Use KEY=VALUE format.');
      return;
    }
    try {
      const result = await bulkMutation.mutateAsync(parsed);
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
      // Copy to clipboard
      await navigator.clipboard.writeText(result.content);
      toast.success(`Exported ${result.count} variable(s) to clipboard`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export variables');
    }
  }, [exportMutation]);

  const toggleReveal = useCallback((key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const copyValue = useCallback(async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

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
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Variable
          </Button>
        </div>
      </div>

      {/* Search */}
      {envVars && envVars.length > 0 && (
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
      {(!envVars || envVars.length === 0) && (
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
      {filteredVars.map((envVar) => (
        <SpotlightCard key={envVar.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <code className="text-sm font-mono font-semibold text-foreground">
                  {envVar.key}
                </code>
                {envVar.is_secret && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Secret
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className={cn(
                  "text-xs font-mono text-muted-foreground break-all",
                  envVar.is_secret && !revealedKeys.has(envVar.key) && "blur-sm select-none"
                )}>
                  {envVar.value}
                </code>
                {envVar.is_secret && (
                  <button
                    onClick={() => toggleReveal(envVar.key)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    title={revealedKeys.has(envVar.key) ? "Hide" : "Reveal"}
                  >
                    {revealedKeys.has(envVar.key) ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => copyValue(envVar.key, envVar.value)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  title="Copy value"
                >
                  {copiedKey === envVar.key ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {envVar.description && (
                <p className="text-xs text-muted-foreground mt-1.5">{envVar.description}</p>
              )}
              <p className="text-xs text-muted-foreground/60 mt-1">
                Updated {format(new Date(envVar.updated_at), 'MMM d, yyyy HH:mm')}
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
      ))}

      {/* No results from search */}
      {envVars && envVars.length > 0 && filteredVars.length === 0 && searchFilter && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No variables matching &ldquo;{searchFilter}&rdquo;
        </p>
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
                placeholder="EXAMPLE_KEY"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                disabled={!!editingKey}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="env-value">Value</Label>
              <Input
                id="env-value"
                placeholder={editingKey ? '(enter new value)' : 'value'}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                type={formData.is_secret ? 'password' : 'text'}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="env-desc">Description (optional)</Label>
              <Input
                id="env-desc"
                placeholder="What this variable is for..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="env-secret" className="text-sm">Mark as secret</Label>
              </div>
              <Switch
                id="env-secret"
                checked={formData.is_secret}
                onCheckedChange={(checked) => setFormData({ ...formData, is_secret: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.key.trim() || (!formData.value && !editingKey) || upsertMutation.isPending}
            >
              {upsertMutation.isPending ? 'Saving...' : editingKey ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Environment Variables</DialogTitle>
            <DialogDescription>
              Paste your .env file content below. Each line should be in KEY=VALUE format.
              Lines starting with # are ignored.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Textarea
              placeholder={`# Database config\nDATABASE_URL=postgres://...\nAPI_KEY=your_key_here`}
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
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)}>
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
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variable</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <code className="font-mono font-semibold">{deleteTarget?.key}</code>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
