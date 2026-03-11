'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Star,
  Clock,
  LayoutDashboard,
  Bot,
  Settings,
  Activity,
  CreditCard,
  BookOpen,
  FileBarChart,
  Plus,
  Download,
  Stethoscope,
  Moon,
  Search,
  Pin,
  ArrowRight,
  Command,
} from 'lucide-react';
import { useAgents } from '@/hooks/agents/use-agents';
import {
  useRecordCommand,
  useCommandHistory,
  useFrequentCommands,
  useCommandPins,
  usePinCommand,
  useUnpinCommand,
} from '@/hooks/use-command-palette';
import type { CommandType } from '@/lib/api/command-palette';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  type: CommandType;
  action: () => void;
}

interface CommandSection {
  title: string;
  icon: React.ReactNode;
  items: CommandItem[];
}

// ---------------------------------------------------------------------------
// Fuzzy match helper
// ---------------------------------------------------------------------------

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: agents } = useAgents({}, { enabled: open });
  const { data: history } = useCommandHistory();
  const { data: pins } = useCommandPins();
  const recordCommand = useRecordCommand();
  const pinCommandMut = usePinCommand();
  const unpinMut = useUnpinCommand();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Execute command and track
  const executeCommand = useCallback(
    (item: CommandItem) => {
      recordCommand.mutate({
        command: item.id,
        command_type: item.type,
        metadata: { label: item.label },
      });
      setOpen(false);
      item.action();
    },
    [recordCommand],
  );

  // Build navigation commands
  const navigationCommands: CommandItem[] = useMemo(
    () => [
      {
        id: 'nav:dashboard',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/'),
      },
      {
        id: 'nav:agents',
        label: 'Go to Agents',
        icon: <Bot className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/agents'),
      },
      {
        id: 'nav:settings',
        label: 'Go to Settings',
        shortcut: ',',
        icon: <Settings className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/settings'),
      },
      {
        id: 'nav:monitoring',
        label: 'Go to Monitoring',
        icon: <Activity className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/monitoring'),
      },
      {
        id: 'nav:billing',
        label: 'Go to Billing',
        icon: <CreditCard className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/checkout'),
      },
      {
        id: 'nav:knowledge',
        label: 'Go to Knowledge Base',
        icon: <BookOpen className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/knowledge'),
      },
      {
        id: 'nav:reports',
        label: 'Go to Reports',
        icon: <FileBarChart className="h-4 w-4" />,
        type: 'navigation' as CommandType,
        action: () => router.push('/reports'),
      },
    ],
    [router],
  );

  // Build action commands
  const actionCommands: CommandItem[] = useMemo(
    () => [
      {
        id: 'action:new-thread',
        label: 'New Thread',
        description: 'Start a new conversation',
        icon: <Plus className="h-4 w-4" />,
        type: 'action' as CommandType,
        action: () => router.push('/'),
      },
      {
        id: 'action:new-agent',
        label: 'New Agent',
        description: 'Create a new agent',
        icon: <Bot className="h-4 w-4" />,
        type: 'action' as CommandType,
        action: () => router.push('/agents'),
      },
      {
        id: 'action:export',
        label: 'Export Data',
        description: 'Export your data',
        icon: <Download className="h-4 w-4" />,
        type: 'action' as CommandType,
        action: () => router.push('/settings'),
      },
      {
        id: 'action:health-check',
        label: 'Run Health Check',
        description: 'Check system health status',
        icon: <Stethoscope className="h-4 w-4" />,
        type: 'action' as CommandType,
        action: () => router.push('/monitoring'),
      },
      {
        id: 'action:toggle-theme',
        label: 'Toggle Dark Mode',
        description: 'Switch between light and dark themes',
        icon: <Moon className="h-4 w-4" />,
        type: 'setting' as CommandType,
        action: () => {
          const html = document.documentElement;
          html.classList.toggle('dark');
        },
      },
    ],
    [router],
  );

  // Build agent quick-start commands
  const agentCommands: CommandItem[] = useMemo(() => {
    if (!agents?.agents) return [];
    return agents.agents.slice(0, 15).map((agent) => ({
      id: `agent:${agent.agent_id}`,
      label: agent.name,
      description: 'Start thread with this agent',
      icon: <Bot className="h-4 w-4" />,
      type: 'agent' as CommandType,
      action: () =>
        router.push(`/projects/${agent.agent_id}/thread/new`),
    }));
  }, [agents, router]);

  // Build pinned commands section
  const pinnedItems: CommandItem[] = useMemo(() => {
    if (!pins?.length) return [];
    const allCommands = [...navigationCommands, ...actionCommands, ...agentCommands];
    return pins.map((pin) => {
      const matching = allCommands.find((c) => c.id === pin.command);
      return {
        id: `pin:${pin.id}`,
        label: pin.label,
        icon: <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />,
        type: pin.command_type as CommandType,
        action: matching
          ? matching.action
          : () => {},
      };
    });
  }, [pins, navigationCommands, actionCommands, agentCommands]);

  // Build recent commands section
  const recentItems: CommandItem[] = useMemo(() => {
    if (!history?.length) return [];
    const allCommands = [...navigationCommands, ...actionCommands, ...agentCommands];
    const seen = new Set<string>();
    const items: CommandItem[] = [];
    for (const entry of history) {
      if (seen.has(entry.command)) continue;
      seen.add(entry.command);
      const matching = allCommands.find((c) => c.id === entry.command);
      if (matching) {
        items.push({
          ...matching,
          id: `recent:${entry.id}`,
          icon: <Clock className="h-4 w-4 text-muted-foreground" />,
        });
      }
      if (items.length >= 5) break;
    }
    return items;
  }, [history, navigationCommands, actionCommands, agentCommands]);

  // Build all sections
  const sections: CommandSection[] = useMemo(() => {
    const s: CommandSection[] = [];

    if (pinnedItems.length > 0) {
      s.push({
        title: 'Pinned',
        icon: <Star className="h-3.5 w-3.5" />,
        items: pinnedItems,
      });
    }

    if (recentItems.length > 0 && !search) {
      s.push({
        title: 'Recent',
        icon: <Clock className="h-3.5 w-3.5" />,
        items: recentItems,
      });
    }

    s.push({
      title: 'Navigation',
      icon: <ArrowRight className="h-3.5 w-3.5" />,
      items: navigationCommands,
    });

    s.push({
      title: 'Actions',
      icon: <Command className="h-3.5 w-3.5" />,
      items: actionCommands,
    });

    if (agentCommands.length > 0) {
      s.push({
        title: 'Agent Quick Start',
        icon: <Bot className="h-3.5 w-3.5" />,
        items: agentCommands,
      });
    }

    return s;
  }, [pinnedItems, recentItems, navigationCommands, actionCommands, agentCommands, search]);

  // Filter sections based on search
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            fuzzyMatch(item.label, search) ||
            (item.description && fuzzyMatch(item.description, search)),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, search]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(
    () => filteredSections.flatMap((s) => s.items),
    [filteredSections],
  );

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            executeCommand(flatItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [flatItems, selectedIndex, executeCommand],
  );

  let itemIndex = 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground mr-2" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="h-11 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
          <Badge variant="outline" className="ml-2 shrink-0 text-xs px-1.5 py-0.5">
            ESC
          </Badge>
        </div>

        {/* Command List */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto py-2"
        >
          {filteredSections.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No commands found.
            </div>
          )}

          {filteredSections.map((section) => (
            <div key={section.title} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {section.icon}
                {section.title}
              </div>
              {section.items.map((item) => {
                const currentIndex = itemIndex++;
                const isSelected = currentIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    data-selected={isSelected}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 text-sm text-left transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => executeCommand(item)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {item.description}
                      </span>
                    )}
                    {item.shortcut && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">
                        {item.shortcut}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                <span className="text-[10px]">&#8593;&#8595;</span>
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                <span className="text-[10px]">&#9166;</span>
              </kbd>
              select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              &#8984;K
            </kbd>
            toggle
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
