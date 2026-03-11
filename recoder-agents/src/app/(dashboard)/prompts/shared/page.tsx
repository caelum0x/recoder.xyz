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
  Clock,
  History,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useSharedPrompts,
  useCreateSharedPrompt,
  useUpdateSharedPrompt,
  useDeleteSharedPrompt,
  useSharedPrompt,
  usePromptVersions,
  type SharedPrompt,
  type PromptVersionsResponse,
} from '@/hooks/prompts/use-shared-prompts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 'all', label: 'All' },
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
  analysis: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30',
  creative: 'bg-pink-500/15 text-pink-600 border-pink-500/30',
  custom: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
};

// ---------------------------------------------------------------------------
// Create/Edit Dialog
// ---------------------------------------------------------------------------

function PromptDialog({
  open,
  onOpenChange,
  editPrompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPrompt?: SharedPrompt | null;
}) {
  const createMutation = useCreateSharedPrompt();
  const updateMutation = useUpdateSharedPrompt();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [isPublic, setIsPublic] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [changeNote, setChangeNote] = useState('');

  React.useEffect(() => {
    if (open) {
      setTitle(editPrompt?.title || '');
      setContent(editPrompt?.content || '');
      setCategory(editPrompt?.category || 'general');
      setIsPublic(editPrompt?.is_public || false);
      setTags(editPrompt?.tags || []);
      setTagsInput('');
      setChangeNote('');
    }
  }, [open, editPrompt]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    const payload = {
      title: title.trim(),
      content: content.trim(),
      category: category as SharedPrompt['category'],
      tags: tags.length > 0 ? tags : undefined,
      is_public: isPublic,
    };

    try {
      if (editPrompt) {
        await updateMutation.mutateAsync({
          promptId: editPrompt.id,
          data: {
            ...payload,
            change_note: changeNote.trim() || undefined,
          },
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
            {editPrompt ? 'Edit Prompt' : 'New Prompt'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Code Review System Prompt"
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your prompt content..."
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="general">General</SelectItem>
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
                    {t} <X className="h-2.5 w-2.5" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {editPrompt && (
            <div className="space-y-2">
              <Label>Change Note (optional)</Label>
              <Input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="What changed in this version?"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : editPrompt ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Version History Panel
// ---------------------------------------------------------------------------

function VersionTimeline({ promptId }: { promptId: string }) {
  const { data, isLoading } = usePromptVersions(promptId);
  const versions = data?.versions || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No version history available</p>
    );
  }

  return (
    <div className="space-y-1">
      {versions.map((v) => (
        <div key={v.id} className="flex items-start gap-3 py-2 border-l-2 border-border pl-3 relative">
          <div className="absolute -left-[5px] top-3 h-2 w-2 rounded-full bg-primary" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                v{v.version}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {new Date(v.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {v.change_note && (
              <p className="text-xs text-muted-foreground mt-0.5">{v.change_note}</p>
            )}
            <p className="text-xs font-mono text-muted-foreground mt-1 line-clamp-2">
              {v.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded Prompt Detail
// ---------------------------------------------------------------------------

function PromptDetail({
  prompt,
  onClose,
  onEdit,
  onDelete,
}: {
  prompt: SharedPrompt;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const useMutation = useSharedPrompt();
  const [showVersions, setShowVersions] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleUse = async () => {
    try {
      await useMutation.mutateAsync(prompt.id);
      await navigator.clipboard.writeText(prompt.content);
      toast.success('Prompt copied and usage recorded');
    } catch {
      // Still try to copy
      await navigator.clipboard.writeText(prompt.content).catch(() => {});
      toast.error('Failed to record usage');
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{prompt.title}</CardTitle>
              <Badge
                variant="outline"
                className={cn('text-xs', CATEGORY_COLORS[prompt.category])}
              >
                {prompt.category}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                v{prompt.version}
              </Badge>
              {prompt.is_public ? (
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {prompt.use_count} uses
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(prompt.updated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tags */}
        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prompt.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs py-0">
                <Tag className="h-2.5 w-2.5 mr-0.5" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Full content */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground">
            {prompt.content}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleUse} disabled={useMutation.isPending}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Use Prompt
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy to Clipboard
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        </div>

        {/* Version history toggle */}
        <div>
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowVersions(!showVersions)}
          >
            <History className="h-3.5 w-3.5" />
            Version History
            {showVersions ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {showVersions && (
            <div className="mt-3 pl-1">
              <VersionTimeline promptId={prompt.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Prompt Card (list item)
// ---------------------------------------------------------------------------

function PromptCard({
  prompt,
  isSelected,
  onClick,
}: {
  prompt: SharedPrompt;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/30',
        isSelected && 'border-primary/50 ring-1 ring-primary/20',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium">{prompt.title}</h3>
              <Badge
                variant="outline"
                className={cn('text-xs', CATEGORY_COLORS[prompt.category])}
              >
                {prompt.category}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                v{prompt.version}
              </Badge>
              {prompt.is_public ? (
                <Globe className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
            </div>

            <p className="text-xs text-muted-foreground font-mono mt-1.5 line-clamp-3">
              {prompt.content}
            </p>

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {prompt.use_count} uses
              </span>
              {prompt.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs py-0">
                  <Tag className="h-2.5 w-2.5 mr-0.5" />
                  {tag}
                </Badge>
              ))}
              {prompt.tags.length > 3 && (
                <span className="text-[10px]">+{prompt.tags.length - 3} more</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SharedPromptsPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState<SharedPrompt | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SharedPrompt | null>(null);

  const filters = useMemo(
    () => ({
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      search: searchQuery || undefined,
    }),
    [selectedCategory, searchQuery],
  );

  const { data: promptsData, isLoading } = useSharedPrompts(filters);
  const deleteMutation = useDeleteSharedPrompt();

  const prompts = promptsData?.prompts || [];

  const handleDelete = async (prompt: SharedPrompt) => {
    try {
      await deleteMutation.mutateAsync(prompt.id);
      if (selectedPrompt?.id === prompt.id) {
        setSelectedPrompt(null);
      }
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
            Shared Prompts Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Versioned, reusable prompts for your agents
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditPrompt(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Prompt
        </Button>
      </div>

      {/* Search + Category Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pb-4">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts..."
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

      {/* Main Content */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-4 pb-8 pr-1">
          {/* Expanded prompt detail */}
          {selectedPrompt && (
            <PromptDetail
              prompt={selectedPrompt}
              onClose={() => setSelectedPrompt(null)}
              onEdit={() => {
                setEditPrompt(selectedPrompt);
                setDialogOpen(true);
              }}
              onDelete={() => handleDelete(selectedPrompt)}
            />
          )}

          {/* Prompt list */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : prompts.length === 0 ? (
            <Card className="p-8 text-center">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No prompts found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create your first shared prompt'}
              </p>
              {!searchQuery && (
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() => {
                    setEditPrompt(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create Prompt
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {prompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isSelected={selectedPrompt?.id === prompt.id}
                  onClick={() =>
                    setSelectedPrompt(
                      selectedPrompt?.id === prompt.id ? null : prompt,
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Dialog */}
      <PromptDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editPrompt={editPrompt}
      />
    </div>
  );
}
