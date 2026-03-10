'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Plus,
  MessageSquare,
  BarChart3,
  Settings,
  Zap,
  BookOpen,
} from 'lucide-react';

interface QuickActionsWidgetProps {
  config: Record<string, any>;
}

const DEFAULT_ACTIONS = [
  { label: 'New Thread', icon: MessageSquare, href: '/projects/new/thread/new' },
  { label: 'New Agent', icon: Plus, href: '/agents' },
  { label: 'Analytics', icon: BarChart3, href: '/activity' },
  { label: 'Knowledge', icon: BookOpen, href: '/knowledge' },
  { label: 'Triggers', icon: Zap, href: '/agents' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

export function QuickActionsWidget({ config }: QuickActionsWidgetProps) {
  const router = useRouter();
  const actions = config?.actions ?? DEFAULT_ACTIONS;

  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map((action: any, i: number) => {
        const Icon =
          DEFAULT_ACTIONS.find((a) => a.label === action.label)?.icon ?? Zap;
        return (
          <Button
            key={i}
            variant="outline"
            size="sm"
            className="flex h-auto flex-col gap-1 py-3 text-xs"
            onClick={() => router.push(action.href)}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
