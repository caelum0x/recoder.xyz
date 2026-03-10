'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Bookmark,
  BookmarkPlus,
  FolderPlus,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  useBookmarkCollections,
  useToggleThreadBookmark,
  useDeleteThreadBookmark,
  useCreateCollection,
  useThreadBookmarksList,
} from '@/hooks/threads/use-thread-bookmarks';
import type { ThreadBookmark, BookmarkCollection } from '@/lib/api/thread-bookmarks';

interface BookmarkButtonProps {
  threadId: string;
  className?: string;
  variant?: 'ghost' | 'outline';
  size?: 'icon' | 'sm' | 'default';
}

export function BookmarkButton({
  threadId,
  className,
  variant = 'ghost',
  size = 'icon',
}: BookmarkButtonProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const { data: bookmarksResponse } = useThreadBookmarksList();
  const { data: collections } = useBookmarkCollections();
  const toggleBookmark = useToggleThreadBookmark();
  const removeBookmark = useDeleteThreadBookmark();
  const createCollection = useCreateCollection();

  // Find if this thread is already bookmarked
  const existingBookmark: ThreadBookmark | undefined = bookmarksResponse?.bookmarks?.find(
    (b) => b.thread_id === threadId
  );
  const isBookmarked = !!existingBookmark;

  // Reset state when popover closes
  useEffect(() => {
    if (!popoverOpen) {
      setShowNewCollection(false);
      setNewCollectionName('');
      setNote('');
      setShowNoteInput(false);
    }
  }, [popoverOpen]);

  const handleQuickBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBookmarked && existingBookmark) {
      removeBookmark.mutate(existingBookmark.id, {
        onSuccess: () => toast.success('Bookmark removed'),
        onError: (err) => toast.error(`Failed to remove bookmark: ${err.message}`),
      });
    } else {
      toggleBookmark.mutate(
        { thread_id: threadId },
        {
          onSuccess: () => toast.success('Thread bookmarked'),
          onError: (err) => toast.error(`Failed to bookmark: ${err.message}`),
        }
      );
    }
  };

  const handleAddToCollection = (collectionId: string) => {
    toggleBookmark.mutate(
      { thread_id: threadId, collection_id: collectionId, note: note || undefined },
      {
        onSuccess: () => {
          toast.success('Bookmarked to collection');
          setPopoverOpen(false);
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    );
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    createCollection.mutate(
      { name: newCollectionName.trim() },
      {
        onSuccess: (coll) => {
          // Also add bookmark to the new collection
          toggleBookmark.mutate(
            { thread_id: threadId, collection_id: coll.id, note: note || undefined },
            {
              onSuccess: () => {
                toast.success('Collection created and thread bookmarked');
                setPopoverOpen(false);
              },
            }
          );
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      }
    );
  };

  // Get the collection color for the bookmark dot indicator
  const bookmarkCollection = existingBookmark?.collection_id
    ? collections?.find((c) => c.id === existingBookmark.collection_id)
    : null;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn('relative', className)}
          onClick={(e) => {
            // If not bookmarked, let popover open to pick collection
            // If already bookmarked, just toggle
            if (isBookmarked) {
              e.preventDefault();
              handleQuickBookmark(e);
            }
          }}
        >
          <Bookmark
            className={cn(
              'h-4 w-4',
              isBookmarked ? 'fill-current text-yellow-500' : 'text-muted-foreground'
            )}
          />
          {bookmarkCollection && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background"
              style={{ backgroundColor: bookmarkCollection.color }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-2">
          <p className="text-sm font-medium">Bookmark Thread</p>

          {/* Quick bookmark without collection */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm"
            onClick={() => handleAddToCollection('')}
            disabled={toggleBookmark.isPending}
          >
            <BookmarkPlus className="h-3.5 w-3.5 mr-2" />
            Quick Bookmark
          </Button>

          {/* Collection list */}
          {collections && collections.length > 0 && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground px-1">Add to collection</p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {collections.map((coll: BookmarkCollection) => (
                  <Button
                    key={coll.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm"
                    onClick={() => handleAddToCollection(coll.id)}
                    disabled={toggleBookmark.isPending}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: coll.color }}
                    />
                    <span className="truncate">{coll.name}</span>
                    {coll.bookmark_count !== undefined && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {coll.bookmark_count}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}

          <Separator />

          {/* Add note toggle */}
          {!showNoteInput ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm"
              onClick={() => setShowNoteInput(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Add Note
            </Button>
          ) : (
            <div className="space-y-1">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note..."
                className="text-xs h-8"
              />
            </div>
          )}

          {/* Create new collection */}
          {!showNewCollection ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm"
              onClick={() => setShowNewCollection(true)}
            >
              <FolderPlus className="h-3.5 w-3.5 mr-2" />
              New Collection
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name..."
                className="text-xs h-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCollection();
                }}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={handleCreateCollection}
                disabled={
                  !newCollectionName.trim() || createCollection.isPending
                }
              >
                {createCollection.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                Create & Add
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
