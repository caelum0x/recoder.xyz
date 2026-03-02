'use client';

import { useState, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useDispatchStatus, useCancelDispatch, useDispatchTracker } from '@/hooks/tasks/use-multi-dispatch';
import type { DispatchRecord } from '@recoder/shared/a2a';

interface DispatchTrackerProps {
  dispatchId: string;
  workspaceId: string;
}

type TaskProgress = Record<string, { status: string; data?: Record<string, unknown> }>;

export function DispatchTracker({ dispatchId, workspaceId }: DispatchTrackerProps) {
  const { data: dispatch } = useDispatchStatus(dispatchId, workspaceId);
  const cancelDispatch = useCancelDispatch();
  const [taskProgress, setTaskProgress] = useState<TaskProgress>({});

  const handleTaskProgress = useCallback((taskId: string, data: Record<string, unknown>) => {
    setTaskProgress((prev) => ({ ...prev, [taskId]: { status: 'working', data } }));
  }, []);

  const handleTaskCompleted = useCallback((taskId: string, data: Record<string, unknown>) => {
    setTaskProgress((prev) => ({ ...prev, [taskId]: { status: 'completed', data } }));
  }, []);

  const handleTaskFailed = useCallback((taskId: string, data: Record<string, unknown>) => {
    setTaskProgress((prev) => ({ ...prev, [taskId]: { status: 'failed', data } }));
  }, []);

  useDispatchTracker(dispatch ?? null, {
    onTaskProgress: handleTaskProgress,
    onTaskCompleted: handleTaskCompleted,
    onTaskFailed: handleTaskFailed,
  });

  if (!dispatch) return null;

  const isRunning = dispatch.status === 'running' || dispatch.status === 'pending';

  return (
    <div className="border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DispatchStatusIcon status={dispatch.status} />
          <div>
            <h4 className="text-sm font-medium">
              {dispatch.orchestrationPattern} dispatch
            </h4>
            <p className="text-xs text-muted-foreground">
              {dispatch.agentIds.length} agent{dispatch.agentIds.length !== 1 ? 's' : ''}
              {' · '}
              {dispatch.taskIds.filter((t) => taskProgress[t]?.status === 'completed').length}/
              {dispatch.taskIds.length} completed
            </p>
          </div>
        </div>

        {isRunning && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelDispatch.mutate({ wsId: workspaceId, dispatchId })}
            disabled={cancelDispatch.isPending}
          >
            <StopCircle className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
      </div>

      {/* Prompt preview */}
      <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 truncate">
        {dispatch.prompt}
      </p>

      {/* Per-agent status */}
      <div className="space-y-1">
        {dispatch.taskIds.map((taskId, idx) => {
          const agentId = dispatch.agentIds[idx] ?? 'unknown';
          const progress = taskProgress[taskId];
          const status = progress?.status ?? 'pending';
          const routingReason = getRoutingReason(dispatch, idx);

          return (
            <div key={taskId} className="px-2 py-1 rounded-md bg-muted/30">
              <div className="flex items-center gap-2">
                <TaskStatusDot status={status} />
                <span className="text-xs font-medium truncate">{agentId}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{status}</span>
              </div>
              {routingReason && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 ml-4 leading-tight">
                  {routingReason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Extract the routing reason for an agent at the given index from the
 * dispatch record's routingReasons map (populated during auto-routing).
 */
function getRoutingReason(dispatch: DispatchRecord, agentIndex: number): string | undefined {
  if (!dispatch.routingReasons) return undefined;
  const agentId = dispatch.agentIds[agentIndex];
  if (!agentId) return undefined;
  return dispatch.routingReasons[agentId];
}

function DispatchStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
    case 'pending':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'cancelled':
      return <StopCircle className="h-5 w-5 text-gray-500" />;
    default:
      return <Loader2 className="h-5 w-5 text-muted-foreground" />;
  }
}

function TaskStatusDot({ status }: { status: string }) {
  return (
    <div
      className={cn(
        'h-2 w-2 rounded-full shrink-0',
        status === 'pending' && 'bg-gray-400',
        status === 'working' && 'bg-blue-500 animate-pulse',
        status === 'completed' && 'bg-green-500',
        status === 'failed' && 'bg-red-500',
      )}
    />
  );
}
