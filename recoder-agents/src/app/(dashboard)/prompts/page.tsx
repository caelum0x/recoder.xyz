'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Pin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { SavedPrompt } from '@/lib/api/saved-prompts';
import {
  useSavedPrompts,
  useCreatePrompt,
  useUpdatePrompt,
  useDeletePrompt,
} from '@/hooks/platform/use-saved-prompts';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'coding', label: 'Coding' },
  { value: 'research', label: 'Research' },
  { value: 'writing', label: 'Writing' },
  { value: 'analysis', label: 'Analysis' },
];

interface PromptFormState {
  title: string;
  content: string;
  category: string;
  tags: string;
}

const INITIAL_FORM: PromptFormState = {
  title: '',
  content: '',
  category: 'general',
  tags: '',
};

export default function PromptsPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null);
  const [form, setForm] = useState<PromptFormState>(INITIAL_FORM);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const categoryFilter =
    selectedCategory === 'all' ? undefined : selectedCategory;
  const searchFilter = debouncedSearch || undefined;

  const { data: prompts = [], isLoading } = useSavedPrompts(
    categoryFilter,
    searchFilter,
  );
  const createMutation = useCreatePrompt();
  const updateMutation = useUpdatePrompt();
  const deleteMutation = useDeletePrompt();

  const openCreateDialog = useCallback(() => {
    setEditingPrompt(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((prompt: SavedPrompt) => {
    setEditingPrompt(prompt);
    setForm({
      title: prompt.title,
      content: prompt.content,
      category: prompt.category,
      tags: prompt.tags.join(', '),
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingPrompt) {
        await updateMutation.mutateAsync({
          id: editingPrompt.id,
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          tags,
        });
        toast.success('Prompt updated');
      } else {
        await createMutation.mutateAsync({
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          tags,
        });
        toast.success('Prompt created');
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save prompt');
    }
  }, [form, editingPrompt, createMutation, updateMutation]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync(id);
        toast.success('Prompt deleted');
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete prompt');
      }
    },
    [deleteMutation],
  );

  const handleTogglePin = useCallback(
    async (prompt: SavedPrompt) => {
      try {
        await updateMutation.mutateAsync({
          id: prompt.id,
          is_pinned: !prompt.is_pinned,
        });
        toast.success(prompt.is_pinned ? 'Unpinned' : 'Pinned');
      } catch (err: any) {
        toast.error(err.message || 'Failed to update pin');
      }
    },
    [updateMutation],
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  }, []);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="container mx-auto max-w-5xl px-3 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold">
              Saved Prompts
            </h1>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Prompt
          </Button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                selectedCategory === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-4 w-2/3 bg-muted rounded" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-muted rounded" />
                    <div className="h-3 w-4/5 bg-muted rounded" />
                    <div className="h-3 w-3/5 bg-muted rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : prompts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">
              No saved prompts yet. Save frequently used prompts for quick
              access.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={openCreateDialog}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create your first prompt
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {prompts.map((prompt) => (
              <Card
                key={prompt.id}
                className="group cursor-pointer hover:border-primary/30 transition-colors relative"
                onClick={() => handleCopy(prompt.content)}
              >
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-tight line-clamp-1 flex-1">
                    {prompt.title}
                  </CardTitle>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(prompt);
                      }}
                      className={cn(
                        'p-1 rounded-md transition-colors',
                        prompt.is_pinned
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100',
                      )}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(prompt.content);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-2" />
                          Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(prompt);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(prompt.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {prompt.content}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {prompt.category}
                      </Badge>
                      {prompt.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          <Hash className="h-2.5 w-2.5 mr-0.5" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60">
                      {prompt.usage_count > 0
                        ? `Used ${prompt.usage_count}x`
                        : ''}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPrompt ? 'Edit Prompt' : 'New Prompt'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g. Code Review Template"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                placeholder="Write your prompt template..."
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                rows={6}
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Tags{' '}
                  <span className="text-muted-foreground font-normal">
                    (comma-separated)
                  </span>
                </label>
                <Input
                  placeholder="e.g. react, typescript"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? 'Saving...'
                : editingPrompt
                  ? 'Update'
                  : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
