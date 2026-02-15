/**
 * AgentActions - Accept All / Reject All / Accept Selected / Undo All buttons
 */

import { memo, useMemo } from 'react';
import type { AgentFileChange, AgentPhase } from '~/lib/stores/agent-session';
import { classNames } from '~/utils/classNames';

interface AgentActionsProps {
  phase: AgentPhase;
  fileChanges: AgentFileChange[];
  onAccept: () => void;
  onReject: () => void;
  onInterrupt: () => void;
  onDismiss: () => void;
}

export const AgentActions = memo(({
  phase,
  fileChanges,
  onAccept,
  onReject,
  onInterrupt,
  onDismiss,
}: AgentActionsProps) => {
  const selectedCount = useMemo(() => fileChanges.filter((f) => f.selected).length, [fileChanges]);
  const totalCount = fileChanges.length;
  const isRunning = ['analyzing', 'planning', 'executing', 'verifying', 'fixing'].includes(phase);
  const isReviewable = phase === 'reviewing' || phase === 'complete';

  // Running state - show interrupt button
  if (isRunning) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        <button
          onClick={onInterrupt}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <div className="i-ph:stop-circle text-sm" />
          Interrupt
        </button>
        <span className="text-[10px] text-bolt-elements-textTertiary ml-auto">
          Agent is working...
        </span>
      </div>
    );
  }

  // Error/interrupted state - show dismiss
  if (phase === 'error' || phase === 'interrupted') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 transition-colors"
        >
          Dismiss
        </button>
        {totalCount > 0 && (
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <div className="i-ph:arrow-counter-clockwise text-sm" />
            Undo All Changes
          </button>
        )}
      </div>
    );
  }

  // Review state - show accept/reject
  if (isReviewable) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        {/* Reject / Undo */}
        <button
          onClick={onReject}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <div className="i-ph:arrow-counter-clockwise text-sm" />
          Undo All
        </button>

        <div className="flex-1" />

        {/* Accept */}
        <button
          onClick={onAccept}
          disabled={selectedCount === 0}
          className={classNames(
            'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md transition-colors',
            selectedCount > 0
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-not-allowed',
          )}
        >
          <div className="i-ph:check text-sm" />
          {selectedCount === totalCount
            ? 'Accept All'
            : `Accept ${selectedCount}/${totalCount}`}
        </button>
      </div>
    );
  }

  // Idle state
  return null;
});

AgentActions.displayName = 'AgentActions';
