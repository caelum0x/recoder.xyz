'use client';

import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { Activity, Pause, AlertTriangle, Bot } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface AgentStatusSummary {
  total: number;
  active: number;
  idle: number;
  errored: number;
}

function useAgentStatusSummary() {
  return useQuery({
    queryKey: ['agent-status-summary'],
    queryFn: async (): Promise<AgentStatusSummary> => {
      // Fetch all agent analytics to compute status
      try {
        const response = await backendApi.get<any[]>(
          '/agents/leaderboard?metric=runs&limit=50',
          { showErrors: false }
        );
        const agents = Array.isArray(response.data) ? response.data : [];

        // Count by status based on total_runs and success_rate
        let active = 0;
        let errored = 0;
        let idle = 0;

        for (const agent of agents) {
          if (agent.total_runs > 0 && agent.success_rate < 50) {
            errored++;
          } else if (agent.total_runs > 0) {
            active++;
          } else {
            idle++;
          }
        }

        return { total: agents.length, active, idle, errored };
      } catch {
        return { total: 0, active: 0, idle: 0, errored: 0 };
      }
    },
    staleTime: 120_000,
  });
}

const statusCards = [
  {
    key: 'total',
    label: 'Total Agents',
    icon: Bot,
    color: 'text-foreground',
    bgColor: 'bg-muted',
    href: '/agents',
  },
  {
    key: 'active',
    label: 'Active',
    icon: Activity,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    href: '/agents',
  },
  {
    key: 'idle',
    label: 'Idle',
    icon: Pause,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    href: '/agents',
  },
  {
    key: 'errored',
    label: 'Needs Attention',
    icon: AlertTriangle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    href: '/agents',
  },
] as const;

export function AgentStatusCards() {
  const { data, isLoading } = useAgentStatusSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.total === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {statusCards.map((card) => {
        const value = data[card.key as keyof AgentStatusSummary];
        const Icon = card.icon;
        return (
          <Link
            key={card.key}
            href={card.href}
            className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent transition-colors"
          >
            <div className={cn('rounded-md p-2', card.bgColor)}>
              <Icon className={cn('h-4 w-4', card.color)} />
            </div>
            <div>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
