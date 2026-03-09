'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Wrench,
  Repeat,
  Columns,
  Clock,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GenericNodeData {
  label: string;
  config: Record<string, unknown>;
  nodeType: string;
  [key: string]: unknown;
}

const NODE_META: Record<
  string,
  { icon: LucideIcon; color: string; bgColor: string }
> = {
  tool: {
    icon: Wrench,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  loop: {
    icon: Repeat,
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
  },
  parallel: {
    icon: Columns,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  delay: {
    icon: Clock,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  approval: {
    icon: ShieldCheck,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  input: {
    icon: ArrowDownToLine,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
  },
  output: {
    icon: ArrowUpFromLine,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
  },
};

const FALLBACK_META = {
  icon: Wrench,
  color: 'text-zinc-600 dark:text-zinc-400',
  bgColor: 'bg-zinc-100 dark:bg-zinc-800',
};

function GenericNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GenericNodeData;
  const meta = NODE_META[nodeData.nodeType] ?? FALLBACK_META;
  const Icon = meta.icon;

  const duration = nodeData.nodeType === 'delay'
    ? (nodeData.config?.duration as string | undefined)
    : undefined;

  return (
    <div
      className={cn(
        'rounded-lg border bg-white px-4 py-3 shadow-sm transition-shadow dark:bg-zinc-900',
        'min-w-[160px]',
        selected
          ? 'border-blue-500 shadow-md ring-2 ring-blue-200 dark:ring-blue-700/30'
          : 'border-zinc-200 dark:border-zinc-700',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400 dark:!border-zinc-900"
      />

      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            meta.bgColor,
            meta.color,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {nodeData.label}
            </span>
            {nodeData.nodeType === 'approval' && (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
          </div>
          {duration && (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {duration}
            </p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400 dark:!border-zinc-900"
      />
    </div>
  );
}

export const GenericNode = memo(GenericNodeComponent);
