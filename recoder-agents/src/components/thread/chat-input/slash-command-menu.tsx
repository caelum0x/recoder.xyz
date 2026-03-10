'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, FileText, Download, Bot, Trash2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const SLASH_COMMANDS = [
  { name: 'search', description: 'Search knowledge base', icon: Search },
  { name: 'summarize', description: 'Summarize this thread', icon: FileText },
  { name: 'export', description: 'Export thread as document', icon: Download },
  { name: 'agent', description: 'Switch to a different agent', icon: Bot },
  { name: 'clear', description: 'Start a fresh context', icon: Trash2 },
  { name: 'help', description: 'Show available commands', icon: HelpCircle },
] as const;

export interface SlashCommandMenuProps {
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  visible: boolean;
}

export function SlashCommandMenu({ query, onSelect, onClose, visible }: SlashCommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 6);

  // Reset active index when query or visibility changes
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
        onSelect(filtered[activeIndex].name);
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

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in-0 slide-in-from-bottom-2 duration-150"
    >
      <div className="p-1">
        {filtered.map((cmd, index) => {
          const Icon = cmd.icon;
          return (
            <button
              key={cmd.name}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg transition-colors cursor-pointer',
                index === activeIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/50',
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(cmd.name)}
            >
              <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">/{cmd.name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {cmd.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
