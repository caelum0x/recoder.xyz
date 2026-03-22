'use client';

import React, { useState } from 'react';
import {
  Camera,
  Star,
  Trash2,
  RotateCcw,
  Plus,
  AlertCircle,
  Tag,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/lib/toast';
import {
  useSnapshots,
  useSnapshotStats,
  useCreateSnapshot,
  useUpdateSnapshot,
  useDeleteSnapshot,
  useRestoreSnapshot,
} from '@/hooks/agents/use-agent-config-snapshots';
import type { ConfigSnapshot } from '@/lib/api/agent-config-snapshots';

interface ConfigSnapshotScreenProps {
  agentId: string;
}

export function ConfigSnapshotScreen({ agentId }: ConfigSnapshotScreenProps) {
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<ConfigSnapshot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConfigSnapshot | null>(null);

  // Form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTagsRaw, setNewTagsRaw] = useState('');
  const [restoreNotes, setRestoreNotes] = useState('');

  const { data: stats, isLoading: statsLoading } = useSnapshotStats(agentId);
  const { data: snapshots, isLoading: listLoading, error } = useSnapshots(agentId, { pinnedOnly });

  const createMutation = useCreateSnapshot(agentId);
  const updateMutation = useUpdateSnapshot(agentId);
  const deleteMutation = useDeleteSnapshot(agentId);
  const restoreMutation = useRestoreSnapshot(agentId);

  const isLoading = statsLoading || listLoading;

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Snapshot name is required');
      return;
    }
    try {
      const tags = newTagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await createMutation.mutateAsync({
        snapshot_name: newName.trim(),
        description: newDesc.trim() || undefined,
        config_data: {},
        tags,
      });
      toast.success('Snapshot created');
      setIsCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setNewTagsRaw('');
    } catch {
      toast.error('Failed to create snapshot');
    }
  };

  const handleTogglePin = async (snapshot: ConfigSnapshot) => {
    try {
      await updateMutation.mutateAsync({
        snapshotId: snapshot.id,
        data: { is_pinned: !snapshot.is_pinned },
      });
      toast.success(snapshot.is_pinned ? 'Snapshot unpinned' : 'Snapshot pinned');
    } catch {
      toast.error('Failed to update snapshot');
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreMutation.mutateAsync({
        snapshotId: restoreTarget.id,
        notes: restoreNotes.trim() || undefined,
      });
      toast.success('Snapshot restored');
      setRestoreTarget(null);
      setRestoreNotes('');
    } catch {
      toast.error('Failed to restore snapshot');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Snapshot deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete snapshot');
    }
  };

  if (isLoading) {
    return <SnapshotLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Failed to load snapshots</h4>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {(error as Error).message || 'An unexpected error occurred.'}
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
          {/* Filter toggle */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
            <button
              onClick={() => setPinnedOnly(false)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                !pinnedOnly
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
            <button
              onClick={() => setPinnedOnly(true)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                pinnedOnly
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Pinned only
            </button>
          </div>
        </div>

        <Button
          size="sm"
          className="h-9 px-3 rounded-xl gap-2"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create Snapshot
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 px-1 mb-5">
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Total Snapshots</span>
                <Camera className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-2xl font-semibold text-foreground">{stats.total_snapshots}</span>
            </div>
          </SpotlightCard>
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Pinned</span>
                <Star className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-2xl font-semibold text-foreground">{stats.pinned_count}</span>
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Snapshot List */}
      {!snapshots || snapshots.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4 border">
            <Camera className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">
            {pinnedOnly ? 'No pinned snapshots' : 'No snapshots yet'}
          </h4>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
            {pinnedOnly
              ? 'Pin a snapshot to find it quickly later.'
              : 'Create a snapshot to save the current agent configuration.'}
          </p>
          {!pinnedOnly && (
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Snapshot
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-1 space-y-3">
            {snapshots.map((snapshot) => (
              <SpotlightCard key={snapshot.id} className="bg-card border border-border">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {snapshot.snapshot_name}
                        </h4>
                        {snapshot.is_pinned && (
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                        )}
                      </div>

                      {snapshot.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                          {snapshot.description}
                        </p>
                      )}

                      {snapshot.tags && snapshot.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {snapshot.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                              <Tag className="h-2.5 w-2.5" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
                        </span>
                        {snapshot.restored_count > 0 && (
                          <span className="flex items-center gap-1">
                            <RotateCw className="h-3 w-3" />
                            Restored {snapshot.restored_count}×
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-8 w-8',
                          snapshot.is_pinned
                            ? 'text-amber-400 hover:text-amber-500'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                        onClick={() => handleTogglePin(snapshot)}
                        title={snapshot.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        <Star
                          className={cn('h-4 w-4', snapshot.is_pinned && 'fill-amber-400')}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setRestoreTarget(snapshot)}
                        title="Restore"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(snapshot)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create Snapshot Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Create Config Snapshot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="snap-name">Snapshot name *</Label>
              <Input
                id="snap-name"
                placeholder="e.g. Pre-migration baseline"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snap-desc">Description</Label>
              <Textarea
                id="snap-desc"
                placeholder="Optional description..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snap-tags">Tags (comma-separated)</Label>
              <Input
                id="snap-tags"
                placeholder="e.g. stable, v2, production"
                value={newTagsRaw}
                onChange={(e) => setNewTagsRaw(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              {createMutation.isPending ? 'Creating...' : 'Create Snapshot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) { setRestoreTarget(null); setRestoreNotes(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Restore Snapshot
            </DialogTitle>
          </DialogHeader>
          {restoreTarget && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                You are about to restore <span className="font-medium text-foreground">{restoreTarget.snapshot_name}</span>. This will mark the snapshot as restored.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="restore-notes">Notes (optional)</Label>
                <Textarea
                  id="restore-notes"
                  placeholder="Why are you restoring this snapshot?"
                  value={restoreNotes}
                  onChange={(e) => setRestoreNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreTarget(null); setRestoreNotes(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {restoreMutation.isPending ? 'Restoring...' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">{deleteTarget?.snapshot_name}</span> and its
              restore history. This action cannot be undone.
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

function SnapshotLoadingSkeleton() {
  return (
    <div className="flex-1 overflow-auto pb-6">
      <div className="px-1 pt-1 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-44 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
