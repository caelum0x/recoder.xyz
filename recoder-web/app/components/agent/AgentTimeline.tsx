/**
 * AgentTimeline - Vertical step-by-step progress indicator
 * Shows each phase of the agent with status icons and timing.
 */

import { memo } from 'react';
import type { AgentStep, AgentPhase } from '~/lib/stores/agent-session';
import { classNames } from '~/utils/classNames';

interface AgentTimelineProps {
  steps: AgentStep[];
  currentPhase: AgentPhase;
}

function getPhaseIcon(phase: AgentPhase, status: string): string {
  if (status === 'error') return 'i-ph:x-circle text-red-400';
  if (status === 'complete') return 'i-ph:check-circle text-green-400';
  if (status === 'active') return 'i-ph:circle-notch animate-spin text-purple-400';
  if (status === 'skipped') return 'i-ph:minus-circle text-bolt-elements-textTertiary';

  // Pending - show phase-specific icon
  switch (phase) {
    case 'analyzing': return 'i-ph:magnifying-glass text-bolt-elements-textTertiary';
    case 'planning': return 'i-ph:list-checks text-bolt-elements-textTertiary';
    case 'executing': return 'i-ph:code text-bolt-elements-textTertiary';
    case 'verifying': return 'i-ph:check-square text-bolt-elements-textTertiary';
    case 'fixing': return 'i-ph:wrench text-bolt-elements-textTertiary';
    case 'reviewing': return 'i-ph:eye text-bolt-elements-textTertiary';
    default: return 'i-ph:circle text-bolt-elements-textTertiary';
  }
}

function formatDuration(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '';
  const end = completedAt || Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const AgentTimeline = memo(({ steps, currentPhase }: AgentTimelineProps) => {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start gap-2.5 px-3 py-1.5">
          {/* Vertical line connector */}
          <div className="flex flex-col items-center">
            <div className={classNames('text-lg', getPhaseIcon(step.phase, step.status))} />
            {index < steps.length - 1 && (
              <div
                className={classNames(
                  'w-px h-4 mt-0.5',
                  step.status === 'complete' ? 'bg-green-400/30' : 'bg-bolt-elements-borderColor',
                )}
              />
            )}
          </div>

          {/* Step content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={classNames(
                  'text-xs font-medium truncate',
                  step.status === 'active' ? 'text-purple-400' :
                  step.status === 'complete' ? 'text-bolt-elements-textPrimary' :
                  step.status === 'error' ? 'text-red-400' :
                  'text-bolt-elements-textTertiary',
                )}
              >
                {step.label}
              </span>
              {step.startedAt && (
                <span className="text-[10px] text-bolt-elements-textTertiary flex-shrink-0">
                  {formatDuration(step.startedAt, step.completedAt)}
                </span>
              )}
            </div>
            {step.detail && (
              <p className="text-[10px] text-bolt-elements-textTertiary mt-0.5 truncate">
                {step.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

AgentTimeline.displayName = 'AgentTimeline';
