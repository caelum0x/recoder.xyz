'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  { label: 'Analyze codebase', text: 'Analyze this codebase and give me an overview of the architecture' },
  { label: 'Write tests', text: 'Write comprehensive unit tests for ' },
  { label: 'Create workflow', text: 'Help me create a workflow that ' },
  { label: 'Search knowledge', text: 'Search my knowledge base for ' },
  { label: 'Debug issue', text: 'Help me debug this issue: ' },
  { label: 'Code review', text: 'Review this code and suggest improvements: ' },
];

export interface SuggestionChipsProps {
  onSelect: (text: string) => void;
  visible: boolean;
}

export function SuggestionChips({ onSelect, visible }: SuggestionChipsProps) {
  if (!visible) return null;

  return (
    <div className="w-full overflow-x-auto scrollbar-none mb-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            onClick={() => onSelect(suggestion.text)}
            className={cn(
              'flex-shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-full',
              'border border-border/60 bg-background/80 text-muted-foreground',
              'hover:bg-accent hover:text-accent-foreground hover:border-border',
              'transition-all duration-150 cursor-pointer whitespace-nowrap',
            )}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}
