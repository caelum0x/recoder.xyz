'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConditionNodeData {
  label: string;
  config: Record<string, unknown>;
  [key: string]: unknown;
}

function ConditionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const expression = nodeData.config?.expression as string | undefined;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        'h-[120px] w-[120px]',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400 dark:!border-zinc-900"
      />

      {/* Diamond background */}
      <div
        className={cn(
          'absolute inset-2 rotate-45 rounded-md border bg-white shadow-sm transition-shadow dark:bg-zinc-900',
          selected
            ? 'border-blue-500 shadow-md ring-2 ring-blue-200 dark:ring-blue-700/30'
            : 'border-amber-300 dark:border-amber-600',
        )}
      />

      {/* Content (not rotated) */}
      <div className="relative z-10 flex flex-col items-center gap-1 text-center">
        <GitBranch className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <span className="max-w-[80px] truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
          {nodeData.label}
        </span>
        {expression && (
          <span className="max-w-[80px] truncate text-[10px] text-zinc-500 dark:text-zinc-400">
            {expression}
          </span>
        )}
      </div>

      {/* True branch handle — bottom-left */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!-translate-x-4 !h-3 !w-3 !border-2 !border-white !bg-green-500 dark:!border-zinc-900"
      />

      {/* False branch handle — bottom-right */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!translate-x-4 !h-3 !w-3 !border-2 !border-white !bg-red-500 dark:!border-zinc-900"
      />
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
