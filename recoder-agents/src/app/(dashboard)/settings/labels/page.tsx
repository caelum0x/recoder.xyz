'use client';

import React, { useState } from 'react';
import { Tag, Plus, Pencil, Trash2, List, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { format, parseISO } from 'date-fns';
import {
  useLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  useLabelThreads,
  useBulkAssignLabel,
} from '@/hooks/threads/use-thread-labels';
import { type LabelDefinition } from '@/lib/api/thread-labels';

// ---------------------------------------------------------------------------
// Create / Edit Label Dialog
// ---------------------------------------------------------------------------

interface LabelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: LabelDefinition;
}

function LabelFormDialog({ open, onOpenChange, existing }: LabelFormDialogProps) {
  const [form, setForm] = useState({
    label_name: existing?.label_name ?? '',
    color: existing?.color ?? '#6366f1',
    description: existing?.description ?? '',
    icon: existing?.icon ?? 'tag',
  });

  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const isPending = createLabel.isPending || updateLabel.isPending;

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (existing) {
        await updateLabel.mutateAsync({
          id: existing.id,
          data: {
            label_name: form.label_name,
            color: form.color,
            description: form.description || undefined,
            icon: form.icon,
          },
        });
        toast.success('Label updated');
      } else {
        await createLabel.mutateAsync({
          label_name: form.label_name,
          color: form.color,
          description: form.description || undefined,
          icon: form.icon,
        });
        toast.success('Label created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to save label');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Label' : 'Create Label'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="label_name">Name *</Label>
            <Input
              id="label_name"
              value={form.label_name}
              onChange={(e) => field('label_name', e.target.value)}
              placeholder="e.g. Urgent"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="color"
                type="color"
                value={form.color}
                onChange={(e) => field('color', e.target.value)}
                className="h-9 w-16 cursor-pointer rounded-md border border-input bg-background p-1"
              />
              <span className="text-sm font-mono text-muted-foreground">{form.color}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => field('description', e.target.value)}
              placeholder="What does this label represent?"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="icon">Icon</Label>
            <Input
              id="icon"
              value={form.icon}
              onChange={(e) => field('icon', e.target.value)}
              placeholder="tag"
            />
            <p className="text-xs text-muted-foreground">Icon name (e.g. tag, star, flag)</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : existing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View Threads Sheet
// ---------------------------------------------------------------------------

interface ViewThreadsSheetProps {
  label: LabelDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ViewThreadsSheet({ label, open, onOpenChange }: ViewThreadsSheetProps) {
  const { data: threads, isLoading } = useLabelThreads(label.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
            Threads — {label.label_name}
          </SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : !threads?.length ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No threads assigned to this label yet.
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map((t) => (
              <div key={t.thread_id} className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs font-mono text-foreground">{t.thread_id}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Assigned {format(parseISO(t.assigned_at), 'MMM d, yyyy HH:mm')}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bulk Assign Section
// ---------------------------------------------------------------------------

interface BulkAssignSectionProps {
  labels: LabelDefinition[];
}

function BulkAssignSection({ labels }: BulkAssignSectionProps) {
  const [selectedLabelId, setSelectedLabelId] = useState('');
  const [threadIdsText, setThreadIdsText] = useState('');
  const bulkAssign = useBulkAssignLabel();

  async function handleBulkAssign() {
    const thread_ids = threadIdsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!selectedLabelId) {
      toast.error('Select a label');
      return;
    }
    if (!thread_ids.length) {
      toast.error('Enter at least one thread ID');
      return;
    }

    try {
      const result = await bulkAssign.mutateAsync({ label_id: selectedLabelId, thread_ids });
      toast.success(`Assigned to ${result.assigned_count} thread(s)`);
      setThreadIdsText('');
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to bulk assign');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Bulk Assign Label</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk_label">Label</Label>
          <Select value={selectedLabelId} onValueChange={setSelectedLabelId}>
            <SelectTrigger id="bulk_label">
              <SelectValue placeholder="Select label..." />
            </SelectTrigger>
            <SelectContent>
              {labels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.label_name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk_threads">Thread IDs (one per line)</Label>
          <Textarea
            id="bulk_threads"
            value={threadIdsText}
            onChange={(e) => setThreadIdsText(e.target.value)}
            placeholder={'thread-abc123\nthread-def456'}
            rows={4}
          />
        </div>
      </div>
      <Button onClick={handleBulkAssign} disabled={bulkAssign.isPending} className="gap-2">
        <Layers className="h-4 w-4" />
        {bulkAssign.isPending ? 'Assigning...' : 'Assign to All'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ThreadLabelsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editLabel, setEditLabel] = useState<LabelDefinition | null>(null);
  const [viewLabel, setViewLabel] = useState<LabelDefinition | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: labels, isLoading } = useLabels();
  const deleteLabel = useDeleteLabel();

  async function handleDelete(id: string) {
    try {
      await deleteLabel.mutateAsync(id);
      toast.success('Label deleted');
      setDeleteId(null);
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to delete label');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Thread Labels</h1>
            <p className="text-sm text-muted-foreground">Organize threads with colored labels</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Label
        </Button>
      </div>

      {/* Label List */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : !labels?.length ? (
          <div className="py-16 text-center">
            <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No labels yet. Create one to start organizing threads.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Label</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-muted-foreground">Threads</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <tr key={label.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="font-medium">{label.label_name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                    {label.description ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant="secondary" className="tabular-nums text-xs">
                      {label.thread_count ?? 0}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="View Threads"
                        onClick={() => setViewLabel(label)}
                      >
                        <List className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => setEditLabel(label)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => setDeleteId(label.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Assign */}
      {labels && labels.length > 0 && <BulkAssignSection labels={labels} />}

      {/* Dialogs / Sheets */}
      <LabelFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {editLabel && (
        <LabelFormDialog
          open
          onOpenChange={(o) => { if (!o) setEditLabel(null); }}
          existing={editLabel}
        />
      )}

      {viewLabel && (
        <ViewThreadsSheet
          label={viewLabel}
          open
          onOpenChange={(o) => { if (!o) setViewLabel(null); }}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Label?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the label and remove it from all threads. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
