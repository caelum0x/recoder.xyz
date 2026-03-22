'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Database,
  Bot,
  History,
  X,
  Plus,
  Trash2,
  MessageSquare,
  Clock,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useSearchThreads,
  useIndexThread,
  useSearchHistory,
  useClearSearchHistory,
  useSearchStats,
} from '@/hooks/threads/use-thread-search';
import type { SearchFilters } from '@/lib/api/thread-search';

// ============================================================================
// Helpers
// ============================================================================

function highlightQuery(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-amber-400/30 text-foreground rounded px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function ThreadSearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [agentIdFilter, setAgentIdFilter] = useState('');
  const [showIndexDialog, setShowIndexDialog] = useState(false);

  // Index form state
  const [formThreadId, setFormThreadId] = useState('');
  const [formAgentId, setFormAgentId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSnippet, setFormSnippet] = useState('');
  const [formTags, setFormTags] = useState('');

  const filters: SearchFilters = useMemo(() => ({
    q: submittedQuery || undefined,
    agent_id: agentIdFilter || undefined,
    limit: 50,
  }), [submittedQuery, agentIdFilter]);

  const searchQuery = useSearchThreads(filters);
  const historyQuery = useSearchHistory(20);
  const statsQuery = useSearchStats();
  const indexMutation = useIndexThread();
  const clearHistoryMutation = useClearSearchHistory();

  const results = searchQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const stats = statsQuery.data;

  const handleSearch = useCallback(() => {
    setSubmittedQuery(query.trim());
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch]
  );

  const handleHistoryClick = useCallback((q: string) => {
    setQuery(q);
    setSubmittedQuery(q);
  }, []);

  const handleIndexSubmit = () => {
    if (!formThreadId.trim()) return;
    indexMutation.mutate(
      {
        thread_id: formThreadId,
        agent_id: formAgentId || undefined,
        title: formTitle || undefined,
        content_snippet: formSnippet || undefined,
        tags: formTags ? formTags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      },
      {
        onSuccess: () => {
          setShowIndexDialog(false);
          setFormThreadId('');
          setFormAgentId('');
          setFormTitle('');
          setFormSnippet('');
          setFormTags('');
        },
      }
    );
  };

  return (
    <div className="flex-1 overflow-auto pb-8 px-4 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold">Thread Search</h1>
          <p className="text-sm text-muted-foreground">Full-text search across indexed threads</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowIndexDialog(true)}>
          <Plus className="h-4 w-4" />
          Index Thread
        </Button>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 h-11 text-base"
            placeholder="Search threads…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setQuery('');
                setSubmittedQuery('');
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Input
          className="w-40 h-11"
          placeholder="Agent ID…"
          value={agentIdFilter}
          onChange={(e) => setAgentIdFilter(e.target.value)}
        />
        <Button className="h-11 px-5" onClick={handleSearch}>
          Search
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Indexed Threads</span>
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-xl font-semibold">{stats.total_indexed}</span>
            </div>
          </SpotlightCard>

          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Agents Indexed</span>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-xl font-semibold">{Object.keys(stats.by_agent).length}</span>
            </div>
          </SpotlightCard>

          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Total Searches</span>
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-xl font-semibold">{stats.recent_searches}</span>
            </div>
          </SpotlightCard>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Results */}
        <div className="lg:col-span-3 space-y-3">
          {searchQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : results.length === 0 ? (
            <SpotlightCard className="bg-card border border-border">
              <div className="p-10 text-center">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <h4 className="text-sm font-medium mb-1">
                  {submittedQuery ? 'No results found' : 'Start searching'}
                </h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {submittedQuery
                    ? `No indexed threads matched "${submittedQuery}". Try a different query or index more threads.`
                    : 'Enter a search query above to find threads, or index threads to make them searchable.'}
                </p>
              </div>
            </SpotlightCard>
          ) : (
            <>
              {submittedQuery && (
                <p className="text-xs text-muted-foreground">
                  {results.length} result{results.length !== 1 ? 's' : ''} for "{submittedQuery}"
                </p>
              )}
              {results.map((result) => (
                <SpotlightCard key={result.id} className="bg-card border border-border hover:border-primary/30 transition-colors">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="text-sm font-medium line-clamp-1">
                        {result.title
                          ? highlightQuery(result.title, submittedQuery)
                          : <span className="text-muted-foreground font-mono text-xs">{result.thread_id}</span>}
                      </h4>
                      {result.agent_id && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          {result.agent_id}
                        </Badge>
                      )}
                    </div>

                    {result.content_snippet && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {highlightQuery(result.content_snippet, submittedQuery)}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {result.message_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {result.message_count} msg{result.message_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {result.last_message_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(result.last_message_at), 'MMM d, yyyy')}
                        </span>
                      )}
                      {result.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {result.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {result.tags.length > 3 && (
                            <span>+{result.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </SpotlightCard>
              ))}
            </>
          )}
        </div>

        {/* History Sidebar */}
        <div className="space-y-4">
          <SpotlightCard className="bg-card border border-border">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Recent Searches
                </h3>
                {history.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => clearHistoryMutation.mutate(undefined)}
                    disabled={clearHistoryMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {historyQuery.isLoading ? (
                <div className="space-y-1.5">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-7 rounded-md" />)}
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No recent searches</p>
              ) : (
                <div className="space-y-1">
                  {history.map((entry) => (
                    <button
                      key={entry.id}
                      className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                      onClick={() => handleHistoryClick(entry.query)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs truncate text-muted-foreground group-hover:text-foreground transition-colors">
                          {entry.query}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {entry.results_count}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SpotlightCard>

          {/* Top Queries */}
          {stats && stats.top_queries.length > 0 && (
            <SpotlightCard className="bg-card border border-border">
              <div className="p-4">
                <h3 className="text-sm font-medium mb-3">Top Queries</h3>
                <div className="space-y-1.5">
                  {stats.top_queries.map((item, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                      onClick={() => handleHistoryClick(item.query)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs truncate text-muted-foreground group-hover:text-foreground">
                          {item.query}
                        </span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                          {item.count}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          )}
        </div>
      </div>

      {/* Index Thread Dialog */}
      <Dialog open={showIndexDialog} onOpenChange={setShowIndexDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Index Thread</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Thread ID *</label>
              <Input
                placeholder="e.g. thread_abc123"
                value={formThreadId}
                onChange={(e) => setFormThreadId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Agent ID</label>
              <Input
                placeholder="e.g. agent_xyz"
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
              <Input
                placeholder="Thread title or topic"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Content Snippet</label>
              <Textarea
                placeholder="Paste a summary or key excerpt to enable full-text search…"
                value={formSnippet}
                onChange={(e) => setFormSnippet(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tags <span className="font-normal">(comma-separated)</span>
              </label>
              <Input
                placeholder="e.g. support, bug, onboarding"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIndexDialog(false)}>Cancel</Button>
            <Button
              onClick={handleIndexSubmit}
              disabled={!formThreadId.trim() || indexMutation.isPending}
            >
              {indexMutation.isPending ? 'Indexing…' : 'Index Thread'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
