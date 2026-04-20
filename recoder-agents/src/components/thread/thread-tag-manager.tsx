'use client';

import React, { useState, useMemo } from 'react';
import {
  Tag,
  Plus,
  Check,
  Search,
  Pencil,
  Trash2,
  X,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { toast } from '@/lib/toast';
import {
  useThreadTags,
  useThreadTagAssignments,
  useCreateTag,
  useAssignTag,
  useRemoveTag,
  useUpdateTag,
  useDeleteTag,
} from '@/hooks/threads/use-thread-tags';
import type { ThreadTag } from '@/lib/api/thread-tags';

const TAG_COLORS = [
  '#6b7280', // gray
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
];

// ---------------------------------------------------------------------------
// Tag dot pills for displaying assigned tags inline
// ---------------------------------------------------------------------------

export function ThreadTagDots({
  threadId,
  enabled = true,
}: {
  threadId: string;
  enabled?: boolean;
}) {
  const { data: tags } = useThreadTagAssignments(threadId, { enabled });

  if (!tags || tags.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 ml-1">
      {tags.slice(0, 3).map((tag) => (
        <div
          key={tag.id}
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: tag.color }}
          title={tag.name}
        />
      ))}
      {tags.length > 3 && (
        <span className="text-[10px] text-muted-foreground ml-0.5">
          +{tags.length - 3}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag selector popover — used in thread context menu
// ---------------------------------------------------------------------------

interface TagSelectorPopoverProps {
  threadId: string;
  children: React.ReactNode;
}

export function TagSelectorPopover({ threadId, children }: TagSelectorPopoverProps) {
  const { data: allTags = [] } = useThreadTags();
  const { data: threadTags = [] } = useThreadTagAssignments(threadId);
  const assignMutation = useAssignTag();
  const removeMutation = useRemoveTag();
  const createMutation = useCreateTag();

  const [search, setSearch] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [showCreate, setShowCreate] = useState(false);

  const assignedTagIds = useMemo(
    () => new Set(threadTags.map((t) => t.id)),
    [threadTags]
  );

  const filteredTags = useMemo(() => {
    if (!search) return allTags;
    const lower = search.toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [allTags, search]);

  const handleToggle = async (tag: ThreadTag) => {
    const isAssigned = assignedTagIds.has(tag.id);
    try {
      if (isAssigned) {
        await removeMutation.mutateAsync({ threadId, tagId: tag.id });
      } else {
        await assignMutation.mutateAsync({ threadId, tagId: tag.id });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tag');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const newTag = await createMutation.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      });
      // Auto-assign to current thread
      await assignMutation.mutateAsync({ threadId, tagId: newTag.id });
      setNewTagName('');
      setShowCreate(false);
      toast.success('Tag created and assigned');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tag');
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-48 overflow-y-auto p-1">
          {filteredTags.length === 0 && !showCreate ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No tags found
            </div>
          ) : (
            filteredTags.map((tag) => {
              const isAssigned = assignedTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  className="flex items-center w-full gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors"
                  onClick={() => handleToggle(tag)}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="flex-1 text-left truncate">{tag.name}</span>
                  {isAssigned && (
                    <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t p-2">
          {showCreate ? (
            <div className="space-y-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              />
              <div className="flex items-center gap-1">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'w-5 h-5 rounded-full transition-all',
                      newTagColor === color && 'ring-2 ring-offset-1 ring-primary'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || createMutation.isPending}
                >
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create new tag
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Tag management dialog — edit/delete tags from settings
// ---------------------------------------------------------------------------

interface TagManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagManagementDialog({ open, onOpenChange }: TagManagementDialogProps) {
  const { data: tags = [], isLoading } = useThreadTags();
  const updateMutation = useUpdateTag();
  const deleteMutation = useDeleteTag();

  const [editingTag, setEditingTag] = useState<ThreadTag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null);

  const startEdit = (tag: ThreadTag) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const saveEdit = async () => {
    if (!editingTag || !editName.trim()) return;
    try {
      await updateMutation.mutateAsync({
        tagId: editingTag.id,
        data: { name: editName.trim(), color: editColor },
      });
      setEditingTag(null);
      toast.success('Tag updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tag');
    }
  };

  const handleDelete = async () => {
    if (!deleteTagId) return;
    try {
      await deleteMutation.mutateAsync(deleteTagId);
      setDeleteTagId(null);
      toast.success('Tag deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tag');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Manage Tags
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {tags.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No tags yet. Create one from the thread menu.
              </div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50"
                >
                  {editingTag?.id === tag.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      />
                      <div className="flex items-center gap-0.5">
                        {TAG_COLORS.map((color) => (
                          <button
                            key={color}
                            className={cn(
                              'w-4 h-4 rounded-full transition-all',
                              editColor === color &&
                                'ring-2 ring-offset-1 ring-primary'
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => setEditColor(color)}
                          />
                        ))}
                      </div>
                      <Button size="sm" className="h-7 text-xs" onClick={saveEdit}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setEditingTag(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm">{tag.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {tag.thread_count || 0} threads
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEdit(tag)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => setDeleteTagId(tag.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTagId}
        onOpenChange={(open) => !open && setDeleteTagId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the tag and remove it from all threads. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tag filter dropdown — used at top of thread list
// ---------------------------------------------------------------------------

interface TagFilterDropdownProps {
  selectedTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
}

export function TagFilterDropdown({
  selectedTagId,
  onSelectTag,
}: TagFilterDropdownProps) {
  const { data: tags = [] } = useThreadTags();

  if (tags.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 gap-1 text-xs',
            selectedTagId && 'bg-primary/10 text-primary'
          )}
        >
          <Tag className="h-3 w-3" />
          {selectedTagId
            ? tags.find((t) => t.id === selectedTagId)?.name || 'Tag'
            : 'Filter by tag'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <button
          className={cn(
            'flex items-center w-full gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors',
            !selectedTagId && 'bg-muted'
          )}
          onClick={() => onSelectTag(null)}
        >
          All threads
        </button>
        {tags.map((tag) => (
          <button
            key={tag.id}
            className={cn(
              'flex items-center w-full gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors',
              selectedTagId === tag.id && 'bg-muted'
            )}
            onClick={() => onSelectTag(tag.id)}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <span className="flex-1 text-left truncate">{tag.name}</span>
            {tag.thread_count !== undefined && (
              <span className="text-xs text-muted-foreground">{tag.thread_count}</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
