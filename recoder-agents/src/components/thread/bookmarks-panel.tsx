'use client';

import React, { useState } from 'react';
import {
  Bookmark,
  Pencil,
  Trash2,
  ExternalLink,
  X,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useBookmarks,
  useDeleteBookmark,
  useUpdateBookmarkNote,
} from '@/hooks/threads/use-message-bookmarks';
import type { MessageBookmark } from '@/lib/api/message-bookmarks';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BookmarksPanelProps {
  threadId?: string;
  onScrollToMessage?: (messageIndex: number) => void;
}

export function BookmarksPanel({
  threadId,
  onScrollToMessage,
}: BookmarksPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewAll, setViewAll] = useState(false);

  // When viewing all, don't filter by thread
  const queryThreadId = viewAll ? undefined : threadId;
  const { data: bookmarks = [], isLoading } = useBookmarks(queryThreadId);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 cursor-pointer relative',
                bookmarks.length > 0 && 'text-primary'
              )}
            >
              <Bookmark className="h-4 w-4" />
              {bookmarks.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center px-1">
                  {bookmarks.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <p>Bookmarks</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-80 p-0 max-h-[400px] flex flex-col"
        side="bottom"
        align="end"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            {viewAll && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setViewAll(false)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <h4 className="text-sm font-medium">
              {viewAll ? 'All Bookmarks' : 'Thread Bookmarks'}
            </h4>
          </div>
          <div className="flex items-center gap-1">
            {!viewAll && threadId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setViewAll(true)}
              >
                View All
              </Button>
            )}
          </div>
        </div>

        {/* Bookmark list */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="p-6 text-center">
              <Bookmark className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                No bookmarks yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Hover over a message and click the bookmark icon
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {bookmarks.map((bookmark) => (
                <BookmarkItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  showThread={viewAll}
                  onScrollTo={() => {
                    if (
                      !viewAll &&
                      onScrollToMessage &&
                      bookmark.thread_id === threadId
                    ) {
                      onScrollToMessage(bookmark.message_index);
                      setIsOpen(false);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BookmarkItem({
  bookmark,
  showThread,
  onScrollTo,
}: {
  bookmark: MessageBookmark;
  showThread: boolean;
  onScrollTo: () => void;
}) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(bookmark.note || '');

  const deleteMutation = useDeleteBookmark();
  const updateNoteMutation = useUpdateBookmarkNote();

  const handleSaveNote = () => {
    updateNoteMutation.mutate({
      bookmarkId: bookmark.id,
      data: { note: noteText.trim() || null },
    });
    setIsEditingNote(false);
  };

  const timeAgo = getRelativeTime(bookmark.created_at);

  return (
    <div className="group px-3 py-2.5 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-2">
        {/* Content */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onScrollTo}
        >
          {showThread && (
            <div className="flex items-center gap-1 mb-0.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {bookmark.thread_id.slice(0, 8)}...
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                msg #{bookmark.message_index}
              </span>
            </div>
          )}
          {bookmark.message_preview ? (
            <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
              {bookmark.message_preview}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Message #{bookmark.message_index}
            </p>
          )}
          {bookmark.note && !isEditingNote && (
            <p className="text-[11px] text-muted-foreground mt-1 bg-muted/50 rounded px-1.5 py-0.5 line-clamp-2">
              {bookmark.note}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {timeAgo}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingNote(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteMutation.mutate(bookmark.id);
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Edit note inline */}
      {isEditingNote && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="w-full h-14 text-xs rounded-md border border-input bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveNote();
              }
              if (e.key === 'Escape') {
                setIsEditingNote(false);
                setNoteText(bookmark.note || '');
              }
            }}
          />
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setIsEditingNote(false);
                setNoteText(bookmark.note || '');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              onClick={handleSaveNote}
              disabled={updateNoteMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
