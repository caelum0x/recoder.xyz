'use client';

import React, { useState, useCallback } from 'react';
import {
  Puzzle,
  Plus,
  Search,
  Star,
  Download,
  Pencil,
  Trash2,
  Package,
  RefreshCw,
  Loader2,
  AlertCircle,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  usePlugins,
  useCreatePlugin,
  useUpdatePlugin,
  useDeletePlugin,
  useInstallPlugin,
  useAgentPlugins,
  useUpdatePluginInstall,
  useUninstallPlugin,
  useRatePlugin,
} from '@/hooks/agents/use-plugin-registry';
import type { Plugin, PluginInstall, PluginType, PluginFilters } from '@/lib/api/plugin-registry';

// ============================================================================
// Helpers
// ============================================================================

const PLUGIN_TYPE_LABELS: Record<PluginType | 'all', string> = {
  all: 'All Types',
  tool: 'Tool',
  prompt_modifier: 'Prompt Modifier',
  output_formatter: 'Output Formatter',
  data_source: 'Data Source',
  integration: 'Integration',
};

const PLUGIN_TYPE_COLORS: Record<PluginType, string> = {
  tool: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  prompt_modifier: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  output_formatter: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  data_source: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  integration: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
};

function StarRating({ avg, count }: { avg: number; count: number }) {
  const rounded = Math.round(avg * 2) / 2;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <span className="font-medium text-foreground">{avg > 0 ? avg.toFixed(1) : '—'}</span>
      {count > 0 && <span>({count})</span>}
    </span>
  );
}

// ============================================================================
// Create / Edit Plugin Dialog
// ============================================================================

interface PluginFormDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: Plugin;
}

function PluginFormDialog({ open, onClose, initial }: PluginFormDialogProps) {
  const createPlugin = useCreatePlugin();
  const updatePlugin = useUpdatePlugin();

  const isEdit = !!initial;

  const [pluginName, setPluginName] = useState(initial?.plugin_name ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [version, setVersion] = useState(initial?.version ?? '1.0.0');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pluginType, setPluginType] = useState<PluginType>(initial?.plugin_type ?? 'tool');
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(', '));
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? false);
  const [configSchemaText, setConfigSchemaText] = useState(
    JSON.stringify(initial?.config_schema ?? {}, null, 2)
  );
  const [implementationText, setImplementationText] = useState(
    JSON.stringify(initial?.implementation ?? {}, null, 2)
  );
  const [jsonErrors, setJsonErrors] = useState<{ schema?: string; impl?: string }>({});

  const resetForm = useCallback(() => {
    setPluginName('');
    setDisplayName('');
    setVersion('1.0.0');
    setDescription('');
    setPluginType('tool');
    setTagsRaw('');
    setIsPublic(false);
    setConfigSchemaText('{}');
    setImplementationText('{}');
    setJsonErrors({});
  }, []);

  const handleClose = () => {
    if (!isEdit) resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { schema?: string; impl?: string } = {};
    let configSchema: Record<string, unknown> = {};
    let implementation: Record<string, unknown> = {};

    try {
      configSchema = JSON.parse(configSchemaText);
    } catch {
      errors.schema = 'Invalid JSON';
    }
    try {
      implementation = JSON.parse(implementationText);
    } catch {
      errors.impl = 'Invalid JSON';
    }

    if (errors.schema || errors.impl) {
      setJsonErrors(errors);
      return;
    }
    setJsonErrors({});

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (isEdit && initial) {
        await updatePlugin.mutateAsync({
          pluginId: initial.id,
          data: {
            display_name: displayName,
            version,
            description: description || undefined,
            plugin_type: pluginType,
            config_schema: configSchema,
            implementation,
            tags,
            is_public: isPublic,
          },
        });
      } else {
        await createPlugin.mutateAsync({
          plugin_name: pluginName,
          display_name: displayName,
          version,
          description: description || undefined,
          plugin_type: pluginType,
          config_schema: configSchema,
          implementation,
          tags,
          is_public: isPublic,
        });
        resetForm();
      }
      onClose();
    } catch {
      // handled by hook
    }
  };

  const isPending = createPlugin.isPending || updatePlugin.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Plugin' : 'Create Plugin'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update your plugin details and configuration.'
              : 'Define a new plugin for the registry.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plugin_name">Plugin Name *</Label>
              <Input
                id="plugin_name"
                placeholder="e.g. my_tool"
                value={pluginName}
                onChange={(e) => setPluginName(e.target.value)}
                disabled={isEdit}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                placeholder="e.g. My Tool"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plugin_type">Plugin Type</Label>
              <Select value={pluginType} onValueChange={(v) => setPluginType(v as PluginType)}>
                <SelectTrigger id="plugin_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLUGIN_TYPE_LABELS) as Array<PluginType | 'all'>)
                    .filter((k) => k !== 'all')
                    .map((type) => (
                      <SelectItem key={type} value={type}>
                        {PLUGIN_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="What does this plugin do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              placeholder="e.g. search, web, automation"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} id="is_public" />
            <Label htmlFor="is_public" className="cursor-pointer">
              Make public (visible to all users)
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="config_schema">Config Schema (JSON)</Label>
            <Textarea
              id="config_schema"
              rows={4}
              className="font-mono text-xs"
              value={configSchemaText}
              onChange={(e) => {
                setConfigSchemaText(e.target.value);
                setJsonErrors((prev) => ({ ...prev, schema: undefined }));
              }}
            />
            {jsonErrors.schema && (
              <p className="text-xs text-destructive">{jsonErrors.schema}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="implementation">Implementation (JSON)</Label>
            <Textarea
              id="implementation"
              rows={4}
              className="font-mono text-xs"
              value={implementationText}
              onChange={(e) => {
                setImplementationText(e.target.value);
                setJsonErrors((prev) => ({ ...prev, impl: undefined }));
              }}
            />
            {jsonErrors.impl && (
              <p className="text-xs text-destructive">{jsonErrors.impl}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEdit ? 'Saving…' : 'Creating…'}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {isEdit ? 'Save Changes' : 'Create Plugin'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Install Dialog
// ============================================================================

interface InstallDialogProps {
  plugin: Plugin | null;
  onClose: () => void;
}

function InstallDialog({ plugin, onClose }: InstallDialogProps) {
  const [agentId, setAgentId] = useState('');
  const [configValuesText, setConfigValuesText] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const installPlugin = useInstallPlugin(agentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plugin) return;
    let configValues: Record<string, unknown> = {};
    try {
      configValues = JSON.parse(configValuesText);
    } catch {
      setJsonError('Invalid JSON');
      return;
    }
    setJsonError('');
    try {
      await installPlugin.mutateAsync({ plugin_id: plugin.id, config_values: configValues });
      onClose();
    } catch {
      // handled by hook
    }
  };

  return (
    <Dialog open={!!plugin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Install Plugin</DialogTitle>
          <DialogDescription>
            Install <strong>{plugin?.display_name}</strong> to an agent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="install_agent_id">Agent ID *</Label>
            <Input
              id="install_agent_id"
              placeholder="Enter agent ID"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="install_config">Config Values (JSON)</Label>
            <Textarea
              id="install_config"
              rows={4}
              className="font-mono text-xs"
              value={configValuesText}
              onChange={(e) => {
                setConfigValuesText(e.target.value);
                setJsonError('');
              }}
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={installPlugin.isPending}>
              {installPlugin.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Installing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Install
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Rate Dialog
// ============================================================================

interface RateDialogProps {
  plugin: Plugin | null;
  onClose: () => void;
}

function RateDialog({ plugin, onClose }: RateDialogProps) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const ratePlugin = useRatePlugin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plugin) return;
    try {
      await ratePlugin.mutateAsync({ pluginId: plugin.id, data: { rating, review: review || undefined } });
      onClose();
    } catch {
      // handled by hook
    }
  };

  return (
    <Dialog open={!!plugin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rate Plugin</DialogTitle>
          <DialogDescription>
            Rate <strong>{plugin?.display_name}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="focus:outline-none"
                >
                  <Star
                    className={cn(
                      'h-7 w-7 transition-colors',
                      n <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground hover:text-amber-300'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review_text">Review (optional)</Label>
            <Textarea
              id="review_text"
              rows={3}
              placeholder="Share your experience…"
              value={review}
              onChange={(e) => setReview(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={ratePlugin.isPending}>
              {ratePlugin.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 mr-2" />
                  Submit Rating
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Plugin Card
// ============================================================================

interface PluginCardProps {
  plugin: Plugin;
  currentUserId?: string;
  onInstall: (plugin: Plugin) => void;
  onRate: (plugin: Plugin) => void;
  onEdit: (plugin: Plugin) => void;
  onDelete: (plugin: Plugin) => void;
}

function PluginCard({ plugin, currentUserId, onInstall, onRate, onEdit, onDelete }: PluginCardProps) {
  const deletePlugin = useDeletePlugin();
  const isOwner = currentUserId ? plugin.user_id === currentUserId : false;

  const handleDelete = async () => {
    if (!confirm(`Delete "${plugin.display_name}"? This cannot be undone.`)) return;
    try {
      await deletePlugin.mutateAsync(plugin.id);
    } catch {
      // handled by hook
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{plugin.display_name}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              v{plugin.version}
            </Badge>
          </div>
          <Badge
            variant="outline"
            className={cn('text-[10px] mt-1', PLUGIN_TYPE_COLORS[plugin.plugin_type])}
          >
            {PLUGIN_TYPE_LABELS[plugin.plugin_type]}
          </Badge>
        </div>
        {plugin.is_public && (
          <Badge variant="secondary" className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            Public
          </Badge>
        )}
      </div>

      {/* Description */}
      {plugin.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{plugin.description}</p>
      )}

      {/* Tags */}
      {plugin.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {plugin.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] bg-muted">
              {tag}
            </Badge>
          ))}
          {plugin.tags.length > 4 && (
            <Badge variant="secondary" className="text-[10px] bg-muted">
              +{plugin.tags.length - 4}
            </Badge>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <StarRating avg={plugin.rating_avg} count={plugin.rating_count} />
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          {plugin.install_count} installs
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
        <Button
          variant="default"
          size="sm"
          className="h-7 px-3 text-xs gap-1"
          onClick={() => onInstall(plugin)}
        >
          <Download className="h-3 w-3" />
          Install
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs gap-1"
          onClick={() => onRate(plugin)}
        >
          <Star className="h-3 w-3" />
          Rate
        </Button>
        {isOwner && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => onEdit(plugin)}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={deletePlugin.isPending}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Agent Plugins Section
// ============================================================================

function AgentPluginsSection() {
  const [agentIdInput, setAgentIdInput] = useState('');
  const [activeAgentId, setActiveAgentId] = useState('');

  const { data: installs, isLoading, refetch } = useAgentPlugins(activeAgentId);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveAgentId(agentIdInput.trim());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold">My Agents' Plugins</h2>
          <p className="text-xs text-muted-foreground">View and manage plugins installed on a specific agent</p>
        </div>
      </div>

      <form onSubmit={handleLookup} className="flex gap-2 max-w-md">
        <Input
          placeholder="Enter agent ID to view its plugins"
          value={agentIdInput}
          onChange={(e) => setAgentIdInput(e.target.value)}
          className="text-sm"
        />
        <Button type="submit" variant="outline" size="sm" className="shrink-0">
          Lookup
        </Button>
      </form>

      {activeAgentId && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-medium">
              Agent: <span className="font-mono text-primary">{activeAgentId}</span>
            </p>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : !installs || installs.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No plugins installed for this agent.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {installs.map((install) => (
                <AgentInstallRow key={install.id} install={install} agentId={activeAgentId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AgentInstallRowProps {
  install: PluginInstall;
  agentId: string;
}

function AgentInstallRow({ install, agentId }: AgentInstallRowProps) {
  const updateInstall = useUpdatePluginInstall(agentId);
  const uninstallPlugin = useUninstallPlugin(agentId);

  const handleToggle = async () => {
    try {
      await updateInstall.mutateAsync({
        installId: install.id,
        data: { is_enabled: !install.is_enabled },
      });
    } catch {
      // handled by hook
    }
  };

  const handleUninstall = async () => {
    if (!confirm(`Uninstall "${install.display_name ?? install.plugin_id}"?`)) return;
    try {
      await uninstallPlugin.mutateAsync(install.id);
    } catch {
      // handled by hook
    }
  };

  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {install.display_name ?? install.plugin_id}
          </span>
          {install.plugin_type && (
            <Badge
              variant="outline"
              className={cn('text-[10px]', PLUGIN_TYPE_COLORS[install.plugin_type])}
            >
              {PLUGIN_TYPE_LABELS[install.plugin_type]}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">{install.plugin_id}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleToggle}
          disabled={updateInstall.isPending}
          className="focus:outline-none"
          title={install.is_enabled ? 'Disable' : 'Enable'}
        >
          {install.is_enabled ? (
            <ToggleRight className="h-5 w-5 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
          onClick={handleUninstall}
          disabled={uninstallPlugin.isPending}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function PluginRegistryPage() {
  const [typeFilter, setTypeFilter] = useState<PluginType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showPublicOnly, setShowPublicOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlugin, setEditPlugin] = useState<Plugin | null>(null);
  const [installPlugin, setInstallPlugin] = useState<Plugin | null>(null);
  const [ratePlugin, setRatePlugin] = useState<Plugin | null>(null);

  const filters: PluginFilters = {
    plugin_type: typeFilter,
    search: search || undefined,
    is_public: showPublicOnly ? true : undefined,
  };

  const { data: plugins, isLoading, error, refetch } = usePlugins(filters);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Puzzle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Plugin Registry</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Discover, install and manage plugins for your agents
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Plugin
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search plugins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as PluginType | 'all')}
        >
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PLUGIN_TYPE_LABELS) as Array<PluginType | 'all'>).map((type) => (
              <SelectItem key={type} value={type} className="text-sm">
                {PLUGIN_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="public_only"
            checked={showPublicOnly}
            onCheckedChange={setShowPublicOnly}
          />
          <Label htmlFor="public_only" className="text-sm cursor-pointer">
            Show Public Only
          </Label>
        </div>
        <Button variant="ghost" size="sm" className="h-9 px-2.5 gap-1.5 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Plugin Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {(error as Error).message || 'Failed to load plugins'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      ) : !plugins || plugins.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Puzzle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No plugins found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search || typeFilter !== 'all' || showPublicOnly
              ? 'Try adjusting your filters.'
              : 'Click "Create Plugin" to add your first plugin.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              onInstall={setInstallPlugin}
              onRate={setRatePlugin}
              onEdit={setEditPlugin}
              onDelete={(p) => {
                // deletion handled inside card via useDeletePlugin
              }}
            />
          ))}
        </div>
      )}

      {/* Agent Plugins Section */}
      <div className="border-t border-border pt-8">
        <AgentPluginsSection />
      </div>

      {/* Dialogs */}
      <PluginFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <PluginFormDialog
        open={!!editPlugin}
        onClose={() => setEditPlugin(null)}
        initial={editPlugin ?? undefined}
      />
      <InstallDialog plugin={installPlugin} onClose={() => setInstallPlugin(null)} />
      <RateDialog plugin={ratePlugin} onClose={() => setRatePlugin(null)} />
    </div>
  );
}
