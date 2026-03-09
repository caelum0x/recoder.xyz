'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentNodeData {
  label: string;
  config: Record<string, unknown>;
  status?: 'idle' | 'running' | 'completed' | 'failed';
  [key: string]: unknown;
}

function AgentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const status = nodeData.status ?? 'idle';
  const model = nodeData.config?.model as string | undefined;

  return (
    <div
      className={cn(
        'rounded-lg border bg-white px-4 py-3 shadow-sm transition-shadow dark:bg-zinc-900',
        'min-w-[180px]',
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {nodeData.label}
            </span>
            <StatusIndicator status={status} />
          </div>
          {model && (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {model}
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

function StatusIndicator({ status }: { status: string }) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />;
  }

  const colors: Record<string, string> = {
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    idle: 'bg-zinc-300 dark:bg-zinc-600',
  };

  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', colors[status] ?? colors.idle)}
    />
  );
}

export const AgentNode = memo(AgentNodeComponent);
