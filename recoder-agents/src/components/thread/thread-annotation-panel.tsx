'use client';

import React, { useState } from 'react';
import {
  StickyNote,
  Highlighter,
  HelpCircle,
  CheckSquare,
  Bug,
  Lightbulb,
  Plus,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import {
  useThreadAnnotations,
  useCreateAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
  useAnnotationSummary,
} from '@/hooks/threads/use-thread-annotations';
import type { AnnotationType, ThreadAnnotation } from '@/lib/api/thread-annotations';

interface ThreadAnnotationPanelProps {
  threadId: string;
  isOpen: boolean;
  onClose: () => void;
  focusMessageIndex?: number | null;
}

const ANNOTATION_TYPE_CONFIG: Record<
  AnnotationType,
  { label: string; icon: React.ComponentType<any>; color: string }
> = {
  note: { label: 'Note', icon: StickyNote, color: 'text-yellow-500' },
  highlight: { label: 'Highlight', icon: Highlighter, color: 'text-blue-500' },
  question: { label: 'Question', icon: HelpCircle, color: 'text-purple-500' },
  action: { label: 'Action', icon: CheckSquare, color: 'text-green-500' },
  bug: { label: 'Bug', icon: Bug, color: 'text-red-500' },
  insight: { label: 'Insight', icon: Lightbulb, color: 'text-orange-500' },
  warning: { label: 'Warning', icon: Bug, color: 'text-amber-500' },
  action_item: { label: 'Action Item', icon: CheckSquare, color: 'text-emerald-500' },
};

const COLOR_PRESETS = [
  '#fbbf24', // amber
  '#f87171', // red
  '#60a5fa', // blue
  '#34d399', // green
  '#a78bfa', // purple
  '#fb923c', // orange
];

const ALL_TYPES: AnnotationType[] = ['note', 'highlight', 'question', 'action', 'bug', 'insight'];

export function ThreadAnnotationPanel({
  threadId,
  isOpen,
  onClose,
  focusMessageIndex,
}: ThreadAnnotationPanelProps) {
  const [filterType, setFilterType] = useState<AnnotationType | 'all'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<ThreadAnnotation | null>(null);

  // Form state
  const [formType, setFormType] = useState<AnnotationType>('note');
  const [formContent, setFormContent] = useState('');
  const [formColor, setFormColor] = useState('#fbbf24');
  const [formMessageIndex, setFormMessageIndex] = useState('');

  const filters = {
    ...(filterType !== 'all' ? { annotation_type: filterType as AnnotationType } : {}),
    ...(showResolved ? {} : { resolved: false }),
  };

  const { data: annotations, isLoading } = useThreadAnnotations(threadId, filters);
  const { data: summary } = useAnnotationSummary();
  const createMutation = useCreateAnnotation(threadId);
  const updateMutation = useUpdateAnnotation(threadId);
  const deleteMutation = useDeleteAnnotation(threadId);

  const resetForm = () => {
    setFormType('note');
    setFormContent('');
    setFormColor('#fbbf24');
    setFormMessageIndex('');
    setEditingAnnotation(null);
    setIsFormOpen(false);
  };

  const openCreateForm = () => {
    resetForm();
    if (focusMessageIndex != null) {
      setFormMessageIndex(String(focusMessageIndex));
    }
    setIsFormOpen(true);
  };

  const openEditForm = (annotation: ThreadAnnotation) => {
    setEditingAnnotation(annotation);
    setFormType(annotation.annotation_type);
    setFormContent(annotation.content);
    setFormColor(annotation.color);
    setFormMessageIndex(
      annotation.message_index != null ? String(annotation.message_index) : ''
    );
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formContent.trim()) {
      toast.error('Content is required');
      return;
    }

    try {
      if (editingAnnotation) {
        await updateMutation.mutateAsync({
          annotationId: editingAnnotation.id,
          data: {
            annotation_type: formType,
            content: formContent,
            color: formColor,
            message_index: formMessageIndex ? parseInt(formMessageIndex) : undefined,
          },
        });
        toast.success('Annotation updated');
      } else {
        await createMutation.mutateAsync({
          annotation_type: formType,
          content: formContent,
          color: formColor,
          message_index: formMessageIndex ? parseInt(formMessageIndex) : undefined,
        });
        toast.success('Annotation created');
      }
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save annotation');
    }
  };

  const handleDelete = async (annotationId: string) => {
    try {
      await deleteMutation.mutateAsync(annotationId);
      toast.success('Annotation deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete annotation');
    }
  };

  const handleToggleResolved = async (annotation: ThreadAnnotation) => {
    try {
      await updateMutation.mutateAsync({
        annotationId: annotation.id,
        data: { is_resolved: !annotation.is_resolved },
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border z-50 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Annotations</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={openCreateForm}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Badges */}
      {summary && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border">
          {ALL_TYPES.map((type) => {
            const count = summary.by_type[type] || 0;
            if (count === 0) return null;
            const config = ANNOTATION_TYPE_CONFIG[type];
            const Icon = config.icon;
            return (
              <Badge
                key={type}
                variant="secondary"
                className="text-xs gap-1 cursor-pointer"
                onClick={() =>
                  setFilterType(filterType === type ? 'all' : type)
                }
              >
                <Icon className={`h-3 w-3 ${config.color}`} />
                {count}
              </Badge>
            );
          })}
          {summary.unresolved > 0 && (
            <Badge variant="outline" className="text-xs">
              {summary.unresolved} unresolved
            </Badge>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as AnnotationType | 'all')}
        >
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ALL_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {ANNOTATION_TYPE_CONFIG[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={showResolved}
            onCheckedChange={(v) => setShowResolved(!!v)}
            className="h-3.5 w-3.5"
          />
          Show resolved
        </label>
      </div>

      {/* Add/Edit Form */}
      {isFormOpen && (
        <div className="p-4 border-b border-border space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {editingAnnotation ? 'Edit Annotation' : 'New Annotation'}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={resetForm}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Select
            value={formType}
            onValueChange={(v) => setFormType(v as AnnotationType)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {ANNOTATION_TYPE_CONFIG[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            placeholder="Annotation content..."
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            className="min-h-[60px] text-sm"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Color:</span>
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                className={`h-5 w-5 rounded-full border-2 transition-all ${
                  formColor === color
                    ? 'border-foreground scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setFormColor(color)}
              />
            ))}
          </div>

          <Input
            type="number"
            placeholder="Message index (optional)"
            value={formMessageIndex}
            onChange={(e) => setFormMessageIndex(e.target.value)}
            className="h-8 text-xs"
          />

          <Button
            size="sm"
            className="w-full"
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {editingAnnotation ? 'Save Changes' : 'Add Annotation'}
          </Button>
        </div>
      )}

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : annotations && annotations.length > 0 ? (
          annotations.map((annotation) => {
            const config = ANNOTATION_TYPE_CONFIG[annotation.annotation_type];
            const Icon = config.icon;
            return (
              <Card key={annotation.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: annotation.color }}
                      />
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm leading-snug">
                        {annotation.content}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {config.label}
                        </Badge>
                        {annotation.message_index != null && (
                          <span>Msg #{annotation.message_index}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Checkbox
                        checked={annotation.is_resolved}
                        onCheckedChange={() => handleToggleResolved(annotation)}
                        className="h-3.5 w-3.5"
                        title="Resolved"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => openEditForm(annotation)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(annotation.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="text-center py-8">
            <StickyNote className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No annotations yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
