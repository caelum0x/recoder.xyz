'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  BookmarkX,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useThreadBookmarks,
  useAllBookmarks,
  useCreateBookmark,
  useUpdateBookmark,
  useDeleteBookmark,
  useBookmarkCollections,
  useCreateCollection,
  useDeleteCollection,
} from '@/hooks/threads/use-thread-message-bookmarks';
import type {
  MessageBookmark,
  MessageBookmarkCollection,
  CreateMessageBookmarkData,
} from '@/lib/api/thread-message-bookmarks';

// ============================================================================
// Color Presets
// ============================================================================

const COLOR_PRESETS = [
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
];

// ============================================================================
// BookmarkButton — exported for use in thread message views
// ============================================================================

export interface BookmarkButtonProps {
  threadId: string;
  messageIndex: number;
  isBookmarked?: boolean;
  className?: string;
}

export function BookmarkButton({
  threadId,
  messageIndex,
  isBookmarked = false,
  className,
}: BookmarkButtonProps) {
  const createMutation = useCreateBookmark(threadId);
  const deleteMutation = useDeleteBookmark();
  const { data: bookmarks } = useThreadBookmarks(threadId);

  const existingBookmark = bookmarks?.find((b) => b.message_index === messageIndex);
  const bookmarked = isBookmarked || !!existingBookmark;

  const handleClick = async () => {
    if (bookmarked && existingBookmark) {
      try {
        await deleteMutation.mutateAsync(existingBookmark.id);
        toast.success('Bookmark removed');
      } catch {
        toast.error('Failed to remove bookmark');
      }
    } else {
      try {
        await createMutation.mutateAsync({ message_index: messageIndex });
        toast.success('Message bookmarked');
      } catch {
        toast.error('Failed to bookmark message');
      }
    }
  };

  const isPending = createMutation.isPending || deleteMutation.isPending;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', className)}
      onClick={handleClick}
      disabled={isPending}
      title={bookmarked ? 'Remove bookmark' : 'Bookmark this message'}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Bookmark
          className={cn(
            'h-3.5 w-3.5',
            bookmarked ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
          )}
        />
      )}
    </Button>
  );
}

// ============================================================================
// Edit Bookmark Dialog
// ============================================================================

interface EditBookmarkDialogProps {
  bookmark: MessageBookmark | null;
  open: boolean;
  onClose: () => void;
}

function EditBookmarkDialog({ bookmark, open, onClose }: EditBookmarkDialogProps) {
  const [label, setLabel] = useState(bookmark?.bookmark_label || '');
  const [note, setNote] = useState(bookmark?.bookmark_note || '');
  const [color, setColor] = useState(bookmark?.bookmark_color || '#f59e0b');
  const updateMutation = useUpdateBookmark();

  // Sync form when bookmark changes
  React.useEffect(() => {
    if (bookmark) {
      setLabel(bookmark.bookmark_label || '');
      setNote(bookmark.bookmark_note || '');
      setColor(bookmark.bookmark_color || '#f59e0b');
    }
  }, [bookmark]);

  const handleSave = async () => {
    if (!bookmark) return;
    try {
      await updateMutation.mutateAsync({
        bookmarkId: bookmark.id,
        data: {
          bookmark_label: label.trim() || undefined,
          bookmark_note: note.trim() || undefined,
          bookmark_color: color,
        },
      });
      toast.success('Bookmark updated');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update bookmark');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Bookmark</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="bm-label" className="text-xs mb-1 block">
              Label
            </Label>
            <Input
              id="bm-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Message #${(bookmark?.message_index ?? 0) + 1}`}
            />
          </div>
          <div>
            <Label htmlFor="bm-note" className="text-xs mb-1 block">
              Note
            </Label>
            <Textarea
              id="bm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="min-h-[80px] text-sm"
            />
          </div>
          <div>
            <Label className="text-xs mb-2 block">Color</Label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.label}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-all',
                    color === preset.value
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-muted-foreground'
                  )}
                  style={{ backgroundColor: preset.value }}
                  onClick={() => setColor(preset.value)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Bookmark Row
// ============================================================================

interface BookmarkRowProps {
  bookmark: MessageBookmark;
  onEdit: (bookmark: MessageBookmark) => void;
}

function BookmarkRow({ bookmark, onEdit }: BookmarkRowProps) {
  const deleteMutation = useDeleteBookmark();
  const threadShort =
    bookmark.thread_id.length > 12
      ? `${bookmark.thread_id.slice(0, 8)}…`
      : bookmark.thread_id;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(bookmark.id);
      toast.success('Bookmark deleted');
    } catch {
      toast.error('Failed to delete bookmark');
    }
  };

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/40 group">
      {/* Color indicator */}
      <div
        className="mt-1 h-3 w-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: bookmark.bookmark_color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {bookmark.bookmark_label || `Message #${bookmark.message_index + 1}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground font-mono">
            {threadShort}
          </span>
          {bookmark.bookmark_note && (
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
              {bookmark.bookmark_note}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(bookmark.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(bookmark)}
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          title="Delete"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// ThreadBookmarksPanel — main panel component
// ============================================================================

interface ThreadBookmarksPanelProps {
  threadId?: string;
  className?: string;
}

export function ThreadBookmarksPanel({
  threadId,
  className,
}: ThreadBookmarksPanelProps) {
  const [editingBookmark, setEditingBookmark] = useState<MessageBookmark | null>(null);
  const [collectionsExpanded, setCollectionsExpanded] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  // Data
  const { data: threadBookmarks, isLoading: threadBMLoading } = useThreadBookmarks(
    threadId || ''
  );
  const { data: allBookmarksData, isLoading: allBMLoading } = useAllBookmarks({
    limit: 50,
  });
  const { data: collections, isLoading: collectionsLoading } = useBookmarkCollections();

  const createCollectionMutation = useCreateCollection();
  const deleteCollectionMutation = useDeleteCollection();

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      toast.error('Collection name is required');
      return;
    }
    try {
      await createCollectionMutation.mutateAsync({
        collection_name: newCollectionName.trim(),
      });
      toast.success('Collection created');
      setNewCollectionName('');
      setIsCreatingCollection(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create collection');
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    try {
      await deleteCollectionMutation.mutateAsync(collectionId);
      toast.success('Collection deleted');
    } catch {
      toast.error('Failed to delete collection');
    }
  };

  // Group all bookmarks by thread_id
  const bookmarksByThread = React.useMemo(() => {
    const all = allBookmarksData?.bookmarks || [];
    const groups: Record<string, MessageBookmark[]> = {};
    for (const bm of all) {
      if (!groups[bm.thread_id]) groups[bm.thread_id] = [];
      groups[bm.thread_id].push(bm);
    }
    return groups;
  }, [allBookmarksData]);

  const isLoading = threadBMLoading || allBMLoading || collectionsLoading;

  if (isLoading) {
    return (
      <div className={cn('space-y-3 p-4', className)}>
        <Skeleton className="h-5 w-32" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Thread Bookmarks Section */}
      {threadId && (
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">This Thread</h3>
            <Badge variant="secondary" className="text-[10px]">
              {threadBookmarks?.length ?? 0}
            </Badge>
          </div>
          {threadBookmarks && threadBookmarks.length > 0 ? (
            <div className="space-y-0.5">
              {threadBookmarks.map((bm) => (
                <BookmarkRow
                  key={bm.id}
                  bookmark={bm}
                  onEdit={setEditingBookmark}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              No bookmarks in this thread yet
            </p>
          )}
        </SpotlightCard>
      )}

      {/* All Bookmarks Section */}
      <SpotlightCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">All Bookmarks</h3>
          <Badge variant="secondary" className="text-[10px]">
            {allBookmarksData?.total ?? 0}
          </Badge>
        </div>
        {Object.keys(bookmarksByThread).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(bookmarksByThread).map(([tid, bookmarks]) => {
              const tidShort =
                tid.length > 16 ? `${tid.slice(0, 8)}…${tid.slice(-4)}` : tid;
              return (
                <div key={tid}>
                  <p className="text-xs font-mono text-muted-foreground mb-1 px-3">
                    {tidShort}
                  </p>
                  {bookmarks.map((bm) => (
                    <BookmarkRow
                      key={bm.id}
                      bookmark={bm}
                      onEdit={setEditingBookmark}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <BookmarkX className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No bookmarks yet. Use the bookmark button on any message to save it here.
            </p>
          </div>
        )}
      </SpotlightCard>

      {/* Collections Section */}
      <SpotlightCard className="overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
          onClick={() => setCollectionsExpanded(!collectionsExpanded)}
        >
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Collections</span>
            <Badge variant="secondary" className="text-[10px]">
              {collections?.length ?? 0}
            </Badge>
          </div>
          {collectionsExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {collectionsExpanded && (
          <div className="border-t border-border px-4 pb-4">
            {/* Create Collection */}
            <div className="mt-3 mb-3">
              {isCreatingCollection ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection name"
                    className="h-8 text-sm flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateCollection();
                      if (e.key === 'Escape') setIsCreatingCollection(false);
                    }}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleCreateCollection}
                    disabled={createCollectionMutation.isPending}
                  >
                    {createCollectionMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setIsCreatingCollection(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 w-full"
                  onClick={() => setIsCreatingCollection(true)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Create Collection
                </Button>
              )}
            </div>

            {/* Collection List */}
            {collections && collections.length > 0 ? (
              <div className="space-y-1.5">
                {collections.map((col) => (
                  <CollectionRow
                    key={col.id}
                    collection={col}
                    onDelete={() => handleDeleteCollection(col.id)}
                    isDeleting={deleteCollectionMutation.isPending}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">
                No collections yet
              </p>
            )}
          </div>
        )}
      </SpotlightCard>

      {/* Edit Dialog */}
      <EditBookmarkDialog
        bookmark={editingBookmark}
        open={!!editingBookmark}
        onClose={() => setEditingBookmark(null)}
      />
    </div>
  );
}

// ============================================================================
// Collection Row
// ============================================================================

interface CollectionRowProps {
  collection: MessageBookmarkCollection;
  onDelete: () => void;
  isDeleting: boolean;
}

function CollectionRow({ collection, onDelete, isDeleting }: CollectionRowProps) {
  return (
    <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/40 group">
      <div className="flex items-center gap-2 min-w-0">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{collection.collection_name}</p>
          {collection.description && (
            <p className="text-xs text-muted-foreground truncate">
              {collection.description}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
          {collection.bookmark_ids.length}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={onDelete}
        disabled={isDeleting}
        title="Delete collection"
      >
        {isDeleting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
