'use client';

import { cn } from '@/lib/utils';
import type { AgentTeamMember } from '@/stores/agent-team-store';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  working: 'bg-blue-500 animate-pulse',
  idle: 'bg-yellow-500',
  error: 'bg-red-500',
  offline: 'bg-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  working: 'Working',
  idle: 'Idle',
  error: 'Error',
  offline: 'Offline',
};

const PLATFORM_BADGES: Record<string, { label: string; color: string }> = {
  claude_code: { label: 'Claude', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  codex: { label: 'Codex', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cursor: { label: 'Cursor', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  windsurf: { label: 'Windsurf', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  replit: { label: 'Replit', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  custom: { label: 'Custom', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
};

interface AgentStatusCardProps {
  agent: AgentTeamMember;
  onClick?: () => void;
  compact?: boolean;
}

export function AgentStatusCard({ agent, onClick, compact }: AgentStatusCardProps) {
  const badge = PLATFORM_BADGES[agent.platform] ?? PLATFORM_BADGES.custom;

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 rounded-md cursor-pointer transition-colors"
        onClick={onClick}
      >
        <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_COLORS[agent.status])} />
        <span className="text-sm truncate">{agent.name}</span>
        {agent.isLocal && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
            Local
          </span>
        )}
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full ml-auto', badge.color)}>
          {badge.label}
        </span>
      </div>
    );
  }

  return (
    <div
      className="p-3 rounded-xl border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-sm font-medium shrink-0">
          {agent.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{agent.name}</span>
            <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_COLORS[agent.status])} />
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', badge.color)}>
              {badge.label}
            </span>
            {agent.isLocal && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                Local
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {STATUS_LABELS[agent.status]}
            </span>
          </div>

          {agent.currentTaskTitle && (
            <p className="text-xs text-muted-foreground mt-1.5 truncate">
              Working on: {agent.currentTaskTitle}
            </p>
          )}

          {agent.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {agent.skills.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {skill}
                </span>
              ))}
              {agent.skills.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{agent.skills.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
