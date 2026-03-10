'use client';

import React, { useState } from 'react';
import { Pin, PinOff, ChevronDown, ChevronUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePinnedMessages, useUnpinMessage } from '@/hooks/threads/use-pinned-messages';
import type { PinnedMessage } from '@/lib/api/pinned-messages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIN_COLOR_MAP: Record<string, { dot: string; label: string }> = {
  default: { dot: 'bg-blue-500', label: 'Default' },
  important: { dot: 'bg-red-500', label: 'Important' },
  reference: { dot: 'bg-green-500', label: 'Reference' },
  todo: { dot: 'bg-amber-500', label: 'Todo' },
};

// ---------------------------------------------------------------------------
// PinnedMessagesBar
// ---------------------------------------------------------------------------

interface PinnedMessagesBarProps {
  threadId: string;
  onJumpToMessage?: (messageIndex: number) => void;
}

export function PinnedMessagesBar({ threadId, onJumpToMessage }: PinnedMessagesBarProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: pins, isLoading } = usePinnedMessages(threadId);
  const unpinMutation = useUnpinMessage();

  if (isLoading || !pins || pins.length === 0) {
    return null;
  }

  const handleUnpin = (pin: PinnedMessage) => {
    unpinMutation.mutate({ threadId, pinId: pin.id });
  };

  const handleJump = (messageIndex: number) => {
    onJumpToMessage?.(messageIndex);
  };

  return (
    <div className="border-b border-border bg-muted/30">
      {/* Collapsed bar */}
      <button
        type="button"
        className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Pin className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {pins.length} pinned message{pins.length !== 1 ? 's' : ''}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
        )}
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
          {pins.map((pin) => {
            const colorInfo = PIN_COLOR_MAP[pin.pin_color] || PIN_COLOR_MAP.default;
            return (
              <div
                key={pin.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${colorInfo.dot}`}
                  title={colorInfo.label}
                />
                <div className="flex-1 min-w-0">
                  {pin.message_preview && (
                    <p className="text-foreground truncate">{pin.message_preview}</p>
                  )}
                  {pin.pin_note && (
                    <p className="text-muted-foreground text-xs mt-0.5 truncate">
                      {pin.pin_note}
                    </p>
                  )}
                  {!pin.message_preview && !pin.pin_note && (
                    <p className="text-muted-foreground italic">Message #{pin.message_index}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleJump(pin.message_index)}
                    title="Jump to message"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnpin(pin)}
                    disabled={unpinMutation.isPending}
                    title="Unpin"
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
