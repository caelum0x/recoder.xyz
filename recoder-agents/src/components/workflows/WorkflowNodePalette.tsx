'use client';

import {
  Bot,
  Wrench,
  GitBranch,
  Repeat,
  Columns,
  Clock,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NodeTypeItem {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

const NODE_TYPES: NodeTypeItem[] = [
  {
    type: 'agent',
    label: 'Agent',
    description: 'Run an AI agent',
    icon: Bot,
    color: 'text-violet-600 dark:text-violet-400',
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'Execute a tool action',
    icon: Wrench,
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on a rule',
    icon: GitBranch,
    color: 'text-amber-600 dark:text-amber-400',
  },
  {
    type: 'loop',
    label: 'Loop',
    description: 'Repeat a set of steps',
    icon: Repeat,
    color: 'text-teal-600 dark:text-teal-400',
  },
  {
    type: 'parallel',
    label: 'Parallel',
    description: 'Run steps in parallel',
    icon: Columns,
    color: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait for a duration',
    icon: Clock,
    color: 'text-orange-600 dark:text-orange-400',
  },
  {
    type: 'approval',
    label: 'Approval',
    description: 'Require human approval',
    icon: ShieldCheck,
    color: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    type: 'input',
    label: 'Input',
    description: 'Workflow entry point',
    icon: ArrowDownToLine,
    color: 'text-sky-600 dark:text-sky-400',
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Workflow exit point',
    icon: ArrowUpFromLine,
    color: 'text-pink-600 dark:text-pink-400',
  },
];

export function WorkflowNodePalette() {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Node Types
      </h3>
      <div className="flex flex-col gap-1.5">
        {NODE_TYPES.map((item) => (
          <PaletteCard key={item.type} item={item} />
        ))}
      </div>
    </div>
  );
}

function PaletteCard({ item }: { item: NodeTypeItem }) {
  const Icon = item.icon;

  function onDragStart(event: React.DragEvent) {
    event.dataTransfer.setData('application/reactflow', item.type);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex cursor-grab items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-all',
        'hover:border-zinc-300 hover:shadow-sm active:cursor-grabbing',
        'dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600',
      )}
    >
      <div className={cn('shrink-0', item.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {item.label}
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {item.description}
        </p>
      </div>
    </div>
  );
}
