'use client';

import React, { useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { usePinMessage, useUnpinMessage, usePinnedMessages } from '@/hooks/threads/use-pinned-messages';
import type { PinnedMessage } from '@/lib/api/pinned-messages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIN_COLORS = [
  { value: 'default', label: 'Default', dot: 'bg-blue-500' },
  { value: 'important', label: 'Important', dot: 'bg-red-500' },
  { value: 'reference', label: 'Reference', dot: 'bg-green-500' },
  { value: 'todo', label: 'Todo', dot: 'bg-amber-500' },
] as const;

// ---------------------------------------------------------------------------
// PinMessageButton
// ---------------------------------------------------------------------------

interface PinMessageButtonProps {
  threadId: string;
  messageIndex: number;
  messagePreview?: string;
  className?: string;
}

export function PinMessageButton({
  threadId,
  messageIndex,
  messagePreview,
  className,
}: PinMessageButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [selectedColor, setSelectedColor] = useState('default');

  const { data: pins } = usePinnedMessages(threadId);
  const pinMutation = usePinMessage();
  const unpinMutation = useUnpinMessage();

  const existingPin: PinnedMessage | undefined = pins?.find(
    (p) => p.message_index === messageIndex,
  );
  const isPinned = !!existingPin;

  const handlePin = () => {
    const preview = messagePreview
      ? messagePreview.length > 200
        ? messagePreview.slice(0, 200) + '...'
        : messagePreview
      : undefined;

    pinMutation.mutate(
      {
        threadId,
        data: {
          message_index: messageIndex,
          message_preview: preview,
          pin_note: note || undefined,
          pin_color: selectedColor,
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          setNote('');
          setSelectedColor('default');
        },
      },
    );
  };

  const handleUnpin = () => {
    if (existingPin) {
      unpinMutation.mutate(
        { threadId, pinId: existingPin.id },
        {
          onSuccess: () => setOpen(false),
        },
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${isPinned ? 'text-blue-500' : 'text-muted-foreground opacity-0 group-hover:opacity-100'} transition-opacity ${className ?? ''}`}
          title={isPinned ? 'Pinned - click to manage' : 'Pin message'}
        >
          {isPinned ? (
            <Pin className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {isPinned ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Message is pinned</p>
            {existingPin.pin_note && (
              <p className="text-xs text-muted-foreground">{existingPin.pin_note}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-destructive hover:text-destructive"
              onClick={handleUnpin}
              disabled={unpinMutation.isPending}
            >
              <PinOff className="h-3.5 w-3.5" />
              Unpin
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">Pin message</p>
            <Input
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-sm"
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Color</p>
              <div className="flex gap-2">
                {PIN_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selectedColor === color.value
                        ? 'border-foreground'
                        : 'border-transparent hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setSelectedColor(color.value)}
                    title={color.label}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full ${color.dot}`} />
                  </button>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-2"
              onClick={handlePin}
              disabled={pinMutation.isPending}
            >
              <Pin className="h-3.5 w-3.5" />
              Pin
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
