'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Pin,
  Pencil,
  X,
  Plus,
  ChevronDown,
  ChevronRight,
  Folder,
  Trash2,
  Check,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import {
  usePinnedThreads,
  usePinThread,
  useUnpinThread,
  useUpdatePin,
  useReorderPins,
  usePinCollections,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
} from '@/hooks/threads/use-thread-pinning';
import type { PinnedThread, PinCollection } from '@/lib/api/thread-pinning';

// ============================================================================
// Constants
// ============================================================================

const PRESET_COLORS = [
  '#6366f1', // indigo (default)
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#8b5cf6', // violet
];

// ============================================================================
// Color Picker
// ============================================================================

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
            value === c ? 'border-foreground scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Edit Pin Dialog
// ============================================================================

function EditPinDialog({
  pin,
  open,
  onOpenChange,
}: {
  pin: PinnedThread;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const updatePin = useUpdatePin();
  const [label, setLabel] = useState(pin.pin_label ?? '');
  const [note, setNote] = useState(pin.pin_note ?? '');
  const [color, setColor] = useState(pin.pin_color ?? '#6366f1');

  const handleSave = async () => {
    try {
      await updatePin.mutateAsync({
        pinId: pin.id,
        data: { pin_label: label || undefined, pin_note: note || undefined, pin_color: color },
      });
      toast.success('Pin updated');
      onOpenChange(false);
    } catch {
      toast.error('Failed to update pin');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Edit Pin</DialogTitle>
          <DialogDescription>
            Update the label, note, or color for this pinned thread.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="pin_label">Label</Label>
            <Input
              id="pin_label"
              placeholder="Short label..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin_note">Note</Label>
            <Textarea
              id="pin_note"
              placeholder="Why did you pin this?"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updatePin.isPending}>
            {updatePin.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Create Collection Dialog
// ============================================================================

function CreateCollectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const createCollection = useCreateCollection();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createCollection.mutateAsync({
        collection_name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success('Collection created');
      setName('');
      setDescription('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to create collection');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Create Collection</DialogTitle>
          <DialogDescription>Group pinned threads into a named collection.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="coll_name">Collection Name *</Label>
            <Input
              id="coll_name"
              placeholder="e.g. Research Threads"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coll_desc">Description</Label>
            <Input
              id="coll_desc"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCollection.isPending || !name.trim()}>
              {createCollection.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Draggable Pin Row
// ============================================================================

function PinRow({
  pin,
  index,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  pin: PinnedThread;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
}) {
  const unpinThread = useUnpinThread();
  const [editOpen, setEditOpen] = useState(false);

  const handleUnpin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await unpinThread.mutateAsync(pin.thread_id);
      toast.success('Thread unpinned');
    } catch {
      toast.error('Failed to unpin thread');
    }
  };

  const truncatedId =
    pin.thread_id.length > 16 ? `${pin.thread_id.slice(0, 8)}...${pin.thread_id.slice(-4)}` : pin.thread_id;

  return (
    <>
      <div
        draggable
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={() => onDrop(index)}
        className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground" />
        <div
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: pin.pin_color }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">
            {pin.pin_label || truncatedId}
          </div>
          {pin.pin_note && (
            <div className="text-[10px] text-muted-foreground truncate">{pin.pin_note}</div>
          )}
          {!pin.pin_label && (
            <div className="text-[10px] text-muted-foreground">{truncatedId}</div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Edit pin
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={handleUnpin}
                  disabled={unpinThread.isPending}
                >
                  <X className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Unpin
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <EditPinDialog pin={pin} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

// ============================================================================
// Collection Row
// ============================================================================

function CollectionRow({ collection }: { collection: PinCollection }) {
  const [expanded, setExpanded] = useState(false);
  const deleteCollection = useDeleteCollection();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete collection "${collection.collection_name}"?`)) return;
    try {
      await deleteCollection.mutateAsync(collection.id);
      toast.success('Collection deleted');
    } catch {
      toast.error('Failed to delete collection');
    }
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        className="group w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-xs font-medium truncate">{collection.collection_name}</span>
        <span className="text-[10px] text-muted-foreground mr-1">
          {collection.thread_ids.length}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-destructive"
          onClick={handleDelete}
          disabled={deleteCollection.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 space-y-1 bg-muted/20">
          {collection.description && (
            <p className="text-[10px] text-muted-foreground">{collection.description}</p>
          )}
          {collection.thread_ids.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">No threads in this collection.</p>
          ) : (
            collection.thread_ids.map((tid) => (
              <div key={tid} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Pin className="h-2.5 w-2.5" />
                <span className="font-mono truncate">{tid}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Pin This Thread Button (for integration)
// ============================================================================

export function PinThreadButton({ threadId }: { threadId: string }) {
  const { data: pins } = usePinnedThreads();
  const pinThread = usePinThread();
  const unpinThread = useUnpinThread();

  const isPinned = pins?.some((p) => p.thread_id === threadId) ?? false;

  const handleToggle = async () => {
    try {
      if (isPinned) {
        await unpinThread.mutateAsync(threadId);
        toast.success('Thread unpinned');
      } else {
        await pinThread.mutateAsync({ threadId });
        toast.success('Thread pinned');
      }
    } catch {
      toast.error(isPinned ? 'Failed to unpin' : 'Failed to pin');
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${isPinned ? 'text-primary' : 'text-muted-foreground'}`}
            onClick={handleToggle}
            disabled={pinThread.isPending || unpinThread.isPending}
          >
            <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isPinned ? 'Unpin thread' : 'Pin thread'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export function PinnedThreadsPanel() {
  const { data: pins, isLoading: pinsLoading } = usePinnedThreads();
  const { data: collections, isLoading: collectionsLoading } = usePinCollections();
  const reorderPins = useReorderPins();
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);

  // DnD state
  const dragIndex = useRef<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    dragIndex.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (dropIndex: number) => {
      if (dragIndex.current === null || dragIndex.current === dropIndex) return;
      const currentPins = pins ?? [];
      const reordered = [...currentPins];
      const [dragged] = reordered.splice(dragIndex.current, 1);
      reordered.splice(dropIndex, 0, dragged);
      dragIndex.current = null;

      try {
        await reorderPins.mutateAsync({ pin_ids: reordered.map((p) => p.id) });
      } catch {
        toast.error('Failed to reorder pins');
      }
    },
    [pins, reorderPins]
  );

  const allPins = pins ?? [];
  const allCollections = collections ?? [];

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Pinned Threads Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Pin className="h-3 w-3" />
            Pinned Threads
          </h3>
        </div>

        {pinsLoading ? (
          <div className="text-xs text-muted-foreground py-3 px-2">Loading...</div>
        ) : allPins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
            <Pin className="h-7 w-7 opacity-20" />
            <p className="text-xs">No pinned threads</p>
            <p className="text-[10px] text-center leading-tight">
              Use the pin button on any thread to save it here.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {allPins.map((pin, idx) => (
              <PinRow
                key={pin.id}
                pin={pin}
                index={idx}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>

      {/* Collections Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Folder className="h-3 w-3" />
            Collections
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setNewCollectionOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {collectionsLoading ? (
          <div className="text-xs text-muted-foreground py-2 px-2">Loading...</div>
        ) : allCollections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground gap-1.5">
            <Folder className="h-6 w-6 opacity-20" />
            <p className="text-xs">No collections</p>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] mt-1"
              onClick={() => setNewCollectionOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create Collection
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {allCollections.map((col) => (
              <CollectionRow key={col.id} collection={col} />
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground justify-start gap-1.5"
              onClick={() => setNewCollectionOpen(true)}
            >
              <Plus className="h-3 w-3" />
              Create Collection
            </Button>
          </div>
        )}
      </div>

      <CreateCollectionDialog open={newCollectionOpen} onOpenChange={setNewCollectionOpen} />
    </div>
  );
}

export default PinnedThreadsPanel;
