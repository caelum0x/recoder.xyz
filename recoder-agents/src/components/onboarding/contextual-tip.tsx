'use client';

import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ContextualTipProps {
  tipId: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function ContextualTip({ tipId, title, description, action }: ContextualTipProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`tip-${tipId}-dismissed`);
    if (dismissed) return;

    // Track view count — auto-hide after 3 views
    const viewCountStr = localStorage.getItem(`tip-${tipId}-views`) || '0';
    const viewCount = parseInt(viewCountStr, 10) + 1;
    localStorage.setItem(`tip-${tipId}-views`, String(viewCount));

    if (viewCount <= 3) {
      setIsVisible(true);
    }
  }, [tipId]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(`tip-${tipId}-dismissed`, 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 text-sm">
      <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-blue-900 dark:text-blue-100">{title}</p>
        <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">{description}</p>
        {action && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-blue-600 dark:text-blue-400 mt-1"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-blue-400 hover:text-blue-600"
        onClick={handleDismiss}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
