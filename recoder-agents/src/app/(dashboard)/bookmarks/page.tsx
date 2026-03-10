'use client';

import { useState } from 'react';
import {
  Bookmark,
  FolderPlus,
  Pencil,
  Trash2,
  MessageCircle,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import Link from 'next/link';
import {
  useBookmarkCollections,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
  useThreadBookmarksList,
  useDeleteThreadBookmark,
  useUpdateThreadBookmark,
} from '@/hooks/threads/use-thread-bookmarks';
import type { BookmarkCollection, ThreadBookmark } from '@/lib/api/thread-bookmarks';

// ============================================================================
// Color presets
// ============================================================================

const COLOR_PRESETS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
];

// ============================================================================
// Create Collection Dialog
// ============================================================================

function CreateCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const createCollection = useCreateCollection();

  const handleSubmit = () => {
    if (!name.trim()) return;
    createCollection.mutate(
      { name: name.trim(), description: description || undefined, color },
      {
        onSuccess: () => {
          toast.success('Collection created');
          onOpenChange(false);
          setName('');
          setDescription('');
          setColor(COLOR_PRESETS[0]);
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4" />
            New Collection
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="coll-name">Name</Label>
            <Input
              id="coll-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Research, Important, Later"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coll-desc">Description (optional)</Label>
            <Input
              id="coll-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this collection for?"
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    color === c
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  type="button"
                />
              ))}
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!name.trim() || createCollection.isPending}
          >
            {createCollection.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Create Collection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Bookmark Card
// ============================================================================

function BookmarkCard({ bookmark }: { bookmark: ThreadBookmark }) {
  const deleteBookmark = useDeleteThreadBookmark();
  const updateBookmark = useUpdateThreadBookmark();
  const [editing, setEditing] = useState(false);
  const [noteValue, setNoteValue] = useState(bookmark.note || '');

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteBookmark.mutate(bookmark.id, {
      onSuccess: () => toast.success('Bookmark removed'),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  const handleSaveNote = () => {
    updateBookmark.mutate(
      {
        bookmarkId: bookmark.id,
        data: { note: noteValue || undefined },
      },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Note updated');
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    );
  };

  const dateAdded = new Date(bookmark.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40">
      <div className="mt-0.5 rounded-lg p-2 bg-yellow-500/10">
        <MessageCircle className="h-4 w-4 text-yellow-500" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${bookmark.thread_id}/thread/new`}
            className="truncate text-sm font-medium hover:underline"
          >
            Thread {bookmark.thread_id.slice(0, 8)}...
          </Link>
          {bookmark.collection_name && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5 shrink-0"
            >
              <span
                className="h-1.5 w-1.5 rounded-full mr-1 inline-block"
                style={{ backgroundColor: bookmark.collection_color || '#6366f1' }}
              />
              {bookmark.collection_name}
            </Badge>
          )}
        </div>

        {editing ? (
          <div className="mt-2 flex gap-1">
            <Input
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              className="h-7 text-xs"
              placeholder="Add a note..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNote();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleSaveNote}
              disabled={updateBookmark.isPending}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setEditing(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            {bookmark.note && (
              <p className="mt-1 text-xs text-muted-foreground italic">
                {bookmark.note}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Added {dateAdded}</p>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRemove}
          disabled={deleteBookmark.isPending}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Loading & Empty States
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
        >
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Bookmark className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium mb-1">No bookmarks yet</h3>
      <p className="text-xs text-muted-foreground max-w-xs">
        Bookmark threads from the thread header to save them for quick access.
        Organize them into collections for easy retrieval.
      </p>
    </div>
  );
}

// ============================================================================
// Collection Sidebar Item
// ============================================================================

function CollectionItem({
  collection,
  isSelected,
  onSelect,
}: {
  collection: BookmarkCollection;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const deleteCollection = useDeleteCollection();
  const [showDelete, setShowDelete] = useState(false);

  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left group',
        isSelected
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onSelect}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: collection.color }}
      />
      <span className="truncate flex-1">{collection.name}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {collection.bookmark_count ?? 0}
      </span>
      {showDelete && (
        <button
          className="shrink-0 p-0.5 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            deleteCollection.mutate(collection.id, {
              onSuccess: () => toast.success('Collection deleted'),
            });
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </button>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function BookmarksPage() {
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | undefined
  >(undefined);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: collections, isLoading: loadingCollections } =
    useBookmarkCollections();
  const { data: bookmarksResponse, isLoading: loadingBookmarks } =
    useThreadBookmarksList(selectedCollectionId);

  const bookmarks = bookmarksResponse?.bookmarks || [];

  return (
    <div className="min-h-[100dvh] pb-12">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-500/10">
              <Bookmark className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Bookmarks</h1>
              <p className="text-sm text-muted-foreground">
                Saved threads organized by collection
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            New Collection
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar - Collections */}
          <div className="hidden md:block w-56 shrink-0 space-y-1">
            <button
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                !selectedCollectionId
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              onClick={() => setSelectedCollectionId(undefined)}
            >
              <Bookmark className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">All Bookmarks</span>
              <span className="text-xs text-muted-foreground">
                {bookmarksResponse?.total ?? 0}
              </span>
            </button>

            {loadingCollections ? (
              <div className="space-y-2 px-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : (
              collections?.map((coll) => (
                <CollectionItem
                  key={coll.id}
                  collection={coll}
                  isSelected={selectedCollectionId === coll.id}
                  onSelect={() => setSelectedCollectionId(coll.id)}
                />
              ))
            )}

            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left mt-2"
              onClick={() => setCreateDialogOpen(true)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New Collection
            </button>
          </div>

          {/* Mobile collection selector */}
          <div className="md:hidden w-full mb-4">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                  !selectedCollectionId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                onClick={() => setSelectedCollectionId(undefined)}
              >
                All
              </button>
              {collections?.map((coll) => (
                <button
                  key={coll.id}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5',
                    selectedCollectionId === coll.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                  onClick={() => setSelectedCollectionId(coll.id)}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: coll.color }}
                  />
                  {coll.name}
                </button>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {loadingBookmarks ? (
              <LoadingSkeleton />
            ) : bookmarks.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                {bookmarks.map((bm) => (
                  <BookmarkCard key={bm.id} bookmark={bm} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateCollectionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
