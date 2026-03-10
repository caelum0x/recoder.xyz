'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgents } from '@/hooks/agents/use-agents';

export interface MentionMenuProps {
  query: string;
  onSelect: (agent: { id: string; name: string }) => void;
  onClose: () => void;
  visible: boolean;
}

export function MentionMenu({ query, onSelect, onClose, visible }: MentionMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: agentsResponse, isLoading } = useAgents({}, { enabled: visible });
  const agents = Array.isArray(agentsResponse?.agents) ? agentsResponse.agents : [];

  const filtered = agents
    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, visible]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect({ id: filtered[activeIndex].agent_id, name: filtered[activeIndex].name });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [visible, filtered, activeIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (visible) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in-0 slide-in-from-bottom-2 duration-150"
    >
      <div className="p-1">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading agents...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No agents found
          </div>
        ) : (
          filtered.map((agent, index) => (
            <button
              key={agent.agent_id}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg transition-colors cursor-pointer',
                index === activeIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/50',
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect({ id: agent.agent_id, name: agent.name })}
            >
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: agent.icon_background || 'hsl(var(--muted))',
                  color: agent.icon_color || 'hsl(var(--muted-foreground))',
                }}
              >
                <Bot className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium truncate">{agent.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
