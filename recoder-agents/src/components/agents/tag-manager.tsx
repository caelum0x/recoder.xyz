'use client';

import { useState } from 'react';
import { Tag, Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useAgentTags,
  useTags,
  useAssignTag,
  useRemoveTag,
  useCreateTag,
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
// TagManager component
// ---------------------------------------------------------------------------

interface TagManagerProps {
  agentId: string;
  compact?: boolean;
}

export function TagManager({ agentId, compact = false }: TagManagerProps) {
  const { data: agentTags = [], isLoading } = useAgentTags(agentId);
  const { data: allTags = [] } = useTags();
  const assignMutation = useAssignTag();
  const removeMutation = useRemoveTag();
  const createMutation = useCreateTag();

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);

  const assignedTagIds = new Set(agentTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const handleAssign = (tagId: string) => {
    assignMutation.mutate({ agentId, tagId });
  };

  const handleRemove = (tagId: string) => {
    removeMutation.mutate({ agentId, tagId });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: (tag) => {
          // Auto-assign the new tag
          assignMutation.mutate({ agentId, tagId: tag.id });
          setNewName('');
          setNewColor(COLOR_PRESETS[0]);
          setShowCreate(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-5 w-12 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Assigned tags */}
      {agentTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className={cn(
            'text-xs px-2 py-0.5 h-6 gap-1 font-normal',
            compact && 'text-[10px] h-5 px-1.5'
          )}
          style={{
            backgroundColor: `${tag.color}15`,
            borderColor: `${tag.color}40`,
            color: tag.color,
          }}
        >
          {tag.name}
          <button
            className="ml-0.5 hover:opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove(tag.id);
            }}
          >
            <X className={cn('h-3 w-3', compact && 'h-2.5 w-2.5')} />
          </button>
        </Badge>
      ))}

      {/* Add tag popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 px-2 text-xs text-muted-foreground gap-1',
              compact && 'h-5 px-1.5 text-[10px]'
            )}
          >
            <Plus className={cn('h-3 w-3', compact && 'h-2.5 w-2.5')} />
            Add Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          {showCreate ? (
            <div className="space-y-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setShowCreate(false);
                }}
              />
              <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      'h-5 w-5 rounded-full border-2 transition-all',
                      newColor === color
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {availableTags.length > 0 && (
                <div className="space-y-0.5 mb-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted/80 transition-colors text-left"
                      onClick={() => {
                        handleAssign(tag.id);
                        setOpen(false);
                      }}
                    >
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {availableTags.length > 0 && (
                <div className="border-t my-1" />
              )}
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Create New Tag
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default TagManager;
