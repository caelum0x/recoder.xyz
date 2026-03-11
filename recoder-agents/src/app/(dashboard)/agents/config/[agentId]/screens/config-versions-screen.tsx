'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  History,
  Star,
  RotateCcw,
  CheckCircle2,
  Clock,
  Plus,
  Minus,
  ArrowRight,
  GitCompare,
  Save,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useConfigSnapshots,
  useCreateConfigSnapshot,
  useActivateSnapshot,
  useDiffSnapshots,
  useRollbackSnapshot,
  type ConfigSnapshot,
} from '@/hooks/agents/use-agent-versioned-configs';
import { useAgent } from '@/hooks/agents/use-agents';

interface ConfigVersionsScreenProps {
  agentId: string;
}

export function ConfigVersionsScreen({ agentId }: ConfigVersionsScreenProps) {
  const { data: snapshotData, isLoading } = useConfigSnapshots(agentId);
  const { data: agent } = useAgent(agentId);
  const createMutation = useCreateConfigSnapshot();
  const activateMutation = useActivateSnapshot();
  const rollbackMutation = useRollbackSnapshot();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createSummary, setCreateSummary] = useState('');

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  // Rollback confirmation
  const [rollbackTarget, setRollbackTarget] = useState<ConfigSnapshot | null>(null);

  // Diff viewer
  const [showDiff, setShowDiff] = useState(false);

  const snapshots = snapshotData?.snapshots || [];

  const {
    data: diffData,
    isLoading: isDiffLoading,
  } = useDiffSnapshots(
    agentId,
    selectedForCompare[0] || null,
    selectedForCompare[1] || null,
    showDiff && selectedForCompare.length === 2
  );

  const handleCreateSnapshot = useCallback(async () => {
    try {
      await createMutation.mutateAsync({
        agentId,
        data: {
          label: createLabel || undefined,
          config: agent || {},
          change_summary: createSummary || undefined,
        },
      });
      setIsCreateOpen(false);
      setCreateLabel('');
      setCreateSummary('');
    } catch {
      // Error handled by mutation
    }
  }, [agentId, createLabel, createSummary, agent, createMutation]);

  const handleActivate = useCallback(
    async (snapshotId: string) => {
      try {
        await activateMutation.mutateAsync({ agentId, snapshotId });
      } catch {
        // Error handled by mutation
      }
    },
    [agentId, activateMutation]
  );

  const handleRollback = useCallback(async () => {
    if (!rollbackTarget) return;
    try {
      await rollbackMutation.mutateAsync({
        agentId,
        snapshotId: rollbackTarget.id,
      });
      setRollbackTarget(null);
    } catch {
      // Error handled by mutation
    }
  }, [agentId, rollbackTarget, rollbackMutation]);

  const toggleCompareSelection = useCallback(
    (snapshotId: string) => {
      setSelectedForCompare((prev) => {
        if (prev.includes(snapshotId)) {
          return prev.filter((id) => id !== snapshotId);
        }
        if (prev.length >= 2) {
          return [prev[1], snapshotId];
        }
        return [...prev, snapshotId];
      });
      setShowDiff(false);
    },
    []
  );

  const handleCompare = useCallback(() => {
    if (selectedForCompare.length === 2) {
      setShowDiff(true);
    }
  }, [selectedForCompare]);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setSelectedForCompare([]);
    setShowDiff(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Config Versions</h2>
          <Badge variant="secondary" className="text-xs">
            {snapshots.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {compareMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={exitCompareMode}
              >
                Exit Compare
              </Button>
              <Button
                size="sm"
                disabled={selectedForCompare.length !== 2}
                onClick={handleCompare}
              >
                <GitCompare className="h-4 w-4 mr-1.5" />
                Compare
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareMode(true)}
                disabled={snapshots.length < 2}
              >
                <GitCompare className="h-4 w-4 mr-1.5" />
                Compare
              </Button>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Snapshot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Configuration Snapshot</DialogTitle>
                    <DialogDescription>
                      Create a snapshot of the current agent configuration. You can restore it later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Label (optional)</label>
                      <Input
                        placeholder="e.g., Before tool update"
                        value={createLabel}
                        onChange={(e) => setCreateLabel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Change Summary (optional)</label>
                      <Textarea
                        placeholder="What changed in this version?"
                        value={createSummary}
                        onChange={(e) => setCreateSummary(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateSnapshot}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? 'Saving...' : 'Save Snapshot'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Diff Viewer */}
      {showDiff && selectedForCompare.length === 2 && (
        <SpotlightCard className="p-4 border border-border bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Configuration Diff
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowDiff(false)}>
              Close
            </Button>
          </div>
          {isDiffLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : diffData?.differences && diffData.differences.length > 0 ? (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {diffData.differences.map((diff, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-start gap-3 p-2.5 rounded-md text-sm font-mono',
                    diff.type === 'added' && 'bg-green-500/10 border border-green-500/20',
                    diff.type === 'removed' && 'bg-red-500/10 border border-red-500/20',
                    diff.type === 'changed' && 'bg-amber-500/10 border border-amber-500/20'
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {diff.type === 'added' && <Plus className="h-3.5 w-3.5 text-green-500" />}
                    {diff.type === 'removed' && <Minus className="h-3.5 w-3.5 text-red-500" />}
                    {diff.type === 'changed' && <ArrowRight className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-foreground">{diff.key}</span>
                    {diff.type === 'changed' && (
                      <div className="mt-1 space-y-0.5">
                        <div className="text-red-400 text-xs truncate">
                          - {JSON.stringify(diff.old_value)}
                        </div>
                        <div className="text-green-400 text-xs truncate">
                          + {JSON.stringify(diff.new_value)}
                        </div>
                      </div>
                    )}
                    {diff.type === 'added' && (
                      <div className="mt-1 text-green-400 text-xs truncate">
                        + {JSON.stringify(diff.new_value)}
                      </div>
                    )}
                    {diff.type === 'removed' && (
                      <div className="mt-1 text-red-400 text-xs truncate">
                        - {JSON.stringify(diff.old_value)}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] flex-shrink-0',
                      diff.type === 'added' && 'text-green-500 border-green-500/30',
                      diff.type === 'removed' && 'text-red-500 border-red-500/30',
                      diff.type === 'changed' && 'text-amber-500 border-amber-500/30'
                    )}
                  >
                    {diff.type}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No differences found between the selected snapshots.
            </div>
          )}
        </SpotlightCard>
      )}

      {/* Version Timeline */}
      {snapshots.length === 0 ? (
        <SpotlightCard className="p-8 text-center">
          <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold mb-1">No Config Snapshots</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Save snapshots of your agent configuration to track changes over time.
          </p>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Save className="h-4 w-4 mr-1.5" />
            Save First Snapshot
          </Button>
        </SpotlightCard>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snapshot, index) => {
            const isSelected = selectedForCompare.includes(snapshot.id);

            return (
              <SpotlightCard
                key={snapshot.id}
                className={cn(
                  'p-4 transition-all',
                  snapshot.is_active && 'border-primary/40 bg-primary/5',
                  isSelected && 'ring-2 ring-primary/50'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Compare checkbox */}
                  {compareMode && (
                    <div className="pt-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCompareSelection(snapshot.id)}
                      />
                    </div>
                  )}

                  {/* Version number indicator */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold',
                        snapshot.is_active
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      v{snapshot.version_number}
                    </div>
                    {index < snapshots.length - 1 && (
                      <div className="w-px h-4 bg-border mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">
                        {snapshot.label || `Version ${snapshot.version_number}`}
                      </span>
                      {snapshot.is_active && (
                        <Badge className="bg-primary/20 text-primary text-[10px] gap-1">
                          <Star className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {snapshot.created_by === 'user' ? (
                          <User className="h-2.5 w-2.5" />
                        ) : (
                          <Bot className="h-2.5 w-2.5" />
                        )}
                        {snapshot.created_by}
                      </Badge>
                    </div>
                    {snapshot.change_summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {snapshot.change_summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
                      </span>
                      <span className="text-muted-foreground/60">
                        {format(new Date(snapshot.created_at), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {!compareMode && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!snapshot.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleActivate(snapshot.id)}
                          disabled={activateMutation.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setRollbackTarget(snapshot)}
                        disabled={rollbackMutation.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Rollback
                      </Button>
                    </div>
                  )}
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {/* Rollback Confirmation */}
      <AlertDialog open={!!rollbackTarget} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new snapshot from version {rollbackTarget?.version_number}
              {rollbackTarget?.label ? ` (${rollbackTarget.label})` : ''} and set it as the active
              configuration. The current configuration will be preserved as a previous version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollback}>
              {rollbackMutation.isPending ? 'Rolling back...' : 'Confirm Rollback'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
