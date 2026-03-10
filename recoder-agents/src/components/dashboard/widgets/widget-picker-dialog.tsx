'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  MessageSquare,
  Activity,
  Zap,
  StickyNote,
  LayoutGrid,
  Heart,
  Calendar,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { useCreateWidget } from '@/hooks/dashboard/use-dashboard-widgets';
import type { CreateWidgetData } from '@/lib/api/dashboard-widgets';

interface WidgetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WIDGET_OPTIONS: {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaults: Partial<CreateWidgetData>;
}[] = [
  {
    type: 'stats_card',
    label: 'Stats Card',
    description: 'Configurable stat display with trend arrows.',
    icon: LayoutGrid,
    defaults: { title: 'Platform Stats', width: 2, height: 1 },
  },
  {
    type: 'chart',
    label: 'Chart',
    description: 'Mini area chart showing runs or cost trends.',
    icon: BarChart3,
    defaults: { title: 'Runs Over Time', width: 2, height: 1 },
  },
  {
    type: 'recent_threads',
    label: 'Recent Threads',
    description: 'Last 5 threads with agent name and timestamp.',
    icon: MessageSquare,
    defaults: { title: 'Recent Threads', width: 2, height: 1 },
  },
  {
    type: 'active_runs',
    label: 'Active Runs',
    description: 'Currently running agents with live pulse indicator.',
    icon: Activity,
    defaults: { title: 'Active Runs', width: 1, height: 1 },
  },
  {
    type: 'agent_health',
    label: 'Agent Health',
    description: 'Health status overview for all agents.',
    icon: ShieldCheck,
    defaults: { title: 'Agent Health', width: 1, height: 1 },
  },
  {
    type: 'cost_summary',
    label: 'Cost Summary',
    description: 'Monthly cost breakdown and budget tracking.',
    icon: DollarSign,
    defaults: { title: 'Cost Summary', width: 1, height: 1 },
  },
  {
    type: 'quick_actions',
    label: 'Quick Actions',
    description: 'Grid of action buttons for common tasks.',
    icon: Zap,
    defaults: { title: 'Quick Actions', width: 1, height: 1 },
  },
  {
    type: 'bookmarks',
    label: 'Bookmarks',
    description: 'Saved threads and agents for quick access.',
    icon: Heart,
    defaults: { title: 'Bookmarks', width: 1, height: 1 },
  },
  {
    type: 'calendar',
    label: 'Calendar',
    description: 'Upcoming scheduled agent runs.',
    icon: Calendar,
    defaults: { title: 'Calendar', width: 1, height: 1 },
  },
  {
    type: 'notes',
    label: 'Notes',
    description: 'Personal notes, auto-saved as you type.',
    icon: StickyNote,
    defaults: { title: 'Notes', width: 1, height: 1 },
  },
];

export function WidgetPickerDialog({
  open,
  onOpenChange,
}: WidgetPickerDialogProps) {
  const createWidget = useCreateWidget();

  const handleAdd = (option: (typeof WIDGET_OPTIONS)[number]) => {
    createWidget.mutate(
      {
        widget_type: option.type,
        title: option.defaults.title ?? option.label,
        width: option.defaults.width,
        height: option.defaults.height,
        config: {},
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {WIDGET_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                onClick={() => handleAdd(option)}
                disabled={createWidget.isPending}
                className="flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
