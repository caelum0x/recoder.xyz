'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  MessageSquare,
  BookOpen,
  Search,
  Loader2,
  FileText,
  Clock,
  X,
  RefreshCw,
  Webhook,
  CalendarClock,
  TestTube,
  LayoutTemplate,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useIndexedSearch, useReindex } from '@/hooks/use-global-search';
import { useIsMobile } from '@/hooks/utils';
import { useSidebar } from '@/components/ui/sidebar';
import type { SearchIndexEntry } from '@/lib/api/global-search';
import { CommandPaletteActions } from '@/components/command-palette';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_SEARCHES_KEY = 'recoder-indexed-recent-searches';
const MAX_RECENT = 8;

const RESOURCE_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'agent', label: 'Agents' },
  { key: 'thread', label: 'Threads' },
  { key: 'prompt', label: 'Prompts' },
  { key: 'knowledge_entry', label: 'Knowledge' },
  { key: 'template', label: 'Templates' },
] as const;

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  agent: Bot,
  thread: MessageSquare,
  prompt: FileText,
  knowledge_entry: BookOpen,
  template: LayoutTemplate,
  webhook: Webhook,
  schedule: CalendarClock,
  test_case: TestTube,
};

const TYPE_LABELS: Record<string, string> = {
  agent: 'Agent',
  thread: 'Thread',
  prompt: 'Prompt',
  knowledge_entry: 'Knowledge',
  template: 'Template',
  webhook: 'Webhook',
  schedule: 'Schedule',
  test_case: 'Test Case',
};

// ---------------------------------------------------------------------------
// URL mapping per resource type
// ---------------------------------------------------------------------------

function getResourceUrl(type: string, id: string): string {
  switch (type) {
    case 'agent':
      return `/agents/config/${id}`;
    case 'thread':
      return `/projects/default/thread/${id}`;
    case 'prompt':
      return `/settings/prompts`;
    case 'knowledge_entry':
      return `/knowledge`;
    case 'template':
      return `/templates`;
    case 'webhook':
      return `/settings/webhooks`;
    case 'schedule':
      return `/settings/schedules`;
    case 'test_case':
      return `/settings/testing`;
    default:
      return '/';
  }
}

// ---------------------------------------------------------------------------
// Recent searches helpers
// ---------------------------------------------------------------------------

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT)),
    );
  } catch {
    // Ignore localStorage errors
  }
}

function clearRecentSearches() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GlobalSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchCommand({ open, onOpenChange }: GlobalSearchCommandProps) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search query
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const resourceType = activeFilter === 'all' ? undefined : activeFilter;
  const { data, isLoading } = useIndexedSearch(debouncedQuery, resourceType);
  const reindexMutation = useReindex();

  const results = data?.results ?? [];
  const recentSearches = useMemo(
    () => (search ? [] : getRecentSearches()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, open],
  );

  // Group results by resource_type when showing "All"
  const grouped = useMemo(() => {
    if (activeFilter !== 'all' || results.length === 0) return null;
    const groups: Record<string, SearchIndexEntry[]> = {};
    for (const r of results) {
      if (!groups[r.resource_type]) groups[r.resource_type] = [];
      groups[r.resource_type].push(r);
    }
    return groups;
  }, [results, activeFilter]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    if (grouped) return Object.values(grouped).flat();
    return results;
  }, [grouped, results]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelect = useCallback(
    (entry: SearchIndexEntry) => {
      saveRecentSearch(search);
      onOpenChange(false);
      setSearch('');
      const url = getResourceUrl(entry.resource_type, entry.resource_id);
      router.push(url);
      if (isMobile) setOpenMobile(false);
    },
    [search, onOpenChange, router, isMobile, setOpenMobile],
  );

  const handleRecentSelect = useCallback((query: string) => {
    setSearch(query);
  }, []);

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    // Force re-render by toggling a state
    setSearch((prev) => prev);
  }, []);

  const handleReindex = useCallback(() => {
    reindexMutation.mutate(undefined, {
      onSuccess: (data) => {
        const total = Object.values(data.indexed).reduce((a, b) => a + b, 0);
        toast.success(`Search index rebuilt: ${total} items indexed`);
      },
      onError: () => {
        toast.error('Failed to rebuild search index');
      },
    });
  }, [reindexMutation]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveFilter('all');
      setSelectedIndex(0);
      setDebouncedQuery('');
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [flatResults.length, debouncedQuery]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, flatResults, selectedIndex, handleSelect]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-search-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------

  const renderResult = (entry: SearchIndexEntry, index: number) => {
    const Icon = TYPE_ICONS[entry.resource_type] || Search;
    const label = TYPE_LABELS[entry.resource_type] || entry.resource_type;

    return (
      <CommandItem
        key={`${entry.resource_type}-${entry.resource_id}`}
        value={`${entry.resource_type}-${entry.resource_id}`}
        onSelect={() => handleSelect(entry)}
        data-search-item
        className={`p-0 rounded-xl ${index === selectedIndex ? 'bg-accent' : ''}`}
      >
        <div className="flex items-center gap-3 px-3 py-2.5 w-full">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{entry.title}</p>
            {entry.content_preview && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {entry.content_preview}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
            {label}
          </span>
        </div>
      </CommandItem>
    );
  };

  let globalIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-background" hideCloseButton>
        <VisuallyHidden>
          <DialogTitle>Global Search</DialogTitle>
        </VisuallyHidden>
        <Command className="bg-background border-0" shouldFilter={false}>
          {/* Header: input + filter pills */}
          <div className="px-4 py-3 border-b">
            <div className="relative">
              <CommandInput
                ref={inputRef}
                placeholder="Search agents, threads, prompts, knowledge..."
                value={search}
                onValueChange={setSearch}
                className="px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {isLoading && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Resource type filter pills */}
            <div className="flex items-center gap-1.5 mt-2">
              {RESOURCE_TYPE_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeFilter === key
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {label}
                </button>
              ))}

              {/* Reindex button */}
              <button
                onClick={handleReindex}
                disabled={reindexMutation.isPending}
                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                title="Rebuild search index"
              >
                <RefreshCw
                  className={`h-3 w-3 ${reindexMutation.isPending ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">Reindex</span>
              </button>
            </div>
          </div>

          <CommandList className="max-h-[400px] p-3" ref={listRef}>
            {/* --- Empty state: show recent searches + quick actions --- */}
            {!search && recentSearches.length > 0 && (
              <CommandGroup
                heading={
                  <div className="flex items-center justify-between">
                    <span>Recent Searches</span>
                    <button
                      onClick={handleClearRecent}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                }
              >
                {recentSearches.map((q) => (
                  <CommandItem
                    key={`recent-${q}`}
                    value={`recent-${q}`}
                    onSelect={() => handleRecentSelect(q)}
                    className="rounded-xl"
                  >
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                    <span className="text-sm">{q}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Quick actions when search is empty */}
            {!search && (
              <CommandPaletteActions onClose={() => onOpenChange(false)} />
            )}

            {/* --- Empty state with suggestion when no input --- */}
            {!search && recentSearches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Type to search across all your resources
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Agents, threads, prompts, knowledge base entries, and more
                </p>
              </div>
            )}

            {/* --- Loading state --- */}
            {search && isLoading && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Searching...</p>
              </div>
            )}

            {/* --- Empty results --- */}
            {search && !isLoading && results.length === 0 && debouncedQuery.length >= 2 && (
              <CommandEmpty className="py-10 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Search className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    No results for &ldquo;{debouncedQuery}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Try a different search term or rebuild the index
                  </p>
                  <button
                    onClick={handleReindex}
                    disabled={reindexMutation.isPending}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${reindexMutation.isPending ? 'animate-spin' : ''}`}
                    />
                    Rebuild Index
                  </button>
                </div>
              </CommandEmpty>
            )}

            {/* --- Grouped results (All filter) --- */}
            {search &&
              !isLoading &&
              grouped &&
              Object.entries(grouped).map(([type, items]) => (
                <CommandGroup key={type} heading={TYPE_LABELS[type] || type}>
                  {items.map((entry) => {
                    const idx = globalIndex++;
                    return renderResult(entry, idx);
                  })}
                </CommandGroup>
              ))}

            {/* --- Flat results (specific filter) --- */}
            {search && !isLoading && !grouped && results.length > 0 && (
              <CommandGroup>
                {results.map((entry, idx) => renderResult(entry, idx))}
              </CommandGroup>
            )}
          </CommandList>

          {/* Footer */}
          <div className="px-4 py-2 border-t flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">↵</kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">esc</kbd>
                close
              </span>
            </div>
            {search && results.length > 0 && (
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
