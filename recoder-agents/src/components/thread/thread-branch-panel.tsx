'use client';

import React, { useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  ChevronDown,
  Circle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useThreadBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useBranchTree,
  type ThreadBranch,
} from '@/hooks/threads/use-thread-branches';
import type { BranchTreeNode } from '@/lib/api/thread-branches';

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-500/15 text-green-600 border-green-500/30', label: 'Active' },
  merged: { color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', label: 'Merged' },
  archived: { color: 'bg-gray-500/15 text-gray-500 border-gray-500/30', label: 'Archived' },
  deleted: { color: 'bg-red-500/15 text-red-500 border-red-500/30', label: 'Deleted' },
};

// ---------------------------------------------------------------------------
// Create Branch Dialog
// ---------------------------------------------------------------------------

function CreateBranchDialog({
  open,
  onOpenChange,
  threadId,
  branchPointIndex,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  branchPointIndex: number;
}) {
  const createMutation = useCreateBranch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  React.useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
    }
  }, [open]);

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        threadId,
        data: {
          branch_point_index: branchPointIndex,
          branch_name: name.trim() || undefined,
          description: description.trim() || undefined,
        },
      });
      onOpenChange(false);
    } catch {
      // Error handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Create Branch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground">
            Branching from message #{branchPointIndex}
          </div>

          <div className="space-y-2">
            <Label>Branch Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alternative approach"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why are you branching here?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Branch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Branch Tree Node (recursive)
// ---------------------------------------------------------------------------

function BranchTreeNodeView({
  node,
  depth,
  onSelectBranch,
  onDeleteBranch,
}: {
  node: BranchTreeNode;
  depth: number;
  onSelectBranch: (branch: ThreadBranch) => void;
  onDeleteBranch: (branch: ThreadBranch) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const branch = node.branch;
  const hasChildren = node.children.length > 0;

  return (
    <div className={cn('relative', depth > 0 && 'ml-4')}>
      {/* Vertical line connector */}
      {depth > 0 && (
        <div className="absolute -left-2 top-0 bottom-0 w-px bg-border" />
      )}

      {/* Branch point marker */}
      {branch && (
        <div className="relative flex items-start gap-2 py-1.5">
          {depth > 0 && (
            <div className="absolute -left-2 top-3 w-2 h-px bg-border" />
          )}
          <div className="flex-shrink-0 mt-1">
            <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="text-sm font-medium hover:text-primary transition-colors text-left"
                onClick={() => onSelectBranch(branch)}
              >
                {branch.branch_name || `Branch #${branch.branch_point_index}`}
              </button>
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', STATUS_STYLES[branch.status]?.color)}
              >
                {STATUS_STYLES[branch.status]?.label || branch.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                msg #{branch.branch_point_index}
              </span>
            </div>

            {branch.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {branch.description}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(branch.created_at).toLocaleDateString()}
              </span>
              <button
                className="text-[10px] text-destructive hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBranch(branch);
                }}
              >
                Delete
              </button>
            </div>
          </div>

          {hasChildren && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Root node (no branch data) */}
      {!branch && (
        <div className="flex items-center gap-2 py-1.5">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Main Thread
          </span>
          {hasChildren && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Children */}
      {expanded &&
        node.children.map((child, idx) => (
          <BranchTreeNodeView
            key={child.branch?.id || `${node.thread_id}-${idx}`}
            node={child}
            depth={depth + 1}
            onSelectBranch={onSelectBranch}
            onDeleteBranch={onDeleteBranch}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branch List Item
// ---------------------------------------------------------------------------

function BranchListItem({
  branch,
  onSelect,
  onDelete,
}: {
  branch: ThreadBranch;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const statusStyle = STATUS_STYLES[branch.status] || STATUS_STYLES.active;

  return (
    <Card className="cursor-pointer hover:border-primary/30 transition-all" onClick={onSelect}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium truncate">
                {branch.branch_name || `Branch at msg #${branch.branch_point_index}`}
              </span>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusStyle.color)}>
                {statusStyle.label}
              </Badge>
            </div>

            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>Branch point: msg #{branch.branch_point_index}</span>
              <span>{new Date(branch.created_at).toLocaleDateString()}</span>
            </div>

            {branch.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {branch.description}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export interface ThreadBranchPanelProps {
  threadId: string;
  onNavigateToBranch?: (branchThreadId: string) => void;
}

export function ThreadBranchPanel({
  threadId,
  onNavigateToBranch,
}: ThreadBranchPanelProps) {
  const { data: branchesData, isLoading: branchesLoading } = useThreadBranches(threadId);
  const { data: treeData, isLoading: treeLoading } = useBranchTree(threadId);
  const deleteMutation = useDeleteBranch();

  const [showTree, setShowTree] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [branchPointIndex, setBranchPointIndex] = useState(0);

  const branches = branchesData?.branches || [];
  const isLoading = branchesLoading || treeLoading;

  const handleBranchHere = (messageIndex: number) => {
    setBranchPointIndex(messageIndex);
    setCreateDialogOpen(true);
  };

  const handleSelectBranch = (branch: ThreadBranch) => {
    onNavigateToBranch?.(branch.branch_thread_id);
  };

  const handleDeleteBranch = async (branch: ThreadBranch) => {
    try {
      await deleteMutation.mutateAsync({
        branchId: branch.id,
        sourceThreadId: branch.source_thread_id,
      });
    } catch {
      // Error handled in hook
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Branches</h3>
          {branches.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {branches.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={showTree ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowTree(!showTree)}
          >
            Tree
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleBranchHere(0)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Branch
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : showTree && treeData ? (
            /* Tree View */
            <div className="space-y-1">
              <BranchTreeNodeView
                node={treeData.tree}
                depth={0}
                onSelectBranch={handleSelectBranch}
                onDeleteBranch={handleDeleteBranch}
              />
              {treeData.total_branches === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No branches yet. Click "Branch" to create one.
                </p>
              )}
            </div>
          ) : branches.length === 0 ? (
            /* Empty state */
            <div className="text-center py-8">
              <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No branches yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Branch from any message to explore alternative paths
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => handleBranchHere(0)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create First Branch
              </Button>
            </div>
          ) : (
            /* List View */
            <div className="space-y-2">
              {branches.map((branch) => (
                <BranchListItem
                  key={branch.id}
                  branch={branch}
                  onSelect={() => handleSelectBranch(branch)}
                  onDelete={() => handleDeleteBranch(branch)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create dialog */}
      <CreateBranchDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        threadId={threadId}
        branchPointIndex={branchPointIndex}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branch Here Button (for message hover)
// ---------------------------------------------------------------------------

export function BranchHereButton({
  threadId,
  messageIndex,
  className,
}: {
  threadId: string;
  messageIndex: number;
  className?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-7 w-7', className)}
        title="Branch from here"
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
      >
        <GitBranch className="h-3.5 w-3.5" />
      </Button>

      <CreateBranchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        threadId={threadId}
        branchPointIndex={messageIndex}
      />
    </>
  );
}

export default ThreadBranchPanel;
