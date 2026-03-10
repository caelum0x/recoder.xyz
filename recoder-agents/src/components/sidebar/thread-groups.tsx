'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { ThreadWithProject } from '@/hooks/sidebar/use-sidebar';

type GroupMode = 'date' | 'agent';

interface ThreadGroupsProps {
  threads: ThreadWithProject[];
  renderThread: (thread: ThreadWithProject) => React.ReactNode;
}

function groupByDate(threads: ThreadWithProject[]): Map<string, ThreadWithProject[]> {
  const groups = new Map<string, ThreadWithProject[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - 7 * 86400000);

  for (const thread of threads) {
    const date = new Date(thread.updatedAt || '');
    let label: string;

    if (date >= today) label = 'Today';
    else if (date >= yesterday) label = 'Yesterday';
    else if (date >= weekStart) label = 'This Week';
    else label = 'Older';

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(thread);
  }

  return groups;
}

function groupByAgent(threads: ThreadWithProject[]): Map<string, ThreadWithProject[]> {
  const groups = new Map<string, ThreadWithProject[]>();
  for (const thread of threads) {
    const label = thread.projectName || 'No Agent';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(thread);
  }
  return groups;
}

export function ThreadGroups({ threads, renderThread }: ThreadGroupsProps) {
  const [mode, setMode] = useState<GroupMode>('date');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    return mode === 'date' ? groupByDate(threads) : groupByAgent(threads);
  }, [threads, mode]);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {/* Group mode selector */}
      <div className="flex items-center justify-end px-2 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1">
              {mode === 'date' ? <Calendar className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              Group by {mode === 'date' ? 'Date' : 'Agent'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setMode('date')}>
              <Calendar className="h-3 w-3 mr-2" /> By Date
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMode('agent')}>
              <Bot className="h-3 w-3 mr-2" /> By Agent
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grouped thread list */}
      {Array.from(groups.entries()).map(([label, groupThreads]) => (
        <div key={label}>
          <button
            onClick={() => toggleGroup(label)}
            className="flex items-center gap-1 w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed.has(label) ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {label}
            <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">
              {groupThreads.length}
            </Badge>
          </button>
          {!collapsed.has(label) && (
            <div className="space-y-0.5">
              {groupThreads.map((thread) => (
                <div key={thread.threadId}>{renderThread(thread)}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
