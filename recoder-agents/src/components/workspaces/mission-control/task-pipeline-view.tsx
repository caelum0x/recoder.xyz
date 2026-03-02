'use client';

import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  prompt?: string;
  state: string;
  assignee_agent_id?: string;
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
                    <button
                      key={task.id}
                      className="w-full text-left p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      onClick={() => onTaskClick?.(task.id)}
                    >
                      <p className="text-xs truncate">{task.prompt ?? task.id}</p>
                      {task.assignee_agent_id && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {task.assignee_agent_id}
                        </p>
                      )}
                    </button>
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
