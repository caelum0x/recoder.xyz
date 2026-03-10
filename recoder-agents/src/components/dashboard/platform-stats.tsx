'use client';

import { usePlatformStats } from '@/hooks/platform/use-platform-activity';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Bot, MessageSquare, GitBranch, Activity } from 'lucide-react';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STAT_CARDS = [
  { key: 'agent_count', label: 'Agents', icon: Bot },
  { key: 'threads_7d', label: 'Threads (7d)', icon: MessageSquare },
  { key: 'workflow_count', label: 'Workflows', icon: GitBranch },
  { key: 'runs_today', label: 'Runs Today', icon: Activity },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlatformStats() {
  const { data, isLoading } = usePlatformStats();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {STAT_CARDS.map(({ key, label, icon: Icon }) => (
        <SpotlightCard key={key} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
          </div>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-7 w-12 animate-pulse rounded bg-muted" />
            ) : (
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {data?.[key] ?? 0}
              </span>
            )}
          </div>
        </SpotlightCard>
      ))}
    </div>
  );
}
