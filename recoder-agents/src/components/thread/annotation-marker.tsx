'use client';

import React, { useState } from 'react';
import {
  StickyNote,
  Highlighter,
  HelpCircle,
  CheckSquare,
  Bug,
  Lightbulb,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { AnnotationType, ThreadAnnotation } from '@/lib/api/thread-annotations';

interface AnnotationMarkerProps {
  annotations: ThreadAnnotation[];
  onClick?: () => void;
}

const TYPE_ICONS: Record<AnnotationType, React.ComponentType<any>> = {
  note: StickyNote,
  highlight: Highlighter,
  question: HelpCircle,
  action: CheckSquare,
  bug: Bug,
  insight: Lightbulb,
  warning: Bug,
  action_item: CheckSquare,
};

const TYPE_COLORS: Record<AnnotationType, string> = {
  note: 'text-yellow-500',
  highlight: 'text-blue-500',
  question: 'text-purple-500',
  action: 'text-green-500',
  bug: 'text-red-500',
  insight: 'text-orange-500',
  warning: 'text-amber-500',
  action_item: 'text-emerald-500',
};

const TYPE_LABELS: Record<AnnotationType, string> = {
  note: 'Note',
  highlight: 'Highlight',
  question: 'Question',
  action: 'Action',
  bug: 'Bug',
  insight: 'Insight',
  warning: 'Warning',
  action_item: 'Action Item',
};

export function AnnotationMarker({ annotations, onClick }: AnnotationMarkerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!annotations || annotations.length === 0) return null;

  // Use the color of the first annotation for the dot
  const primaryColor = annotations[0].color || '#fbbf24';

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center h-4 w-4 cursor-pointer group"
          onClick={handleClick}
          title={`${annotations.length} annotation${annotations.length > 1 ? 's' : ''}`}
        >
          <span
            className="absolute h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-125"
            style={{ backgroundColor: primaryColor }}
          />
          {annotations.length > 1 && (
            <span className="absolute -top-1 -right-1.5 text-[9px] font-bold text-foreground bg-background rounded-full h-3 w-3 flex items-center justify-center border border-border">
              {annotations.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        side="left"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 border-b border-border">
          <span className="text-xs font-medium">
            {annotations.length} annotation{annotations.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {annotations.map((annotation) => {
            const Icon = TYPE_ICONS[annotation.annotation_type] || StickyNote;
            const typeColor = TYPE_COLORS[annotation.annotation_type] || 'text-muted-foreground';
            return (
              <div
                key={annotation.id}
                className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: annotation.color }}
                  />
                  <Icon className={`h-3.5 w-3.5 ${typeColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed line-clamp-2">
                    {annotation.content}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1 py-0"
                    >
                      {TYPE_LABELS[annotation.annotation_type]}
                    </Badge>
                    {annotation.is_resolved && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 text-green-600"
                      >
                        Resolved
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
