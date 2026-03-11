'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useMessageReactions,
  useAddReaction,
  useRemoveReaction,
  useFrequentEmojis,
} from '@/hooks/threads/use-thread-reactions';
import type { ReactionGroup } from '@/lib/api/thread-reactions';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Common emojis grid
// ---------------------------------------------------------------------------

const COMMON_EMOJIS = [
  '\u{1F44D}', // thumbs up
  '\u{1F44E}', // thumbs down
  '\u{2764}\u{FE0F}', // red heart
  '\u{1F602}', // face with tears of joy
  '\u{1F389}', // party popper
  '\u{1F914}', // thinking face
  '\u{1F440}', // eyes
  '\u{1F525}', // fire
  '\u{2705}',  // check mark
  '\u{274C}',  // cross mark
  '\u{1F4A1}', // light bulb
  '\u{1F680}', // rocket
  '\u{26A1}',  // high voltage
  '\u{1F64F}', // folded hands
  '\u{1F4AF}', // 100
  '\u{1F916}', // robot
];

// ---------------------------------------------------------------------------
// Emoji Picker Popover
// ---------------------------------------------------------------------------

function EmojiPicker({
  onSelect,
  open,
  onOpenChange,
}: {
  onSelect: (emoji: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: frequentData } = useFrequentEmojis();
  const frequentEmojis = frequentData?.map((f) => f.emoji) || [];

  // Deduplicate: show frequent first, then remaining common emojis
  const frequentSet = new Set(frequentEmojis);
  const remainingCommon = COMMON_EMOJIS.filter((e) => !frequentSet.has(e));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="top">
        {frequentEmojis.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground px-1 mb-1">Frequent</p>
            <div className="grid grid-cols-8 gap-0.5 mb-2">
              {frequentEmojis.slice(0, 8).map((emoji) => (
                <button
                  key={`freq-${emoji}`}
                  className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-base cursor-pointer"
                  onClick={() => {
                    onSelect(emoji);
                    onOpenChange(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="text-[10px] text-muted-foreground px-1 mb-1">All</p>
        <div className="grid grid-cols-8 gap-0.5">
          {(frequentEmojis.length > 0 ? remainingCommon : COMMON_EMOJIS).map((emoji) => (
            <button
              key={`common-${emoji}`}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-base cursor-pointer"
              onClick={() => {
                onSelect(emoji);
                onOpenChange(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Reaction Pill
// ---------------------------------------------------------------------------

function ReactionPill({
  reaction,
  onToggle,
}: {
  reaction: ReactionGroup;
  onToggle: (emoji: string, remove: boolean) => void;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors cursor-pointer',
              reaction.includes_me
                ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                : 'bg-muted/50 border-border hover:bg-muted'
            )}
            onClick={() => onToggle(reaction.emoji, reaction.includes_me)}
          >
            <span className="text-sm leading-none">{reaction.emoji}</span>
            <span className="font-medium tabular-nums">{reaction.count}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-48">
          <p className="text-xs">
            {reaction.user_ids.length === 1
              ? '1 person reacted'
              : `${reaction.user_ids.length} people reacted`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// MessageReactions Component
// ---------------------------------------------------------------------------

export interface MessageReactionsProps {
  threadId: string;
  messageIndex: number;
  /** Optionally pass pre-fetched reactions (from thread-level query) */
  initialReactions?: ReactionGroup[];
}

export function MessageReactions({
  threadId,
  messageIndex,
  initialReactions,
}: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: fetchedReactions } = useMessageReactions(threadId, messageIndex);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();

  const reactions = fetchedReactions ?? initialReactions ?? [];

  function handleToggle(emoji: string, remove: boolean) {
    if (remove) {
      removeReaction.mutate({ threadId, messageIndex, emoji });
    } else {
      addReaction.mutate({ threadId, messageIndex, emoji });
    }
  }

  function handleAddFromPicker(emoji: string) {
    // Check if already reacted
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing?.includes_me) {
      // Already reacted, remove
      removeReaction.mutate({ threadId, messageIndex, emoji });
    } else {
      addReaction.mutate({ threadId, messageIndex, emoji });
    }
  }

  return (
    <div className="flex items-center flex-wrap gap-1 mt-1">
      {reactions.map((reaction) => (
        <ReactionPill
          key={reaction.emoji}
          reaction={reaction}
          onToggle={handleToggle}
        />
      ))}
      <EmojiPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleAddFromPicker}
      />
    </div>
  );
}

export default MessageReactions;
