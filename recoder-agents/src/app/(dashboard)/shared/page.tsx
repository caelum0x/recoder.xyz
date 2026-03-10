'use client';

import { Users, MessageCircle, Bot, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSharedWithMe } from '@/hooks/platform/use-shared-with-me';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case 'editor':
    case 'admin':
      return 'beta' as const;
    default:
      return 'secondary' as const;
  }
};

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <Users className="h-10 w-10 mx-auto text-muted-foreground/25 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">Nothing shared with you yet</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
        When someone shares a thread or agent with you, it will appear here
      </p>
    </div>
  );
}

export default function SharedPage() {
  const router = useRouter();
  const { data, isLoading } = useSharedWithMe();

  const hasThreads = data?.shared_threads && data.shared_threads.length > 0;
  const hasAgents = data?.shared_agents && data.shared_agents.length > 0;
  const isEmpty = !hasThreads && !hasAgents;

  return (
    <div className="min-h-[100dvh] flex items-start justify-center pt-12 pb-8">
      <div className="container mx-auto max-w-2xl px-4">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">Shared with me</h1>
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : isEmpty ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {/* Shared Threads */}
              {hasThreads && (
                <div className="space-y-2">
                  <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    Shared Threads
                  </h2>
                  <div className="space-y-1.5">
                    {data!.shared_threads.map((item) => (
                      <button
                        key={item.thread_id}
                        onClick={() => router.push(`/projects/${item.thread_id}/thread/new`)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card',
                          'hover:bg-muted/40 hover:border-border/80 transition-colors text-left',
                          'active:scale-[0.995]',
                        )}
                      >
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <MessageCircle className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.thread_title || 'Untitled thread'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-muted-foreground truncate">
                              by {item.shared_by}
                            </span>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(item.shared_at)}
                            </span>
                          </div>
                        </div>
                        <Badge variant={roleBadgeVariant(item.role)} className="text-[10px] px-2 py-0.5">
                          {item.role}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Shared Agents */}
              {hasAgents && (
                <div className="space-y-2">
                  <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    Shared Agents
                  </h2>
                  <div className="space-y-1.5">
                    {data!.shared_agents.map((item) => (
                      <button
                        key={item.agent_id}
                        onClick={() => router.push(`/agents/config/${item.agent_id}`)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card',
                          'hover:bg-muted/40 hover:border-border/80 transition-colors text-left',
                          'active:scale-[0.995]',
                        )}
                      >
                        <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.agent_name || 'Unnamed agent'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-muted-foreground truncate">
                              by {item.shared_by}
                            </span>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {formatRelativeTime(item.shared_at)}
                            </span>
                          </div>
                        </div>
                        <Badge variant={roleBadgeVariant(item.role)} className="text-[10px] px-2 py-0.5">
                          {item.role}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
