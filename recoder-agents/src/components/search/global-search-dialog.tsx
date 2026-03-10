'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageSquare, GitBranch, BookOpen, Search, Loader2 } from 'lucide-react';
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
import { useGlobalSearch } from '@/hooks/platform/use-global-search';
import { useIsMobile } from '@/hooks/utils';
import { useSidebar } from '@/components/ui/sidebar';
import type { SearchResult } from '@/lib/api/search';
import { CommandPaletteActions } from '@/components/command-palette';

const RECENT_SEARCHES_KEY = 'recoder-recent-searches';
const MAX_RECENT = 5;

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'agents', label: 'Agents' },
  { key: 'threads', label: 'Threads' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'knowledge', label: 'Knowledge' },
] as const;

const TYPE_ICONS: Record<string, typeof Bot> = {
  agent: Bot,
  thread: MessageSquare,
  workflow: GitBranch,
  knowledge: BookOpen,
};

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
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // ignore storage errors
  }
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const listRef = useRef<HTMLDivElement>(null);

  const types = activeFilter === 'all' ? undefined : [activeFilter];
  const { data, isLoading } = useGlobalSearch(search, types);

  const results = data?.results ?? [];
  const recentSearches = useMemo(() => (search ? [] : getRecentSearches()), [search]);

  // Group results by type when showing "All"
  const grouped = useMemo(() => {
    if (activeFilter !== 'all' || results.length === 0) return null;
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results, activeFilter]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    if (grouped) {
      return Object.values(grouped).flat();
    }
    return results;
  }, [grouped, results]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      saveRecentSearch(search);
      onOpenChange(false);
      setSearch('');
      router.push(result.url);
      if (isMobile) setOpenMobile(false);
    },
    [search, onOpenChange, router, isMobile, setOpenMobile],
  );

  const handleRecentSelect = useCallback(
    (query: string) => {
      setSearch(query);
    },
    [],
  );

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveFilter('all');
      setSelectedIndex(0);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [flatResults.length, search]);

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

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = {
      agent: 'Agents',
      thread: 'Threads',
      workflow: 'Workflows',
      knowledge: 'Knowledge',
    };
    return labels[type] || type;
  };

  const renderResult = (result: SearchResult, index: number) => {
    const Icon = TYPE_ICONS[result.type] || Search;
    return (
      <CommandItem
        key={result.id}
        value={result.id}
        onSelect={() => handleSelect(result)}
        data-search-item
        className={`p-0 rounded-xl ${index === selectedIndex ? 'bg-accent' : ''}`}
      >
        <div className="flex items-center gap-3 px-3 py-2.5 w-full">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{result.title}</p>
            {result.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {result.description}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
            {result.type}
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
          <div className="px-4 py-3 border-b">
            <div className="relative">
              <CommandInput
                placeholder="Search agents, threads, workflows..."
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
            {/* Type filter pills */}
            <div className="flex gap-1.5 mt-2">
              {TYPE_FILTERS.map(({ key, label }) => (
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
            </div>
          </div>
          <CommandList className="max-h-[400px] p-3" ref={listRef}>
            {/* No query yet -- show recent searches or hint */}
            {!search && recentSearches.length > 0 && (
              <CommandGroup heading="Recent Searches">
                {recentSearches.map((q) => (
                  <CommandItem
                    key={q}
                    value={`recent-${q}`}
                    onSelect={() => handleRecentSelect(q)}
                    className="rounded-xl"
                  >
                    <Search className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                    <span className="text-sm">{q}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Quick actions when search is empty */}
            {!search && (
              <CommandPaletteActions
                onClose={() => onOpenChange(false)}
              />
            )}

            {/* Loading */}
            {search && isLoading && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Searching...</p>
              </div>
            )}

            {/* Empty results */}
            {search && !isLoading && results.length === 0 && search.length >= 2 && (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                No results for &apos;{search}&apos;
              </CommandEmpty>
            )}

            {/* Grouped results (All filter) */}
            {search && !isLoading && grouped &&
              Object.entries(grouped).map(([type, items]) => (
                <CommandGroup key={type} heading={typeLabel(type)}>
                  {items.map((result) => {
                    const idx = globalIndex++;
                    return renderResult(result, idx);
                  })}
                </CommandGroup>
              ))}

            {/* Flat results (specific filter) */}
            {search && !isLoading && !grouped && results.length > 0 && (
              <CommandGroup>
                {results.map((result, idx) => renderResult(result, idx))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
