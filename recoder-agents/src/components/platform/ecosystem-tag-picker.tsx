'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag, Plus, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useTags,
  useCreateTag,
  useLinkItem,
  useUnlinkItem,
} from '@/hooks/platform/use-ecosystem-tags';
import type { EcosystemTag } from '@/lib/api/ecosystem-tags';

// ---------------------------------------------------------------------------
// Preset colors
// ---------------------------------------------------------------------------

const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EcosystemTagPickerProps {
  /** Which Recoder app this item belongs to (e.g. "agents"). */
  sourceApp: string;
  /** The unique ID of the item in its source app. */
  externalId: string;
  /** Human-readable label for the item being tagged. */
  label: string;
  /** Type of item (e.g. "thread", "project", "agent"). */
  itemType: string;
  /** Full URL to the item. */
  itemUrl: string;
  /** Optional trigger element. Defaults to a tag icon button. */
  children?: React.ReactNode;
  /** Popover placement side. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Popover alignment. */
  align?: 'start' | 'center' | 'end';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EcosystemTagPicker({
  sourceApp,
  externalId,
  label,
  itemType,
  itemUrl,
  children,
  side = 'bottom',
  align = 'start',
}: EcosystemTagPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Tag className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[280px] p-0 overflow-hidden"
        sideOffset={8}
      >
        <TagPickerContent
          sourceApp={sourceApp}
          externalId={externalId}
          label={label}
          itemType={itemType}
          itemUrl={itemUrl}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Inner content
// ---------------------------------------------------------------------------

function TagPickerContent({
  sourceApp,
  externalId,
  label,
  itemType,
  itemUrl,
  onClose,
}: {
  sourceApp: string;
  externalId: string;
  label: string;
  itemType: string;
  itemUrl: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: tags = [], isLoading } = useTags();
  const linkMutation = useLinkItem();
  const unlinkMutation = useUnlinkItem();

  // Focus search input when popover opens
  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Determine which tags are currently linked to this item
  const linkedTagMap = useMemo(() => {
    const map = new Map<string, string>(); // tagId -> itemId
    for (const tag of tags) {
      const item = tag.items?.find(
        (i) => i.sourceApp === sourceApp && i.externalId === externalId,
      );
      if (item) {
        map.set(tag.id, item.id);
      }
    }
    return map;
  }, [tags, sourceApp, externalId]);

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const handleToggle = useCallback(
    (tag: EcosystemTag) => {
      const existingItemId = linkedTagMap.get(tag.id);
      if (existingItemId) {
        unlinkMutation.mutate({ tagId: tag.id, itemId: existingItemId });
      } else {
        linkMutation.mutate({
          tagId: tag.id,
          sourceApp,
          externalId,
          label,
          itemType,
          itemUrl,
        });
      }
    },
    [
      linkedTagMap,
      linkMutation,
      unlinkMutation,
      sourceApp,
      externalId,
      label,
      itemType,
      itemUrl,
    ],
  );

  const isBusy = linkMutation.isPending || unlinkMutation.isPending;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[13px] font-medium">Ecosystem Tags</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="h-8 text-[13px] rounded-lg"
        />
      </div>

      {/* Tag list */}
      <ScrollArea className="max-h-[200px] overflow-auto">
        <div className="px-2 pb-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTags.length === 0 ? (
            <p className="text-center text-[12px] text-muted-foreground py-4">
              {search ? 'No matching tags' : 'No tags yet'}
            </p>
          ) : (
            filteredTags.map((tag) => {
              const isLinked = linkedTagMap.has(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => handleToggle(tag)}
                  disabled={isBusy}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                    'hover:bg-muted/60 active:scale-[0.99]',
                    isBusy && 'opacity-50 pointer-events-none',
                  )}
                >
                  {/* Color dot */}
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color || '#6b7280' }}
                  />
                  {/* Name */}
                  <span className="flex-1 text-[13px] truncate">
                    {tag.name}
                  </span>
                  {/* Linked check */}
                  {isLinked && (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Separator + Create new */}
      <div className="border-t border-border/50 px-2 py-2">
        {showCreate ? (
          <CreateTagInline
            onDone={() => setShowCreate(false)}
          />
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
              'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-[13px]">Create new tag</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline create form
// ---------------------------------------------------------------------------

function CreateTagInline({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[5]); // default: blue
  const nameRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateTag();

  useEffect(() => {
    const timer = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createMutation.mutate(
      { name: trimmed, color },
      {
        onSuccess: () => {
          setName('');
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tag name"
        className="h-8 text-[13px] rounded-lg"
        disabled={createMutation.isPending}
      />

      {/* Color picker row */}
      <div className="flex items-center gap-1 flex-wrap">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              'h-5 w-5 rounded-full transition-all border-2',
              color === c
                ? 'border-foreground scale-110'
                : 'border-transparent hover:scale-105',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <Button
          type="submit"
          size="sm"
          className="flex-1 h-7 text-[12px] rounded-lg"
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            'Create'
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] rounded-lg"
          onClick={onDone}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
