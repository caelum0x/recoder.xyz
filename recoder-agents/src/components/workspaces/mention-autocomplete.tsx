'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAgentTeamStore, type AgentTeamMember } from '@/stores/agent-team-store';

interface MentionAutocompleteProps {
  query: string;
  onSelect: (agentId: string, agentName: string) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  working: 'bg-blue-500',
  idle: 'bg-yellow-500',
  error: 'bg-red-500',
  offline: 'bg-gray-400',
};

export function MentionAutocomplete({ query, onSelect, onClose }: MentionAutocompleteProps) {
  const agents = useAgentTeamStore((s) => s.agents);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = agents.filter(
    (a) =>
      !query ||
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.agentId.toLowerCase().includes(query.toLowerCase()),
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="bg-popover border rounded-lg shadow-lg overflow-hidden"
    >
      <div className="px-3 py-1.5 border-b">
        <span className="text-xs font-medium text-muted-foreground">Mention an agent</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((agent) => (
          <AgentOption
            key={agent.agentId}
            agent={agent}
            onSelect={() => onSelect(agent.agentId, agent.name)}
          />
        ))}
      </div>
    </div>
  );
}

function AgentOption({
  agent,
  onSelect,
}: {
  agent: AgentTeamMember;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 w-full text-left transition-colors"
      onClick={onSelect}
    >
      <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
        {agent.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{agent.name}</span>
          <div className={cn('h-1.5 w-1.5 rounded-full', STATUS_COLORS[agent.status])} />
        </div>
        <span className="text-[10px] text-muted-foreground">{agent.platform}</span>
      </div>
      {agent.currentTaskTitle && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
          {agent.currentTaskTitle}
        </span>
      )}
    </button>
  );
}
