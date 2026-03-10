'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  History,
  GitCompare,
  RotateCcw,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  ArrowRight,
  Wrench,
  FileText,
  X,
  AlertCircle,
  Camera,
  Trash2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SpotlightCard } from '@/components/ui/spotlight-card';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useAgentVersions,
  useActivateAgentVersion,
  useConfigVersions,
  useCreateConfigVersion,
  useRestoreConfigVersion,
  useDeleteConfigVersion,
  useConfigVersionDiff,
  type ConfigVersion,
} from '@/hooks/agents/use-agent-versions';
import { VersionInlineEditor } from '@/components/agents/version-inline-editor';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getVersionComparison,
  rollbackToVersion,
  type VersionComparisonResponse,
  type VersionComparisonDifference,
} from '@/lib/api/agent-versions';
import { versionKeys, configVersionKeys } from '@/hooks/agents/keys';
import type { AgentVersion } from '@/hooks/agents/utils';
import { VersionCompareDialog } from './version-compare-dialog';

interface VersionsScreenProps {
  agentId: string;
}

export function VersionsScreen({ agentId }: VersionsScreenProps) {
  const queryClient = useQueryClient();
  const { data: versions, isLoading } = useAgentVersions(agentId);
  const activateVersionMutation = useActivateAgentVersion();

  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<AgentVersion | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  // Config snapshot state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [snapshotRestoreTarget, setSnapshotRestoreTarget] = useState<ConfigVersion | null>(null);
  const [snapshotDeleteTarget, setSnapshotDeleteTarget] = useState<ConfigVersion | null>(null);
  const [snapshotCompareA, setSnapshotCompareA] = useState<number>(0);
  const [snapshotCompareB, setSnapshotCompareB] = useState<number>(0);
  const [showSnapshotDiff, setShowSnapshotDiff] = useState(false);

  // Config snapshot hooks
  const { data: configVersionsData, isLoading: isConfigVersionsLoading } = useConfigVersions(agentId);
  const createConfigVersionMutation = useCreateConfigVersion();
  const restoreConfigVersionMutation = useRestoreConfigVersion();
  const deleteConfigVersionMutation = useDeleteConfigVersion();

  const configVersions = configVersionsData?.versions || [];

  const handleSaveSnapshot = useCallback(() => {
    createConfigVersionMutation.mutate(
      { agentId, data: { name: snapshotName || undefined, description: snapshotDescription || undefined } },
      {
        onSuccess: () => {
          setShowSaveDialog(false);
          setSnapshotName('');
          setSnapshotDescription('');
        },
      }
    );
  }, [agentId, snapshotName, snapshotDescription, createConfigVersionMutation]);

  const handleRestoreSnapshot = useCallback(() => {
    if (snapshotRestoreTarget) {
      restoreConfigVersionMutation.mutate(
        { agentId, versionNumber: snapshotRestoreTarget.version_number },
        { onSuccess: () => setSnapshotRestoreTarget(null) }
      );
    }
  }, [agentId, snapshotRestoreTarget, restoreConfigVersionMutation]);

  const handleDeleteSnapshot = useCallback(() => {
    if (snapshotDeleteTarget) {
      deleteConfigVersionMutation.mutate(
        { agentId, versionNumber: snapshotDeleteTarget.version_number },
        { onSuccess: () => setSnapshotDeleteTarget(null) }
      );
    }
  }, [agentId, snapshotDeleteTarget, deleteConfigVersionMutation]);

  const sortedVersions = useMemo(
    () => [...(versions || [])].sort((a, b) => b.version_number - a.version_number),
    [versions]
  );

  const activeVersion = useMemo(
    () => sortedVersions.find((v) => v.is_active),
    [sortedVersions]
  );

  // Comparison query
  const comparisonQuery = useQuery<VersionComparisonResponse>({
    queryKey: ['version-comparison', agentId, ...selectedForCompare],
    queryFn: () => getVersionComparison(agentId, selectedForCompare[0], selectedForCompare[1]),
    enabled: showComparison && selectedForCompare.length === 2,
    staleTime: 60000,
  });

  // Rollback mutation
  const rollbackMutation = useMutation<AgentVersion, Error, string>({
    mutationFn: (versionId: string) => rollbackToVersion(agentId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setRestoreTarget(null);
      toast.success('Version restored successfully. A new version was created from the restored configuration.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore version');
    },
  });

  const handleCompareToggle = useCallback((versionId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((id) => id !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  }, []);

  const handleStartComparison = useCallback(() => {
    if (selectedForCompare.length === 2) {
      setShowCompareDialog(true);
    }
  }, [selectedForCompare]);

  const handleExitComparison = useCallback(() => {
    setShowComparison(false);
    setShowCompareDialog(false);
    setCompareMode(false);
    setSelectedForCompare([]);
  }, []);

  const handleRestore = useCallback((version: AgentVersion) => {
    setRestoreTarget(version);
  }, []);

  const confirmRestore = useCallback(() => {
    if (restoreTarget) {
      rollbackMutation.mutate(restoreTarget.version_id);
    }
  }, [restoreTarget, rollbackMutation]);

  const handleActivate = useCallback(
    (versionId: string) => {
      activateVersionMutation.mutate({ agentId, versionId });
    },
    [agentId, activateVersionMutation]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Comparison view
  if (showComparison && selectedForCompare.length === 2) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Version Comparison</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={handleExitComparison}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </div>
          <ComparisonView
            comparison={comparisonQuery.data}
            isLoading={comparisonQuery.isLoading}
            error={comparisonQuery.error}
          />
        </div>
      </div>
    );
  }

  // Empty state
  if (!sortedVersions.length) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
            <History className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">No versions yet</h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Versions are created automatically when you save changes to your worker configuration. Make changes to instructions, tools, or integrations to create your first version.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto pb-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between pb-4 px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {sortedVersions.length} version{sortedVersions.length !== 1 ? 's' : ''}
          </span>
          {configVersions.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {configVersions.length} snapshot{configVersions.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 rounded-xl gap-2"
            onClick={() => setShowSaveDialog(true)}
          >
            <Camera className="h-4 w-4" />
            Save Snapshot
          </Button>
          {compareMode ? (
            <>
              <span className="text-xs text-muted-foreground">
                {selectedForCompare.length}/2 selected
              </span>
              <Button
                variant="default"
                size="sm"
                className="h-9 px-3 rounded-xl gap-2"
                disabled={selectedForCompare.length !== 2}
                onClick={handleStartComparison}
              >
                <GitCompare className="h-4 w-4" />
                Compare
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 rounded-xl"
                onClick={() => {
                  setCompareMode(false);
                  setSelectedForCompare([]);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-xl gap-2"
              onClick={() => setCompareMode(true)}
              disabled={sortedVersions.length < 2}
            >
              <GitCompare className="h-4 w-4" />
              Compare
            </Button>
          )}
        </div>
      </div>

      {/* Version List */}
      <div className="px-1 space-y-2">
        {sortedVersions.map((version) => {
          const isActive = version.is_active;
          const isExpanded = expandedVersionId === version.version_id;
          const isSelectedForCompare = selectedForCompare.includes(version.version_id);
          const toolCount = Object.keys(version.agentpress_tools || {}).length;
          const mcpCount = (version.configured_mcps?.length || 0) + (version.custom_mcps?.length || 0);

          return (
            <SpotlightCard
              key={version.version_id}
              className={cn(
                'bg-card border border-border transition-all',
                isActive && 'border-primary/30',
                isSelectedForCompare && 'ring-2 ring-primary/40'
              )}
            >
              <div className="p-4">
                {/* Main row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Compare checkbox */}
                    {compareMode && (
                      <button
                        onClick={() => handleCompareToggle(version.version_id)}
                        className={cn(
                          'mt-0.5 flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
                          isSelectedForCompare
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/40 hover:border-primary/60'
                        )}
                      >
                        {isSelectedForCompare && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                      </button>
                    )}

                    {/* Version info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <VersionInlineEditor
                          agentId={agentId}
                          versionId={version.version_id}
                          versionName={version.version_name}
                          changeDescription={version.change_description}
                          isActive={isActive}
                        />
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-mono px-1.5 py-0"
                        >
                          v{version.version_number}
                        </Badge>
                        {isActive && (
                          <Badge
                            variant="default"
                            className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                            Active
                          </Badge>
                        )}
                      </div>

                      {/* Change description */}
                      {version.change_description && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 truncate max-w-[280px]">
                          {version.change_description}
                        </p>
                      )}

                      {/* Metadata row */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          {toolCount} tool{toolCount !== 1 ? 's' : ''}
                        </span>
                        {mcpCount > 0 && (
                          <span>{mcpCount} MCP{mcpCount !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!compareMode && !isActive && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => handleActivate(version.version_id)}
                          disabled={activateVersionMutation.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Activate
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleRestore(version)}
                          disabled={rollbackMutation.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Restore
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setExpandedVersionId(isExpanded ? null : version.version_id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="space-y-3">
                      {/* Created date */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Created</span>
                        <span>{format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>

                      {/* Model */}
                      {version.model && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Model</span>
                          <Badge variant="secondary" className="text-xs font-mono">
                            {version.model}
                          </Badge>
                        </div>
                      )}

                      {/* Tools summary */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tools</span>
                        <span>{toolCount} enabled</span>
                      </div>

                      {/* Tool names */}
                      {toolCount > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(version.agentpress_tools || {}).map((tool) => (
                            <Badge
                              key={tool}
                              variant="outline"
                              className="text-[10px] font-mono"
                            >
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* MCPs */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">MCP Servers</span>
                        <span>{mcpCount} configured</span>
                      </div>

                      {/* Change description (in expanded) */}
                      {version.change_description && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Change</span>
                          <span className="text-xs italic text-muted-foreground max-w-[200px] truncate">
                            {version.change_description}
                          </span>
                        </div>
                      )}

                      {/* System prompt preview */}
                      {version.system_prompt && (
                        <div className="space-y-1.5">
                          <span className="text-sm text-muted-foreground">System Prompt</span>
                          <div className="bg-muted/30 rounded-lg p-3 max-h-32 overflow-auto">
                            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                              {version.system_prompt.slice(0, 500)}
                              {version.system_prompt.length > 500 && '...'}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Clone from this version - restores then clones */}
                      {!isActive && (
                        <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2 text-xs"
                            onClick={() => handleRestore(version)}
                            disabled={rollbackMutation.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore this version
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </SpotlightCard>
          );
        })}
      </div>

      {/* Config Snapshots Section */}
      {configVersions.length > 0 && (
        <div className="px-1 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Config Snapshots</h3>
            {configVersions.length >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs ml-auto"
                onClick={() => {
                  setSnapshotCompareA(configVersions[1]?.version_number || 0);
                  setSnapshotCompareB(configVersions[0]?.version_number || 0);
                  setShowSnapshotDiff(true);
                }}
              >
                <GitCompare className="h-3.5 w-3.5 mr-1" />
                Compare Latest
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {configVersions.map((sv) => (
              <SpotlightCard key={sv.id} className="bg-card border border-border">
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {sv.name || `Snapshot v${sv.version_number}`}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                          v{sv.version_number}
                        </Badge>
                      </div>
                      {sv.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]">
                          {sv.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDistanceToNow(new Date(sv.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSnapshotRestoreTarget(sv)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setSnapshotDeleteTarget(sv)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </div>
      )}

      {/* Snapshot Diff Dialog */}
      {showSnapshotDiff && snapshotCompareA > 0 && snapshotCompareB > 0 && (
        <SnapshotDiffDialog
          agentId={agentId}
          fromVersion={snapshotCompareA}
          toVersion={snapshotCompareB}
          open={showSnapshotDiff}
          onClose={() => setShowSnapshotDiff(false)}
        />
      )}

      {/* Save Snapshot Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Configuration Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Create a point-in-time snapshot of the current agent configuration.
              You can restore from this snapshot later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name (optional)</label>
              <Input
                placeholder="e.g., Before major prompt rewrite"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
              <Textarea
                placeholder="Describe what this snapshot captures..."
                value={snapshotDescription}
                onChange={(e) => setSnapshotDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createConfigVersionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveSnapshot}
              disabled={createConfigVersionMutation.isPending}
            >
              {createConfigVersionMutation.isPending ? (
                <>
                  <RecoderLoader customSize={16} className="mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Snapshot
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Snapshot Restore Confirmation Dialog */}
      <AlertDialog open={!!snapshotRestoreTarget} onOpenChange={(open) => !open && setSnapshotRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the agent configuration to the state captured in{' '}
              <span className="font-medium text-foreground">
                {snapshotRestoreTarget?.name || `Snapshot v${snapshotRestoreTarget?.version_number}`}
              </span>
              . A new snapshot will be created automatically to preserve the current state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreConfigVersionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreSnapshot}
              disabled={restoreConfigVersionMutation.isPending}
            >
              {restoreConfigVersionMutation.isPending ? (
                <>
                  <RecoderLoader customSize={16} className="mr-2" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore Snapshot
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Snapshot Delete Confirmation Dialog */}
      <AlertDialog open={!!snapshotDeleteTarget} onOpenChange={(open) => !open && setSnapshotDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">
                {snapshotDeleteTarget?.name || `Snapshot v${snapshotDeleteTarget?.version_number}`}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConfigVersionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSnapshot}
              disabled={deleteConfigVersionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConfigVersionMutation.isPending ? (
                <>
                  <RecoderLoader customSize={16} className="mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Version</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version based on the configuration from{' '}
              <span className="font-medium text-foreground">
                {restoreTarget?.version_name}
              </span>
              {' '}(v{restoreTarget?.version_number}) and make it the active version. The current
              configuration will be preserved in the version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollbackMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              disabled={rollbackMutation.isPending}
            >
              {rollbackMutation.isPending ? (
                <>
                  <RecoderLoader customSize={16} className="mr-2" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore Version
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version Comparison Dialog */}
      {selectedForCompare.length === 2 && (
        <VersionCompareDialog
          agentId={agentId}
          versionIds={selectedForCompare as [string, string]}
          open={showCompareDialog}
          onClose={() => {
            setShowCompareDialog(false);
            setCompareMode(false);
            setSelectedForCompare([]);
          }}
        />
      )}
    </div>
  );
}

// ---- Comparison View ----

interface ComparisonViewProps {
  comparison: VersionComparisonResponse | undefined;
  isLoading: boolean;
  error: Error | null;
}

function ComparisonView({ comparison, isLoading, error }: ComparisonViewProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RecoderLoader size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load comparison</p>
        <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
      </div>
    );
  }

  if (!comparison) return null;

  const { version1, version2, differences } = comparison;

  const promptDiff = differences.find((d) => d.field === 'system_prompt');
  const modelDiff = differences.find((d) => d.field === 'model');
  const toolDiffs = differences.filter((d) => d.field.startsWith('tool.'));

  return (
    <div className="space-y-4">
      {/* Version headers */}
      <div className="grid grid-cols-2 gap-3">
        <VersionSummaryCard version={version1} label="Version A" />
        <VersionSummaryCard version={version2} label="Version B" />
      </div>

      {/* No differences */}
      {differences.length === 0 && (
        <div className="text-center py-8 bg-muted/20 rounded-xl border border-border">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-medium">Versions are identical</p>
          <p className="text-xs text-muted-foreground mt-1">
            No differences found between these two versions.
          </p>
        </div>
      )}

      {/* Diff summary */}
      {differences.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span>{differences.length} difference{differences.length !== 1 ? 's' : ''} found</span>
        </div>
      )}

      {/* System Prompt Diff */}
      {promptDiff && (
        <DiffSection title="System Prompt" icon={FileText}>
          <SystemPromptDiff
            oldValue={promptDiff.old_value || ''}
            newValue={promptDiff.new_value || ''}
            v1Name={version1.version_name}
            v2Name={version2.version_name}
          />
        </DiffSection>
      )}

      {/* Model Diff */}
      {modelDiff && (
        <DiffSection title="Model" icon={FileText}>
          <div className="flex items-center gap-3 p-3">
            <Badge variant="outline" className="font-mono text-xs bg-red-500/5 text-red-400 border-red-500/20">
              {modelDiff.old_value || 'None'}
            </Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-xs bg-emerald-500/5 text-emerald-400 border-emerald-500/20">
              {modelDiff.new_value || 'None'}
            </Badge>
          </div>
        </DiffSection>
      )}

      {/* Tool Diffs */}
      {toolDiffs.length > 0 && (
        <DiffSection title="Tools" icon={Wrench}>
          <div className="space-y-2 p-3">
            {toolDiffs.map((diff) => {
              const toolName = diff.field.replace('tool.', '');
              return (
                <div key={diff.field} className="flex items-center gap-2">
                  {diff.type === 'added' && (
                    <>
                      <Plus className="h-3.5 w-3.5 text-emerald-500" />
                      <Badge variant="outline" className="font-mono text-xs bg-emerald-500/5 text-emerald-400 border-emerald-500/20">
                        {toolName}
                      </Badge>
                      <span className="text-xs text-emerald-500">added</span>
                    </>
                  )}
                  {diff.type === 'removed' && (
                    <>
                      <Minus className="h-3.5 w-3.5 text-red-500" />
                      <Badge variant="outline" className="font-mono text-xs bg-red-500/5 text-red-400 border-red-500/20">
                        {toolName}
                      </Badge>
                      <span className="text-xs text-red-500">removed</span>
                    </>
                  )}
                  {diff.type === 'modified' && (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
                      <Badge variant="outline" className="font-mono text-xs bg-amber-500/5 text-amber-400 border-amber-500/20">
                        {toolName}
                      </Badge>
                      <span className="text-xs text-amber-500">modified</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </DiffSection>
      )}
    </div>
  );
}

// ---- Helper Components ----

function VersionSummaryCard({ version, label }: { version: AgentVersion; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </span>
        {version.is_active && (
          <Badge
            variant="default"
            className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          >
            Active
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium truncate">{version.version_name}</p>
      <p className="text-xs text-muted-foreground">
        v{version.version_number} &middot;{' '}
        {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
      </p>
    </div>
  );
}

function DiffSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </button>
      {isOpen && (
        <>
          <Separator />
          {children}
        </>
      )}
    </div>
  );
}

function SystemPromptDiff({
  oldValue,
  newValue,
  v1Name,
  v2Name,
}: {
  oldValue: string;
  newValue: string;
  v1Name: string;
  v2Name: string;
}) {
  const oldLines = oldValue.split('\n');
  const newLines = newValue.split('\n');

  // Simple line-by-line diff
  const diffLines = computeLineDiff(oldLines, newLines);

  return (
    <div className="overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-2 gap-0 text-xs text-muted-foreground border-b border-border">
        <div className="px-3 py-1.5 bg-red-500/5 truncate">{v1Name}</div>
        <div className="px-3 py-1.5 bg-emerald-500/5 border-l border-border truncate">{v2Name}</div>
      </div>

      <ScrollArea className="max-h-[400px]">
        <div className="grid grid-cols-2 gap-0">
          {/* Left column (old) */}
          <div className="font-mono text-xs leading-relaxed">
            {diffLines.map((line, i) => (
              <div
                key={`old-${i}`}
                className={cn(
                  'px-3 py-0.5 min-h-[1.5rem] whitespace-pre-wrap break-all',
                  line.type === 'removed' && 'bg-red-500/10 text-red-400',
                  line.type === 'modified' && 'bg-red-500/5 text-red-300',
                  line.type === 'unchanged' && 'text-muted-foreground',
                  line.type === 'added' && 'bg-transparent'
                )}
              >
                {line.type === 'added' ? '' : (line.oldLine ?? '')}
              </div>
            ))}
          </div>

          {/* Right column (new) */}
          <div className="font-mono text-xs leading-relaxed border-l border-border">
            {diffLines.map((line, i) => (
              <div
                key={`new-${i}`}
                className={cn(
                  'px-3 py-0.5 min-h-[1.5rem] whitespace-pre-wrap break-all',
                  line.type === 'added' && 'bg-emerald-500/10 text-emerald-400',
                  line.type === 'modified' && 'bg-emerald-500/5 text-emerald-300',
                  line.type === 'unchanged' && 'text-muted-foreground',
                  line.type === 'removed' && 'bg-transparent'
                )}
              >
                {line.type === 'removed' ? '' : (line.newLine ?? '')}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ---- Diff Algorithm ----

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldLine?: string;
  newLine?: string;
}

function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];

  // LCS-based approach for good quality diffs
  const lcs = computeLCS(oldLines, newLines);

  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length) {
      // Output removals before the next LCS match
      while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
        // Check if corresponding new line is also not in LCS (modified)
        if (
          newIdx < newLines.length &&
          newLines[newIdx] !== lcs[lcsIdx]
        ) {
          result.push({
            type: 'modified',
            oldLine: oldLines[oldIdx],
            newLine: newLines[newIdx],
          });
          oldIdx++;
          newIdx++;
        } else {
          result.push({ type: 'removed', oldLine: oldLines[oldIdx] });
          oldIdx++;
        }
      }

      // Output additions before the next LCS match
      while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
        result.push({ type: 'added', newLine: newLines[newIdx] });
        newIdx++;
      }

      // Output the matched line
      if (lcsIdx < lcs.length) {
        result.push({
          type: 'unchanged',
          oldLine: oldLines[oldIdx],
          newLine: newLines[newIdx],
        });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      }
    } else {
      // Past the end of LCS, remaining lines are changes
      if (oldIdx < oldLines.length && newIdx < newLines.length) {
        result.push({
          type: 'modified',
          oldLine: oldLines[oldIdx],
          newLine: newLines[newIdx],
        });
        oldIdx++;
        newIdx++;
      } else if (oldIdx < oldLines.length) {
        result.push({ type: 'removed', oldLine: oldLines[oldIdx] });
        oldIdx++;
      } else if (newIdx < newLines.length) {
        result.push({ type: 'added', newLine: newLines[newIdx] });
        newIdx++;
      }
    }
  }

  return result;
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // For very large prompts, truncate to avoid performance issues
  if (m > 500 || n > 500) {
    return computeLCSSimple(a.slice(0, 500), b.slice(0, 500));
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

function computeLCSSimple(a: string[], b: string[]): string[] {
  // Fallback for very large inputs: just match identical adjacent lines
  const result: string[] = [];
  const bSet = new Set(b);
  for (const line of a) {
    if (bSet.has(line)) {
      result.push(line);
    }
  }
  return result;
}

// ---- Snapshot Diff Dialog ----

function SnapshotDiffDialog({
  agentId,
  fromVersion,
  toVersion,
  open,
  onClose,
}: {
  agentId: string;
  fromVersion: number;
  toVersion: number;
  open: boolean;
  onClose: () => void;
}) {
  const { data: diffData, isLoading, error } = useConfigVersionDiff(
    agentId,
    fromVersion,
    toVersion,
    open
  );

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Snapshot Comparison
          </AlertDialogTitle>
          <AlertDialogDescription>
            Comparing snapshot v{fromVersion} with v{toVersion}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[400px] overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <RecoderLoader size="large" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <AlertCircle className="h-6 w-6 mx-auto mb-2 text-destructive" />
              <p className="text-sm text-muted-foreground">Failed to load comparison</p>
            </div>
          )}

          {diffData && diffData.differences.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-medium">Snapshots are identical</p>
            </div>
          )}

          {diffData && diffData.differences.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1">
                {diffData.differences.length} difference{diffData.differences.length !== 1 ? 's' : ''} found
              </p>
              {diffData.differences.map((diff) => (
                <div
                  key={diff.field}
                  className="rounded-lg border border-border p-3 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-mono',
                        diff.type === 'added' && 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20',
                        diff.type === 'removed' && 'bg-red-500/5 text-red-400 border-red-500/20',
                        diff.type === 'modified' && 'bg-amber-500/5 text-amber-400 border-amber-500/20'
                      )}
                    >
                      {diff.type}
                    </Badge>
                    <span className="text-sm font-medium font-mono">{diff.field}</span>
                  </div>
                  {diff.type === 'modified' && (
                    <div className="text-xs space-y-0.5">
                      <div className="text-red-400 truncate">
                        - {typeof diff.old_value === 'string' ? diff.old_value.slice(0, 120) : JSON.stringify(diff.old_value)?.slice(0, 120)}
                      </div>
                      <div className="text-emerald-400 truncate">
                        + {typeof diff.new_value === 'string' ? diff.new_value.slice(0, 120) : JSON.stringify(diff.new_value)?.slice(0, 120)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
