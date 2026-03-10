'use client';

import React, { useMemo } from 'react';
import { BookOpen, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useSavedPrompts, useMarkPromptUsed } from '@/hooks/platform/use-saved-prompts';
import { cn } from '@/lib/utils';

interface SavedPromptsPopoverProps {
  onInsert: (content: string) => void;
  disabled?: boolean;
}

export function SavedPromptsPopover({
  onInsert,
  disabled,
}: SavedPromptsPopoverProps) {
  const { data: prompts = [] } = useSavedPrompts();
  const markUsed = useMarkPromptUsed();
  const [open, setOpen] = React.useState(false);

  // Show pinned prompts first, limit to 5
  const pinnedPrompts = useMemo(() => {
    const pinned = prompts.filter((p) => p.is_pinned);
    if (pinned.length > 0) return pinned.slice(0, 5);
    // Fall back to most recently updated if no pinned
    return prompts.slice(0, 5);
  }, [prompts]);

  if (prompts.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              <BookOpen className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Saved Prompts
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        side="top"
        className="w-72 p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-0.5">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {pinnedPrompts.some((p) => p.is_pinned)
              ? 'Pinned Prompts'
              : 'Recent Prompts'}
          </div>
          {pinnedPrompts.map((prompt) => (
            <button
              key={prompt.id}
              className={cn(
                'w-full text-left px-2 py-2 rounded-md text-sm',
                'hover:bg-muted/80 transition-colors',
                'flex items-start gap-2 group',
              )}
              onClick={() => {
                onInsert(prompt.content);
                markUsed.mutate(prompt.id);
                setOpen(false);
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {prompt.is_pinned && (
                    <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  )}
                  <span className="font-medium truncate text-xs">
                    {prompt.title}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {prompt.content}
                </p>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
