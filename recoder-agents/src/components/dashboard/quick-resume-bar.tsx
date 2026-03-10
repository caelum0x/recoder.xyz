'use client';

import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import Link from 'next/link';
import { MessageCircle, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface RecentThread {
  thread_id: string;
  name: string;
  agent_name?: string;
  updated_at: string;
  last_message_preview?: string;
}

function useRecentThreads() {
  return useQuery({
    queryKey: ['recent-threads-resume'],
    queryFn: async () => {
      const response = await backendApi.get<{ threads: RecentThread[] }>(
        '/threads?limit=3&sort=updated_at',
        { showErrors: false }
      );
      if (response.error) return [];
      // Handle both array and object responses
      const data = response.data;
      if (Array.isArray(data)) return data.slice(0, 3);
      if (data && Array.isArray(data.threads)) return data.threads.slice(0, 3);
      return [];
    },
    staleTime: 60_000,
  });
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function QuickResumeBar() {
  const { data: threads, isLoading } = useRecentThreads();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || isLoading || !threads || threads.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Continue where you left off
        </h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsDismissed(true)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {threads.map((thread) => (
          <Link
            key={thread.thread_id}
            href={`/thread/${thread.thread_id}`}
            className="group flex items-center gap-3 rounded-md border p-2 hover:bg-accent transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {thread.name || 'Untitled Thread'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {thread.agent_name && (
                  <Badge variant="secondary" className="text-[10px] h-4">
                    {thread.agent_name}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {getRelativeTime(thread.updated_at)}
                </span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
