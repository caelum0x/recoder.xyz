'use client';

import { useState } from 'react';
import { GitBranch, GitMerge, Trash2, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorktrees, useWorktreeDiff, useMergeWorktree, useCleanupWorktree } from '@/hooks/workspaces/use-worktrees';
import type { WorktreeInfo } from '@recoder/shared/a2a';

interface WorktreePanelProps {
  workspaceId: string;
  containerId?: string;
}

export function WorktreePanel({ workspaceId, containerId }: WorktreePanelProps) {
  const { data } = useWorktrees(workspaceId, containerId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const worktrees = data?.worktrees ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Worktrees
        </h3>
        <span className="text-xs text-muted-foreground">
          {worktrees.length} active
        </span>
      </div>

      {/* Branch tree visualization */}
      <div className="space-y-1">
        {/* Main branch */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
          <GitBranch className="h-3.5 w-3.5 text-green-500" />
          <span className="text-sm font-medium">main</span>
          <span className="text-[10px] text-muted-foreground ml-auto">base</span>
        </div>

        {/* Agent branches */}
        {worktrees.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3 pl-6">
            No active worktrees
          </p>
        ) : (
          worktrees.map((wt) => (
            <WorktreeBranchRow
              key={wt.taskId}
              worktree={wt}
              isSelected={selectedTaskId === wt.taskId}
              onSelect={() => setSelectedTaskId(wt.taskId === selectedTaskId ? null : wt.taskId)}
            />
          ))
        )}
      </div>

      {/* Selected worktree details */}
      {selectedTaskId && containerId && (
        <WorktreeDetails
          workspaceId={workspaceId}
          taskId={selectedTaskId}
          containerId={containerId}
        />
      )}
    </div>
  );
}

function WorktreeBranchRow({
  worktree,
  isSelected,
  onSelect,
}: {
  worktree: WorktreeInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const statusColor = {
    active: 'text-blue-500',
    merged: 'text-green-500',
    conflict: 'text-red-500',
    removed: 'text-gray-400',
  }[worktree.status];

  return (
    <button
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md w-full text-left hover:bg-accent/30 transition-colors pl-6',
        isSelected && 'bg-accent/50',
      )}
      onClick={onSelect}
    >
      <ChevronRight className={cn('h-3 w-3 transition-transform', isSelected && 'rotate-90')} />
      <GitBranch className={cn('h-3.5 w-3.5', statusColor)} />
      <span className="text-xs truncate">{worktree.branchName}</span>
      {worktree.status === 'conflict' && (
        <AlertTriangle className="h-3 w-3 text-red-500 ml-auto" />
      )}
      <span className={cn('text-[10px] ml-auto', statusColor)}>
        {worktree.status}
      </span>
    </button>
  );
}

function WorktreeDetails({
  workspaceId,
  taskId,
  containerId,
}: {
  workspaceId: string;
  taskId: string;
  containerId: string;
}) {
  const { data: diff, isLoading: diffLoading } = useWorktreeDiff(workspaceId, taskId, containerId);
  const mergeWorktree = useMergeWorktree();
  const cleanupWorktree = useCleanupWorktree();
  const [mergeStrategy, setMergeStrategy] = useState<'merge' | 'rebase'>('merge');

  return (
    <div className="border rounded-lg p-3 space-y-3">
      {/* Diff preview */}
      <div>
        <h4 className="text-xs font-medium mb-1">Changes</h4>
        {diffLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : diff ? (
          <pre className="text-[10px] bg-muted/50 rounded p-2 max-h-48 overflow-auto whitespace-pre font-mono">
            {diff.slice(0, 5000)}
            {diff.length > 5000 && '\n... (truncated)'}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">No changes</p>
        )}
      </div>

      {/* Merge controls */}
      <div className="flex items-center gap-2">
        <Select value={mergeStrategy} onValueChange={(v) => setMergeStrategy(v as 'merge' | 'rebase')}>
          <SelectTrigger className="w-28 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="merge">Merge</SelectItem>
            <SelectItem value="rebase">Rebase</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            mergeWorktree.mutate({ wsId: workspaceId, taskId, containerId, strategy: mergeStrategy })
          }
          disabled={mergeWorktree.isPending}
        >
          {mergeWorktree.isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <GitMerge className="h-3 w-3 mr-1" />
          )}
          Merge to main
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive ml-auto"
          onClick={() => cleanupWorktree.mutate({ wsId: workspaceId, taskId, containerId })}
          disabled={cleanupWorktree.isPending}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Remove
        </Button>
      </div>

      {/* Merge result feedback */}
      {mergeWorktree.data && !mergeWorktree.data.success && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2">
          <p className="text-xs text-red-700 dark:text-red-400 font-medium">Merge conflicts:</p>
          <ul className="text-[10px] text-red-600 dark:text-red-300 mt-1">
            {mergeWorktree.data.conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
