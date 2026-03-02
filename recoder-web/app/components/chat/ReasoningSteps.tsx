import { useState } from 'react';
import type { ReasoningStep } from '~/lib/ai/reasoning-types';
import { classNames } from '~/utils/classNames';

interface ReasoningStepsProps {
  steps: ReasoningStep[];
}

export function ReasoningSteps({ steps }: ReasoningStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className="mb-4 border border-recoder-elements-borderColor rounded-lg overflow-hidden bg-recoder-elements-background-depth-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-recoder-elements-background-depth-3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="i-ph:brain text-lg text-recoder-elements-textSecondary" />
          <span className="text-sm font-medium text-recoder-elements-textPrimary">
            AI Reasoning ({steps.length} steps)
          </span>
        </div>
        <div className={classNames('i-ph:caret-down text-lg transition-transform', {
          'rotate-180': isExpanded,
        })} />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex gap-3 p-3 bg-recoder-elements-background-depth-1 rounded"
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-recoder-elements-button-primary-background text-recoder-elements-button-primary-text flex items-center justify-center text-xs font-medium">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-recoder-elements-textPrimary">
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-xs text-recoder-elements-textSecondary mt-1">
                    {step.description}
                  </div>
                )}
                {step.duration && (
                  <div className="text-xs text-recoder-elements-textTertiary mt-1">
                    {step.duration}ms
                  </div>
                )}
              </div>
              <div className={classNames('flex-shrink-0', {
                'i-ph:check-circle text-green-500': step.status === 'complete',
                'i-ph:spinner text-blue-500 animate-spin': step.status === 'thinking',
                'i-ph:x-circle text-red-500': step.status === 'error',
              })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
