'use client';

import React, { useState, useMemo } from 'react';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useBookmarks,
  useCreateBookmark,
  useDeleteBookmark,
} from '@/hooks/threads/use-message-bookmarks';
import type { MessageBookmark } from '@/lib/api/message-bookmarks';

interface MessageBookmarkButtonProps {
  threadId: string;
  messageIndex: number;
  messagePreview?: string;
  className?: string;
}

export function MessageBookmarkButton({
  threadId,
  messageIndex,
  messagePreview,
  className,
}: MessageBookmarkButtonProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');

  const { data: bookmarks } = useBookmarks(threadId);
  const createBookmark = useCreateBookmark();
  const deleteBookmarkMutation = useDeleteBookmark();

  const existingBookmark: MessageBookmark | undefined = useMemo(() => {
    if (!bookmarks) return undefined;
    return bookmarks.find(
      (b) => b.thread_id === threadId && b.message_index === messageIndex
    );
  }, [bookmarks, threadId, messageIndex]);

  const isBookmarked = !!existingBookmark;

  const handleToggle = () => {
    if (isBookmarked && existingBookmark) {
      deleteBookmarkMutation.mutate(existingBookmark.id);
    } else {
      setShowNoteInput(true);
    }
  };

  const handleSaveBookmark = () => {
    createBookmark.mutate({
      thread_id: threadId,
      message_index: messageIndex,
      message_preview: messagePreview?.slice(0, 200),
      note: noteText.trim() || undefined,
    });
    setShowNoteInput(false);
    setNoteText('');
  };

  const handleCancelNote = () => {
    // Save without note
    createBookmark.mutate({
      thread_id: threadId,
      message_index: messageIndex,
      message_preview: messagePreview?.slice(0, 200),
    });
    setShowNoteInput(false);
    setNoteText('');
  };

  if (showNoteInput) {
    return (
      <Popover open={showNoteInput} onOpenChange={setShowNoteInput}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 text-primary transition-colors',
              className
            )}
          >
            <Bookmark className="h-3.5 w-3.5" fill="currentColor" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" side="top" align="end">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Add a note (optional)
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Why is this important?"
              className="w-full h-16 text-xs rounded-md border border-input bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveBookmark();
                }
                if (e.key === 'Escape') {
                  handleCancelNote();
                }
              }}
            />
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleCancelNote}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSaveBookmark}
              >
                Save
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 transition-colors',
            isBookmarked
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
            className
          )}
          onClick={handleToggle}
          disabled={
            createBookmark.isPending || deleteBookmarkMutation.isPending
          }
        >
          <Bookmark
            className="h-3.5 w-3.5"
            fill={isBookmarked ? 'currentColor' : 'none'}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{isBookmarked ? 'Remove bookmark' : 'Bookmark message'}</p>
      </TooltipContent>
    </Tooltip>
  );
}
