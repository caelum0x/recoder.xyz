'use client';

import React, { useState, useCallback } from 'react';
import {
  Search,
  Filter,
  Clock,
  Tag,
  AlertTriangle,
  Wrench,
  ArrowDownWideNarrow,
  X,
  History,
  Trash2,
  MessageSquare,
  Bot,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import {
  useSearchThreads,
  useSearchHistory,
  useSearchSuggestions,
  useClearSearchHistory,
  type ThreadSearchIndexEntry,
} from '@/hooks/threads/use-thread-search-filters';

interface ThreadSearchPanelProps {
  onThreadSelect?: (threadId: string) => void;
  className?: string;
}

export function ThreadSearchPanel({ onThreadSelect, className }: ThreadSearchPanelProps) {
  const {
    data: searchResults,
    isLoading: isSearchLoading,
    isFetching,
    filters,
    updateFilters,
    resetFilters,
    hasActiveFilters,
    isDebouncing,
  } = useSearchThreads();

  const { data: historyData } = useSearchHistory();
  const { data: suggestions } = useSearchSuggestions();
  const clearHistoryMutation = useClearSearchHistory();

  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const results = searchResults?.results || [];
  const total = searchResults?.total || 0;

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateFilters({ query: e.target.value, offset: 0 });
      setShowHistory(false);
    },
    [updateFilters]
  );

  const handleSearchFocus = useCallback(() => {
    if (!filters.query) {
      setShowHistory(true);
    }
  }, [filters.query]);

  const handleHistoryClick = useCallback(
    (query: string) => {
      updateFilters({ query, offset: 0 });
      setShowHistory(false);
    },
    [updateFilters]
  );

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && tagInput.trim()) {
        const currentTags = filters.tags || [];
        if (!currentTags.includes(tagInput.trim())) {
          updateFilters({ tags: [...currentTags, tagInput.trim()], offset: 0 });
        }
        setTagInput('');
      }
    },
    [tagInput, filters.tags, updateFilters]
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const currentTags = filters.tags || [];
      updateFilters({
        tags: currentTags.filter((t) => t !== tag),
        offset: 0,
      });
    },
    [filters.tags, updateFilters]
  );

  const isSearching = isDebouncing || isFetching;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search threads..."
          value={filters.query || ''}
          onChange={handleQueryChange}
          onFocus={handleSearchFocus}
          onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          className="pl-9 pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isSearching && (
            <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className={cn('h-3.5 w-3.5', showFilters && 'text-primary')} />
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={resetFilters}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Search History Dropdown */}
        {showHistory && historyData?.history && historyData.history.length > 0 && (
          <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-lg">
            <CardContent className="p-2">
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <History className="h-3 w-3" />
                  Recent Searches
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={() => clearHistoryMutation.mutate()}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              {historyData.history.slice(0, 5).map((entry) => (
                <button
                  key={entry.id}
                  className="w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors flex items-center justify-between"
                  onClick={() => handleHistoryClick(entry.query)}
                >
                  <span className="truncate">{entry.query || '(filters only)'}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                    {entry.result_count} results
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <Card className="p-3">
          <CardContent className="p-0 space-y-3">
            {/* Agent filter */}
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Filter by agent ID"
                value={filters.agent_id || ''}
                onChange={(e) => updateFilters({ agent_id: e.target.value || undefined, offset: 0 })}
                className="h-8 text-sm"
              />
            </div>

            {/* Boolean toggles */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                  checked={filters.has_tool_calls === true}
                  onCheckedChange={(checked) =>
                    updateFilters({ has_tool_calls: checked ? true : undefined, offset: 0 })
                  }
                />
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Has tool calls</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                  checked={filters.has_errors === true}
                  onCheckedChange={(checked) =>
                    updateFilters({ has_errors: checked ? true : undefined, offset: 0 })
                  }
                />
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Has errors</span>
              </label>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                type="date"
                value={filters.date_from || ''}
                onChange={(e) => updateFilters({ date_from: e.target.value || undefined, offset: 0 })}
                className="h-8 text-sm"
                placeholder="From"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="date"
                value={filters.date_to || ''}
                onChange={(e) => updateFilters({ date_to: e.target.value || undefined, offset: 0 })}
                className="h-8 text-sm"
                placeholder="To"
              />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Input
                  placeholder="Add tag and press Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="h-8 text-sm"
                />
              </div>
              {filters.tags && filters.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-6">
                  {filters.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs gap-1">
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Suggested tags */}
              {suggestions?.popular_tags && suggestions.popular_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-6">
                  {suggestions.popular_tags
                    .filter((t) => !(filters.tags || []).includes(t.tag))
                    .slice(0, 5)
                    .map((t) => (
                      <Badge
                        key={t.tag}
                        variant="outline"
                        className="text-[10px] cursor-pointer hover:bg-muted"
                        onClick={() =>
                          updateFilters({
                            tags: [...(filters.tags || []), t.tag],
                            offset: 0,
                          })
                        }
                      >
                        {t.tag} ({t.count})
                      </Badge>
                    ))}
                </div>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select
                value={filters.sort_by || 'recent'}
                onValueChange={(value) =>
                  updateFilters({ sort_by: value as 'recent' | 'oldest' | 'most_messages', offset: 0 })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="most_messages">Most Messages</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {hasActiveFilters && (
        <>
          {/* Result count */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isSearchLoading
                ? 'Searching...'
                : `${total} thread${total !== 1 ? 's' : ''} found`}
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={resetFilters}
              >
                Clear all filters
              </Button>
            )}
          </div>

          {/* Results list */}
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((result) => (
                <ThreadResultCard
                  key={result.id}
                  result={result}
                  onClick={() => onThreadSelect?.(result.thread_id)}
                />
              ))}
            </div>
          ) : !isSearchLoading && hasActiveFilters ? (
            <Card className="p-6">
              <CardContent className="p-0 text-center">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No threads found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search query or filters.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      {/* Empty state when no search */}
      {!hasActiveFilters && !showHistory && (
        <Card className="p-6">
          <CardContent className="p-0 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Search your threads</p>
            <p className="text-xs text-muted-foreground mt-1">
              Enter a search query or use filters to find threads.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Thread Result Card
// ============================================================================

interface ThreadResultCardProps {
  result: ThreadSearchIndexEntry;
  onClick?: () => void;
}

function ThreadResultCard({ result, onClick }: ThreadResultCardProps) {
  return (
    <Card
      className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Content preview */}
            <p className="text-sm text-foreground line-clamp-2">
              {result.content_preview || 'No preview available'}
            </p>

            {/* Meta info */}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {result.agent_id && (
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  {result.agent_id}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {result.message_count} msgs
              </span>
              {result.last_message_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(result.last_message_at), { addSuffix: true })}
                </span>
              )}
            </div>

            {/* Tags and indicators */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {result.has_tool_calls && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Wrench className="h-2.5 w-2.5" />
                  Tools
                </Badge>
              )}
              {result.has_errors && (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Errors
                </Badge>
              )}
              {result.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
