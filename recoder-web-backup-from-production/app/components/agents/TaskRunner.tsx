import { useState } from 'react';
import type { Task } from '~/lib/agents/task-types';
import { classNames } from '~/utils/classNames';

interface TaskRunnerProps {
  task: Task;
  onApprove: () => void;
  onReject: () => void;
}

export function TaskRunner({ task, onApprove, onReject }: TaskRunnerProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-bolt-elements-borderColor rounded-lg overflow-hidden bg-bolt-elements-background-depth-2">
      <div className="px-4 py-3 bg-bolt-elements-background-depth-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="i-ph:robot text-lg text-bolt-elements-textSecondary" />
            <span className="text-sm font-medium text-bolt-elements-textPrimary">
              Task: {task.title}
            </span>
          </div>
          <button onClick={() => setIsExpanded(!isExpanded)}>
            <div className={classNames('i-ph:caret-down transition-transform', {
              'rotate-180': isExpanded,
            })} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4">
          <div className="space-y-2 mb-4">
            {task.steps.map((step, index) => (
              <div
                key={step.id}
                className="flex items-center gap-3 p-3 bg-bolt-elements-background-depth-1 rounded"
              >
                <div className="w-6 h-6 rounded-full bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text flex items-center justify-center text-xs">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-bolt-elements-textPrimary">
                    {step.action.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className={classNames({
                  'i-ph:clock text-bolt-elements-textTertiary': step.status === 'pending',
                  'i-ph:spinner animate-spin text-blue-500': step.status === 'running',
                  'i-ph:check-circle text-green-500': step.status === 'complete',
                  'i-ph:x-circle text-red-500': step.status === 'failed',
                })} />
              </div>
            ))}
          </div>

          {task.requiresApproval && task.status === 'pending' && (
            <div className="flex gap-2">
              <button
                onClick={onReject}
                className="flex-1 px-4 py-2 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-3"
              >
                Reject
              </button>
              <button
                onClick={onApprove}
                className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover"
              >
                Approve & Run
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
