'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Copy,
  Trash2,
  Pencil,
  Tag,
  TrendingUp,
  Globe,
  Lock,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePromptSnippets,
  useCreateSnippet,
  useUpdateSnippet,
  useDeleteSnippet,
  usePopularSnippets,
  type PromptSnippet,
} from '@/hooks/prompts/use-shared-prompts';
import type { PromptCategory } from '@/lib/api/shared-prompts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'system', label: 'System' },
  { id: 'coding', label: 'Coding' },
  { id: 'writing', label: 'Writing' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'creative', label: 'Creative' },
  { id: 'custom', label: 'Custom' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  system: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  coding: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  writing: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  analysis: 'bg-pink-500/15 text-pink-600 border-pink-500/30',
  creative: 'bg-red-500/15 text-red-600 border-red-500/30',
  custom: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
};

// ---------------------------------------------------------------------------
// Create/Edit Dialog
// ---------------------------------------------------------------------------

function SnippetDialog({
  open,
  onOpenChange,
  editSnippet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSnippet?: PromptSnippet | null;
}) {
  const createMutation = useCreateSnippet();
  const updateMutation = useUpdateSnippet();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PromptCategory>('general');
  const [isPublic, setIsPublic] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setTitle(editSnippet?.title || '');
      setContent(editSnippet?.content || '');
      setCategory(editSnippet?.category || 'general');
      setIsPublic(editSnippet?.is_public || false);
      setTags(editSnippet?.tags || []);
      setTagsInput('');
    }
  }, [open, editSnippet]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    const payload = {
      title: title.trim(),
      content: content.trim(),
      category,
      tags: tags.length > 0 ? tags : undefined,
      is_public: isPublic,
    };

    try {
      if (editSnippet) {
        await updateMutation.mutateAsync({
          snippetId: editSnippet.id,
          data: payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // Error handled in hook
    }
  };

  const addTag = () => {
    const trimmed = tagsInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagsInput('');
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editSnippet ? 'Edit Snippet' : 'Create Snippet'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. JSON Response Format"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your prompt snippet content..."
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PromptCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                <span className="text-sm text-muted-foreground">
                  {isPublic ? 'Public' : 'Private'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((t, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="gap-1 cursor-pointer"
                    onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                  >
                    {t} &times;
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : editSnippet ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Snippet Card
// ---------------------------------------------------------------------------

function SnippetCard({
  snippet,
  onEdit,
  onDelete,
}: {
  snippet: PromptSnippet;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <SpotlightCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium">{snippet.title}</h3>
            <Badge
              variant="outline"
              className={cn('text-xs', CATEGORY_COLORS[snippet.category])}
            >
              {snippet.category}
            </Badge>
            {snippet.is_public ? (
              <Globe className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Lock className="h-3 w-3 text-muted-foreground" />
            )}
          </div>

          <button
            className="w-full text-left mt-1"
            onClick={() => setExpanded(!expanded)}
          >
            <p
              className={cn(
                'text-xs text-muted-foreground font-mono',
                !expanded && 'line-clamp-2'
              )}
            >
              {snippet.content}
            </p>
          </button>

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {snippet.use_count} uses
            </span>
            {snippet.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs py-0">
                <Tag className="h-2.5 w-2.5 mr-0.5" />
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PromptLibraryPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSnippet, setEditSnippet] = useState<PromptSnippet | null>(null);

  const filters = useMemo(
    () => ({
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      search: searchQuery || undefined,
    }),
    [selectedCategory, searchQuery]
  );

  const { data: snippetsData, isLoading } = usePromptSnippets(filters);
  const { data: popularData } = usePopularSnippets(5);
  const deleteMutation = useDeleteSnippet();

  const snippets = snippetsData?.prompts || [];
  const popularSnippets = popularData?.snippets || [];

  const handleDelete = async (snippet: PromptSnippet) => {
    try {
      await deleteMutation.mutateAsync(snippet.id);
    } catch {
      // Error handled in hook
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background px-4 md:px-8 pt-16 md:pt-12">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Prompt Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable prompt snippets across your agents
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditSnippet(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Snippet
        </Button>
      </div>

      {/* Search + Category Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pb-4">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search snippets..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-6 pb-8 pr-1">
          {/* Popular Section */}
          {selectedCategory === 'all' && !searchQuery && popularSnippets.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Popular Snippets
              </h2>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {popularSnippets.map((snippet) => (
                  <SpotlightCard key={snippet.id} className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xs font-medium truncate flex-1">
                        {snippet.title}
                      </h3>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0', CATEGORY_COLORS[snippet.category])}
                      >
                        {snippet.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono line-clamp-2">
                      {snippet.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      {snippet.use_count} uses
                    </div>
                  </SpotlightCard>
                ))}
              </div>
            </div>
          )}

          {/* Main Snippet List */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : snippets.length === 0 ? (
            <SpotlightCard className="p-8 text-center">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No snippets found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create your first reusable prompt snippet'}
              </p>
              {!searchQuery && (
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => {
                    setEditSnippet(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create Snippet
                </Button>
              )}
            </SpotlightCard>
          ) : (
            <div className="space-y-2">
              {snippets.map((snippet) => (
                <SnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  onEdit={() => {
                    setEditSnippet(snippet);
                    setDialogOpen(true);
                  }}
                  onDelete={() => handleDelete(snippet)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Dialog */}
      <SnippetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editSnippet={editSnippet}
      />
    </div>
  );
}
