'use client';

import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

interface Task {
  id: string;
  prompt?: string;
  state: string;
  assignee_agent_id?: string;
  approval?: {
    approvalId: string;
    status: string;
    action?: string;
    resolvedBy?: string;
  } | null;
  handoff?: {
    delegationId: string;
    status: string;
    toAgentId?: string;
  } | null;
  review?: {
    worktree?: {
      isolated?: boolean;
      reviewReady?: boolean;
      branchName?: string | null;
      baseBranch?: string | null;
      worktreePath?: string | null;
      changedFiles?: string[];
    } | null;
    handoff?: {
      status?: string | null;
      intent?: string | null;
      reviewTarget?: string | null;
      reviewPath?: string | null;
      assignedBy?: string | null;
    } | null;
    merge?: {
      status?: string | null;
      branchName?: string | null;
      baseBranch?: string | null;
      suggestedAction?: string | null;
      changedFiles?: string[];
    } | null;
  } | null;
  assignee?: {
    name?: string;
    registry?: {
      online: boolean;
    } | null;
    localBridgeSessions?: Array<unknown>;
    pairedBridgeSessions?: Array<{
      registry?: {
        online: boolean;
      } | null;
    }>;
  };
  runtime?: {
    evidenceCount?: number;
    previewCount?: number;
    artifactCount?: number;
    logCount?: number;
    runtimeCount?: number;
    filesChanged?: string[];
  };
  priority?: string;
  createdAt?: string;
}

interface TaskPipelineViewProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
}

const COLUMNS = [
  { key: 'submitted', label: 'Submitted', icon: Clock, color: 'border-t-gray-400' },
  { key: 'working', label: 'Working', icon: Loader2, color: 'border-t-blue-500' },
  { key: 'input-required', label: 'Input Required', icon: AlertTriangle, color: 'border-t-amber-500' },
  { key: 'completed', label: 'Completed', icon: CheckCircle, color: 'border-t-green-500' },
  { key: 'failed', label: 'Failed', icon: XCircle, color: 'border-t-red-500' },
];

export function TaskPipelineView({ tasks, onTaskClick }: TaskPipelineViewProps) {
  const copyToClipboard = async (label: string, value: string | null | undefined) => {
    if (!value) {
      toast.error(`No ${label.toLowerCase()} available`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const groupedTasks: Record<string, Task[]> = {};
  for (const col of COLUMNS) {
    groupedTasks[col.key] = [];
  }

  for (const task of tasks) {
    const state = task.state ?? 'submitted';
    const bucket = COLUMNS.find((c) => c.key === state) ? state : 'submitted';
    groupedTasks[bucket].push(task);
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">Task Pipeline</h3>

      <div className="grid grid-cols-5 gap-2">
        {COLUMNS.map((col) => {
          const Icon = col.icon;
          const colTasks = groupedTasks[col.key];

          return (
            <div key={col.key} className={cn('rounded-lg border border-t-4 p-2', col.color)}>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{col.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {colTasks.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-3">Empty</p>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="w-full rounded-md bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
                      onClick={() => onTaskClick?.(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onTaskClick?.(task.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <p className="text-xs truncate">{task.prompt ?? task.id}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {task.assignee_agent_id && (
                          <span className="text-[10px] text-muted-foreground">
                            {task.assignee?.name ?? task.assignee_agent_id}
                          </span>
                        )}
                        {task.assignee?.registry && (
                          <span
                            className={cn(
                              'text-[10px] rounded px-1 py-0.5',
                              task.assignee.registry.online
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
                            )}
                          >
                            {task.assignee.registry.online ? 'online' : 'offline'}
                          </span>
                        )}
                        {((task.assignee?.localBridgeSessions?.length ?? 0) + (task.assignee?.pairedBridgeSessions?.length ?? 0)) > 0 && (
                          <span className="text-[10px] rounded bg-cyan-100 px-1 py-0.5 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                            bridge:{(task.assignee?.localBridgeSessions?.length ?? 0) + (task.assignee?.pairedBridgeSessions?.length ?? 0)}
                          </span>
                        )}
                        {(task.assignee?.pairedBridgeSessions?.some((session) => session?.registry?.online === true) ?? false) && (
                          <span className="text-[10px] rounded bg-emerald-100 px-1 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            paired-healthy
                          </span>
                        )}
                        {task.approval && (
                          <span className="text-[10px] rounded bg-purple-100 px-1 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            approval:{task.approval.status}
                          </span>
                        )}
                        {task.handoff && (
                          <span className="text-[10px] rounded bg-amber-100 px-1 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            handoff:{task.handoff.status}
                          </span>
                        )}
                        {task.review?.merge?.status && (
                          <span className="text-[10px] rounded bg-orange-100 px-1 py-0.5 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            merge:{task.review.merge.status}
                          </span>
                        )}
                        {task.review?.worktree?.reviewReady && (
                          <span className="text-[10px] rounded bg-lime-100 px-1 py-0.5 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400">
                            review-ready
                          </span>
                        )}
                        {typeof task.runtime?.evidenceCount === 'number' && task.runtime.evidenceCount > 0 && (
                          <span className="text-[10px] rounded bg-blue-100 px-1 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            evidence:{task.runtime.evidenceCount}
                          </span>
                        )}
                        {typeof task.runtime?.previewCount === 'number' && task.runtime.previewCount > 0 && (
                          <span className="text-[10px] rounded bg-emerald-100 px-1 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            previews:{task.runtime.previewCount}
                          </span>
                        )}
                        {typeof task.runtime?.logCount === 'number' && task.runtime.logCount > 0 && (
                          <span className="text-[10px] rounded bg-slate-100 px-1 py-0.5 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
                            logs:{task.runtime.logCount}
                          </span>
                        )}
                      </div>
                      {task.review?.worktree?.branchName && (
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          review branch: {task.review.worktree.branchName}
                        </p>
                      )}
                      {task.review?.merge?.suggestedAction && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          action: {task.review.merge.suggestedAction}
                        </p>
                      )}
                      {task.review?.worktree?.branchName || task.review?.worktree?.worktreePath ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.review?.worktree?.branchName ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyToClipboard('Review branch', task.review?.worktree?.branchName);
                              }}
                            >
                              Copy branch
                            </Button>
                          ) : null}
                          {task.review?.worktree?.worktreePath ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyToClipboard('Worktree path', task.review?.worktree?.worktreePath);
                              }}
                            >
                              Copy path
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
