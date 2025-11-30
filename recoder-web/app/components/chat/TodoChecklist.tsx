import { useState } from 'react';
import { classNames } from '~/utils/classNames';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  inProgress: boolean;
}

interface TodoChecklistProps {
  items: TodoItem[];
  onToggle?: (id: string) => void;
}

export function TodoChecklist({ items, onToggle }: TodoChecklistProps) {
  const completedCount = items.filter((item) => item.completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return (
    <div className="border border-bolt-elements-borderColor rounded-lg overflow-hidden bg-bolt-elements-background-depth-2">
      <div className="px-4 py-3 bg-bolt-elements-background-depth-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-bolt-elements-textPrimary">
            Task Progress
          </span>
          <span className="text-sm text-bolt-elements-textSecondary">
            {completedCount}/{items.length}
          </span>
        </div>
        <div className="w-full h-2 bg-bolt-elements-background-depth-1 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-4 space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onToggle?.(item.id)}
            className="w-full flex items-center gap-3 p-2 rounded hover:bg-bolt-elements-background-depth-3 transition-colors text-left"
          >
            <div
              className={classNames(
                'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                item.completed
                  ? 'bg-green-500 border-green-500'
                  : item.inProgress
                    ? 'bg-blue-500/20 border-blue-500'
                    : 'border-bolt-elements-borderColor'
              )}
            >
              {item.completed && <div className="i-ph:check text-white text-sm" />}
              {item.inProgress && !item.completed && (
                <div className="i-ph:spinner animate-spin text-blue-500 text-sm" />
              )}
            </div>
            <span
              className={classNames(
                'text-sm',
                item.completed
                  ? 'line-through text-bolt-elements-textTertiary'
                  : 'text-bolt-elements-textPrimary'
              )}
            >
              {item.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
