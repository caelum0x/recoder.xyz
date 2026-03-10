'use client';

import { useState, useCallback } from 'react';
import { X, Download, Star } from 'lucide-react';

import { usePublishAgent } from '@/hooks/marketplace/use-marketplace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'development', label: 'Development' },
  { value: 'research', label: 'Research' },
  { value: 'writing', label: 'Writing' },
  { value: 'data', label: 'Data' },
  { value: 'support', label: 'Support' },
  { value: 'automation', label: 'Automation' },
  { value: 'creative', label: 'Creative' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-500',
  development: 'bg-blue-500',
  research: 'bg-purple-500',
  writing: 'bg-green-500',
  data: 'bg-orange-500',
  support: 'bg-cyan-500',
  automation: 'bg-yellow-500',
  creative: 'bg-pink-500',
};

interface PublishAgentDialogProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
}

export function PublishAgentDialog({
  agentId,
  agentName,
  open,
  onClose,
}: PublishAgentDialogProps) {
  const publishMutation = usePublishAgent();

  const [title, setTitle] = useState(agentName);
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = tagInput.trim().toLowerCase();
        if (tag && !tags.includes(tag) && tags.length < 10) {
          setTags((prev) => [...prev, tag]);
          setTagInput('');
        }
      }
    },
    [tagInput, tags],
  );

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title.');
      return;
    }
    if (!shortDescription.trim()) {
      toast.error('Please enter a short description.');
      return;
    }

    try {
      await publishMutation.mutateAsync({
        agent_id: agentId,
        title: title.trim(),
        short_description: shortDescription.trim(),
        description: description.trim(),
        category,
        tags,
      });
      toast.success('Agent published to marketplace!');
      onClose();
    } catch {
      toast.error('Failed to publish agent.');
    }
  };

  const firstLetter = title.trim().charAt(0).toUpperCase() || 'A';
  const bgColor = CATEGORY_COLORS[category] || 'bg-gray-500';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish to Marketplace</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Agent title"
              maxLength={200}
            />
          </div>

          {/* Short Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Short Description
              <span className="ml-1 text-muted-foreground/60">
                ({shortDescription.length}/100)
              </span>
            </label>
            <Input
              value={shortDescription}
              onChange={(e) =>
                setShortDescription(e.target.value.slice(0, 100))
              }
              placeholder="Brief description shown on listing cards"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of what your agent does..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Tags (press Enter to add)
            </label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Type a tag and press Enter"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Preview Card */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Preview
            </label>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0',
                    bgColor,
                  )}
                >
                  {firstLetter}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground truncate">
                    {title || 'Untitled Agent'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {shortDescription || 'Short description will appear here'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white',
                    bgColor,
                  )}
                >
                  {category}
                </span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" />0
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    --
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
