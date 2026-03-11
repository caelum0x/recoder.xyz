'use client';

import { useState, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, X, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useTagAgents,
} from '@/hooks/agents/use-agent-tags';
import type { AgentTag } from '@/lib/api/agent-tags';

// ---------------------------------------------------------------------------
// Color presets
// ---------------------------------------------------------------------------

const COLOR_PRESETS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#6b7280', // gray
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentTagsPage() {
  const { data: tags = [], isLoading } = useTags();
  const createMutation = useCreateTag();
  const updateMutation = useUpdateTag();
  const deleteMutation = useDeleteTag();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editingTag, setEditingTag] = useState<AgentTag | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(COLOR_PRESETS[0]);
  const [formDescription, setFormDescription] = useState('');

  const resetForm = useCallback(() => {
    setFormName('');
    setFormColor(COLOR_PRESETS[0]);
    setFormDescription('');
  }, []);

  const openNewDialog = useCallback(() => {
    resetForm();
    setEditingTag(null);
    setShowNewDialog(true);
  }, [resetForm]);

  const openEditDialog = useCallback((tag: AgentTag) => {
    setFormName(tag.name);
    setFormColor(tag.color);
    setFormDescription(tag.description || '');
    setEditingTag(tag);
    setShowNewDialog(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!formName.trim()) return;

    if (editingTag) {
      updateMutation.mutate(
        {
          tagId: editingTag.id,
          data: {
            name: formName.trim(),
            color: formColor,
            description: formDescription.trim() || undefined,
          },
        },
        {
          onSuccess: () => {
            setShowNewDialog(false);
            resetForm();
            setEditingTag(null);
          },
        }
      );
    } else {
      createMutation.mutate(
        {
          name: formName.trim(),
          color: formColor,
          description: formDescription.trim() || undefined,
        },
        {
          onSuccess: () => {
            setShowNewDialog(false);
            resetForm();
          },
        }
      );
    }
  }, [
    formName,
    formColor,
    formDescription,
    editingTag,
    createMutation,
    updateMutation,
    resetForm,
  ]);

  const handleDelete = useCallback(
    (tagId: string) => {
      deleteMutation.mutate(tagId);
      if (selectedTagId === tagId) setSelectedTagId(null);
    },
    [deleteMutation, selectedTagId]
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6" />
            Agent Tags
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize your agents with tags and labels
          </p>
        </div>
        <Button onClick={openNewDialog} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Tag
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tag list */}
        <div className="lg:col-span-7">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted/50 animate-pulse"
                />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <div className="border rounded-lg bg-card p-12 text-center">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium mb-1">No Tags Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first tag to organize agents
              </p>
              <Button onClick={openNewDialog} variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create Tag
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className={cn(
                    'border rounded-lg bg-card px-4 py-3 flex items-center justify-between hover:border-border/80 transition-colors cursor-pointer',
                    selectedTagId === tag.id && 'border-primary/40 bg-primary/5'
                  )}
                  onClick={() =>
                    setSelectedTagId(selectedTagId === tag.id ? null : tag.id)
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="h-4 w-4 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {tag.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 px-1.5 shrink-0"
                        >
                          <Users className="h-2.5 w-2.5 mr-0.5" />
                          {tag.agent_count ?? 0}
                        </Badge>
                      </div>
                      {tag.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {tag.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(tag);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(tag.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tag detail panel */}
        <div className="lg:col-span-5">
          {selectedTagId ? (
            <TagDetail tagId={selectedTagId} />
          ) : (
            <div className="border rounded-lg bg-card p-8 text-center">
              <Tag className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">
                Select a tag to view assigned agents
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New / Edit tag dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTag ? 'Edit Tag' : 'Create New Tag'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Production, Development, Testing"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Color</label>
              <div className="flex items-center gap-2">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      formColor === color
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Description{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What is this tag for?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewDialog(false);
                setEditingTag(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formName.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {editingTag ? 'Save Changes' : 'Create Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag detail panel
// ---------------------------------------------------------------------------

function TagDetail({ tagId }: { tagId: string }) {
  const { data: agents = [], isLoading } = useTagAgents(tagId);
  const { data: tags = [] } = useTags();

  const tag = tags.find((t) => t.id === tagId);

  return (
    <div className="border rounded-lg bg-card">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {tag && (
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <h3 className="text-sm font-medium">{tag?.name || 'Tag'}</h3>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {agents.length} agents
          </Badge>
        </div>
        {tag?.description && (
          <p className="text-xs text-muted-foreground mt-1">{tag.description}</p>
        )}
      </div>
      <div className="p-2 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-8 rounded bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No agents with this tag
            </p>
          </div>
        ) : (
          agents.map((assignment) => (
            <div
              key={assignment.agent_id}
              className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-mono text-foreground truncate">
                {assignment.agent_id}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                {new Date(assignment.assigned_at).toLocaleDateString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
