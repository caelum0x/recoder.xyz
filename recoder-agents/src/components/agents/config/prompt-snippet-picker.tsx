'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  TrendingUp,
  Tag,
  Globe,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  usePromptSnippets,
  useRecordSnippetUsage,
  type PromptSnippet,
} from '@/hooks/prompts/use-shared-prompts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'system', label: 'System' },
  { id: 'tool', label: 'Tool' },
  { id: 'format', label: 'Format' },
  { id: 'persona', label: 'Persona' },
  { id: 'safety', label: 'Safety' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  system: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  tool: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  format: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  persona: 'bg-pink-500/15 text-pink-600 border-pink-500/30',
  safety: 'bg-red-500/15 text-red-600 border-red-500/30',
  custom: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PromptSnippetPickerProps {
  agentId: string;
  onInsert: (content: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromptSnippetPicker({ agentId, onInsert }: PromptSnippetPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filters = useMemo(
    () => ({
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      search: searchQuery || undefined,
      limit: 20,
    }),
    [selectedCategory, searchQuery]
  );

  const { data: snippetsData, isLoading } = usePromptSnippets(filters);
  const recordUsageMutation = useRecordSnippetUsage();

  const snippets = snippetsData?.prompts || [];

  const handleSelect = async (snippet: PromptSnippet) => {
    onInsert(snippet.content);
    setOpen(false);
    toast.success(`Inserted "${snippet.title}"`);

    // Record usage in background
    try {
      await recordUsageMutation.mutateAsync({
        snippetId: snippet.id,
        agentId,
      });
    } catch {
      // Silent failure for usage recording
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <BookOpen className="h-3.5 w-3.5" />
          Insert Snippet
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search snippets..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'ghost'}
                size="sm"
                className="text-[10px] h-6 px-2"
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="max-h-64">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : snippets.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {searchQuery ? 'No matching snippets' : 'No snippets yet'}
            </div>
          ) : (
            <div className="p-1">
              {snippets.map((snippet) => (
                <button
                  key={snippet.id}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelect(snippet)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium truncate flex-1">
                      {snippet.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-1 py-0 leading-tight',
                        CATEGORY_COLORS[snippet.category]
                      )}
                    >
                      {snippet.category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono line-clamp-2">
                    {snippet.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <TrendingUp className="h-2.5 w-2.5" />
                    {snippet.use_count} uses
                    {snippet.is_public ? (
                      <Globe className="h-2.5 w-2.5 ml-1" />
                    ) : (
                      <Lock className="h-2.5 w-2.5 ml-1" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
