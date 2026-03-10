'use client';

import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecentThreadsWidgetProps {
  config: Record<string, any>;
}

interface ThreadItem {
  id: string;
  agent_name: string;
  preview: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const PLACEHOLDER_THREADS: ThreadItem[] = [
  { id: '1', agent_name: 'Research Agent', preview: 'Analyzing market data...', created_at: new Date(Date.now() - 300_000).toISOString() },
  { id: '2', agent_name: 'Code Assistant', preview: 'Implementing API endpoints...', created_at: new Date(Date.now() - 1_800_000).toISOString() },
  { id: '3', agent_name: 'Writer Agent', preview: 'Drafting documentation...', created_at: new Date(Date.now() - 7_200_000).toISOString() },
  { id: '4', agent_name: 'Data Agent', preview: 'Processing CSV files...', created_at: new Date(Date.now() - 14_400_000).toISOString() },
  { id: '5', agent_name: 'Design Agent', preview: 'Generating mockups...', created_at: new Date(Date.now() - 86_400_000).toISOString() },
];

export function RecentThreadsWidget({ config }: RecentThreadsWidgetProps) {
  const threads: ThreadItem[] = config?.threads ?? PLACEHOLDER_THREADS;

  return (
    <div className="flex flex-col gap-1">
      {threads.slice(0, 5).map((thread) => (
        <div
          key={thread.id}
          className={cn(
            'flex items-center gap-3 rounded-md px-2 py-1.5',
            'hover:bg-muted/50 transition-colors cursor-pointer'
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">
                {thread.agent_name}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(thread.created_at)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {thread.preview}
            </p>
          </div>
        </div>
      ))}
      {threads.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No recent threads
        </p>
      )}
    </div>
  );
}
