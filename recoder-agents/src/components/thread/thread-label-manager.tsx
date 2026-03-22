'use client';

import { useState, useMemo } from 'react';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  FolderTree,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useLabels,
  useThreadLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  useAssignLabel,
  useRemoveLabel,
  useLabelThreads,
} from '@/hooks/threads/use-thread-labels';
import type { LabelDefinition, CreateLabelData, UpdateLabelData } from '@/lib/api/thread-labels';

// ---------------------------------------------------------------------------
// Color presets
// ---------------------------------------------------------------------------

const COLOR_PRESETS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
] as const;

// ---------------------------------------------------------------------------
// Label pill (reusable)
// ---------------------------------------------------------------------------

export function LabelPill({
  label,
  onRemove,
  size = 'sm',
}: {
  label: LabelDefinition;
  onRemove?: () => void;
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border',
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
      )}
      style={{
        borderColor: label.color,
        backgroundColor: `${label.color}15`,
        color: label.color,
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          backgroundColor: label.color,
          width: size === 'xs' ? 6 : 8,
          height: size === 'xs' ? 6 : 8,
        }}
      />
      {label.label_name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Thread labels display (for use on thread items)
// ---------------------------------------------------------------------------

export function ThreadLabelPills({
  threadId,
  compact = false,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const { data: labels = [] } = useThreadLabels(threadId);
  const removeLabelMutation = useRemoveLabel();

  if (labels.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {labels.map((assignment) => (
        <LabelPill
          key={assignment.id}
          label={{
            id: assignment.label_id,
            user_id: assignment.user_id,
            label_name: assignment.label_name || '',
            color: assignment.color || '#6366f1',
            description: assignment.description ?? null,
            icon: assignment.icon || '',
            created_at: assignment.assigned_at,
          }}
          size={compact ? 'xs' : 'sm'}
          onRemove={() =>
            removeLabelMutation.mutate({ threadId, labelId: assignment.label_id })
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assign label dropdown (for use on thread items)
// ---------------------------------------------------------------------------

export function AssignLabelDropdown({
  threadId,
  trigger,
}: {
  threadId: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { data: allLabels = [] } = useLabels();
  const { data: threadLabels = [] } = useThreadLabels(threadId);
  const assignMutation = useAssignLabel();
  const removeMutation = useRemoveLabel();

  const assignedIds = useMemo(
    () => new Set(threadLabels.map((l) => l.label_id)),
    [threadLabels]
  );

  const handleToggle = (labelId: string) => {
    if (assignedIds.has(labelId)) {
      removeMutation.mutate({ threadId, labelId });
    } else {
      assignMutation.mutate({ threadId, labelId });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            <Tag className="h-3 w-3" />
            Label
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        {allLabels.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2 text-center">
            No labels. Create one first.
          </p>
        ) : (
          allLabels.map((label) => (
            <button
              key={label.id}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-xs text-left"
              onClick={() => handleToggle(label.id)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color }}
              />
              <span className="flex-1 truncate">{label.label_name}</span>
              {assignedIds.has(label.id) && (
                <Check className="h-3 w-3 text-primary flex-shrink-0" />
              )}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Filter by label
// ---------------------------------------------------------------------------

export function LabelFilter({
  selectedLabelId,
  onSelect,
}: {
  selectedLabelId: string | null;
  onSelect: (labelId: string | null) => void;
}) {
  const { data: labels = [] } = useLabels();

  if (labels.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={selectedLabelId ? 'default' : 'outline'}
          size="sm"
          className="h-7 gap-1.5 text-xs"
        >
          <Filter className="h-3 w-3" />
          {selectedLabelId
            ? labels.find((l) => l.id === selectedLabelId)?.label_name || 'Label'
            : 'Label'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <button
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-xs',
            !selectedLabelId && 'bg-accent'
          )}
          onClick={() => onSelect(null)}
        >
          All threads
        </button>
        {labels.map((label) => (
          <button
            key={label.id}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-xs',
              selectedLabelId === label.id && 'bg-accent'
            )}
            onClick={() => onSelect(label.id)}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: label.color }}
            />
            <span className="flex-1 truncate">{label.label_name}</span>
            {label.thread_count != null && label.thread_count > 0 && (
              <span className="text-muted-foreground">{label.thread_count}</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Full label manager (settings / management panel)
// ---------------------------------------------------------------------------

export default function ThreadLabelManager() {
  const { data: labels = [], isLoading } = useLabels();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelDefinition | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Thread Labels</h2>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowNewDialog(true)}
        >
          <Plus className="h-4 w-4" />
          New Label
        </Button>
      </div>

      {/* Label list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : labels.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Tag className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No labels yet. Create one to organize your threads.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {labels.map((label) => (
            <LabelRow
              key={label.id}
              label={label}
              onEdit={setEditingLabel}
            />
          ))}
        </div>
      )}

      {/* New / Edit dialog */}
      <LabelFormDialog
        open={showNewDialog || !!editingLabel}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewDialog(false);
            setEditingLabel(null);
          }
        }}
        editLabel={editingLabel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label row (flat, no hierarchy)
// ---------------------------------------------------------------------------

function LabelRow({
  label,
  onEdit,
}: {
  label: LabelDefinition;
  onEdit: (label: LabelDefinition) => void;
}) {
  const deleteMutation = useDeleteLabel();

  return (
    <div
      className="group flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors"
    >
      {/* Color dot */}
      <span
        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: label.color }}
      />

      {/* Name */}
      <span className="text-sm flex-1 truncate">{label.label_name}</span>

      {/* Thread count */}
      {label.thread_count != null && label.thread_count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {label.thread_count}
        </Badge>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(label)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive"
          onClick={() => {
            if (confirm(`Delete label "${label.label_name}"?`)) {
              deleteMutation.mutate(label.id);
            }
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label form dialog (create/edit)
// ---------------------------------------------------------------------------

function LabelFormDialog({
  open,
  onOpenChange,
  editLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editLabel: LabelDefinition | null;
}) {
  const createMutation = useCreateLabel();
  const updateMutation = useUpdateLabel();

  const [name, setName] = useState(editLabel?.label_name || '');
  const [color, setColor] = useState(editLabel?.color || COLOR_PRESETS[0]);

  // Sync form when editLabel changes
  const editId = editLabel?.id;
  const [prevEditId, setPrevEditId] = useState(editId);
  if (editId !== prevEditId) {
    setPrevEditId(editId);
    setName(editLabel?.label_name || '');
    setColor(editLabel?.color || COLOR_PRESETS[0]);
  }

  const handleSubmit = () => {
    if (!name.trim()) return;

    if (editLabel) {
      const data: UpdateLabelData = {};
      if (name.trim() !== editLabel.label_name) data.label_name = name.trim();
      if (color !== editLabel.color) data.color = color;
      updateMutation.mutate(
        { id: editLabel.id, data },
        {
          onSuccess: () => {
            onOpenChange(false);
            resetForm();
          },
        }
      );
    } else {
      const data: CreateLabelData = {
        label_name: name.trim(),
        color,
      };
      createMutation.mutate(data, {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
        },
      });
    }
  };

  const resetForm = () => {
    setName('');
    setColor(COLOR_PRESETS[0]);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editLabel ? 'Edit Label' : 'New Label'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Name</label>
            <Input
              placeholder="e.g. Important, Bug Fix, Research..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>

          {/* Color presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
                    color === c
                      ? 'border-foreground scale-110'
                      : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Preview
            </label>
            <div>
              {name.trim() ? (
                <LabelPill
                  label={{
                    id: '',
                    user_id: '',
                    label_name: name.trim(),
                    color,
                    description: null,
                    icon: '',
                    created_at: '',
                  }}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  Enter a name to see preview
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || !name.trim()}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editLabel ? (
              'Save'
            ) : (
              'Create Label'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
