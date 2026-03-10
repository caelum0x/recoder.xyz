'use client';

import { useState, useMemo } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Trash2,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { ThreadIcon } from './thread-icon';
import { DeleteConfirmationDialog } from '@/components/thread/DeleteConfirmationDialog';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import {
  useArchivedThreads,
  useBulkUnarchiveThreads,
  useBulkDeleteThreads,
} from '@/hooks/threads/use-thread-bulk';
import type { ArchivedThread } from '@/lib/api/thread-bulk';

function formatArchivedDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ArchivedThreadItemProps {
  thread: ArchivedThread;
  isSelected: boolean;
  onToggleSelect: (threadId: string) => void;
  onUnarchive: (threadId: string) => void;
  onDelete: (threadId: string, name: string) => void;
  isSelectionMode: boolean;
}

function ArchivedThreadItem({
  thread,
  isSelected,
  onToggleSelect,
  onUnarchive,
  onDelete,
  isSelectionMode,
}: ArchivedThreadItemProps) {
  const [isHovering, setIsHovering] = useState(false);
  const displayName = thread.project_name || thread.thread_name || 'Unnamed';

  return (
    <SpotlightCard className="transition-colors bg-transparent">
      <div
        className="flex items-center gap-2 p-2 text-sm group/archived"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Checkbox for selection mode */}
        {isSelectionMode && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(thread.thread_id)}
            className="flex-shrink-0"
          />
        )}

        {/* Icon */}
        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-muted/30 border border-border/50 flex-shrink-0 opacity-60">
          <ThreadIcon
            iconName={thread.project_icon_name}
            className="text-muted-foreground"
            size={12}
          />
        </div>

        {/* Name - muted styling */}
        <span className="flex-1 truncate text-muted-foreground">{displayName}</span>

        {/* Date / Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {!isHovering && !isSelectionMode && (
            <span className="text-xs text-muted-foreground/60">
              {formatArchivedDate(thread.archived_at)}
            </span>
          )}

          {(isHovering || isSelectionMode) && !isSelectionMode && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnarchive(thread.thread_id);
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Unarchive</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-1 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(thread.thread_id, displayName);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete permanently</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </SpotlightCard>
  );
}

export function ArchivedThreadsSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: archivedData, isLoading } = useArchivedThreads();
  const unarchiveMutation = useBulkUnarchiveThreads();
  const deleteMutation = useBulkDeleteThreads();

  const archivedThreads = useMemo(() => archivedData?.threads || [], [archivedData]);
  const archivedCount = archivedData?.total || 0;

  // Don't render if no archived threads
  if (!isLoading && archivedCount === 0) {
    return null;
  }

  const toggleSelect = (threadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      if (next.size === 0) setIsSelectionMode(false);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(archivedThreads.map((t) => t.thread_id)));
    setIsSelectionMode(true);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleUnarchiveSingle = (threadId: string) => {
    unarchiveMutation.mutate([threadId], {
      onSuccess: () => {
        toast.success('Thread unarchived');
      },
      onError: () => {
        toast.error('Failed to unarchive thread');
      },
    });
  };

  const handleBulkUnarchive = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    unarchiveMutation.mutate(ids, {
      onSuccess: (data) => {
        toast.success(`Unarchived ${data.unarchived} thread${data.unarchived !== 1 ? 's' : ''}`);
        setSelectedIds(new Set());
        setIsSelectionMode(false);
      },
      onError: () => {
        toast.error('Failed to unarchive threads');
      },
    });
  };

  const handleDeleteSingle = (threadId: string, name: string) => {
    setDeleteTarget({ id: threadId, name });
    setIsDeleteDialogOpen(true);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteTarget({
      id: 'bulk',
      name: `${selectedIds.size} archived thread${selectedIds.size !== 1 ? 's' : ''}`,
    });
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setIsDeleteDialogOpen(false);

    const ids = deleteTarget.id === 'bulk' ? Array.from(selectedIds) : [deleteTarget.id];

    deleteMutation.mutate(ids, {
      onSuccess: (data) => {
        const count = data.deleted || 0;
        toast.success(`Permanently deleted ${count} thread${count !== 1 ? 's' : ''}`);
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error('Failed to delete threads');
        setDeleteTarget(null);
      },
    });
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/30">
            <Archive className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Archived</span>
            <span className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded-full tabular-nums">
              {archivedCount}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                isOpen ? 'rotate-0' : '-rotate-90'
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Bulk action bar when items are selected */}
          {isSelectionMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={selectedIds.size === archivedThreads.length ? deselectAll : selectAll}
              >
                {selectedIds.size === archivedThreads.length ? 'Deselect All' : 'Select All'}
              </Button>
              <span className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleBulkUnarchive}
                    disabled={unarchiveMutation.isPending}
                  >
                    {unarchiveMutation.isPending ? (
                      <RecoderLoader size="small" className="mr-1" />
                    ) : (
                      <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                    )}
                    Unarchive ({selectedIds.size})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Unarchive selected threads</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={handleBulkDelete}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Permanently delete selected threads</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Toggle selection mode */}
          {!isSelectionMode && archivedThreads.length > 1 && (
            <div className="flex items-center justify-end px-2.5 py-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => setIsSelectionMode(true)}
              >
                Select
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <RecoderLoader size="small" />
            </div>
          ) : archivedThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
              <Inbox className="h-5 w-5 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground/60">No archived threads</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-1">
              {archivedThreads.map((thread) => (
                <ArchivedThreadItem
                  key={thread.thread_id}
                  thread={thread}
                  isSelected={selectedIds.has(thread.thread_id)}
                  onToggleSelect={toggleSelect}
                  onUnarchive={handleUnarchiveSingle}
                  onDelete={handleDeleteSingle}
                  isSelectionMode={isSelectionMode}
                />
              ))}
            </div>
          )}

          {/* Cancel selection mode */}
          {isSelectionMode && (
            <div className="flex justify-center py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-3 text-[11px] text-muted-foreground"
                onClick={deselectAll}
              >
                Cancel selection
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {deleteTarget && (
        <DeleteConfirmationDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => {
            setIsDeleteDialogOpen(false);
            setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
          threadName={deleteTarget.name}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </>
  );
}
