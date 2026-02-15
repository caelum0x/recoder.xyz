/**
 * AgentPanel - Main Agent Mode UI
 *
 * Combines AgentTimeline (phase progress), plan view, streaming text,
 * AgentDiffReview (multi-file diff), and AgentActions (accept/reject).
 *
 * Renders as an overlay/panel within the Workbench, similar to ProposalView.
 */

import { memo, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { agentSessionStore, agentSessionActive, getSessionStats } from '~/lib/stores/agent-session';
import { useAgentSession } from '~/lib/hooks/useAgentSession';
import { AgentTimeline } from './AgentTimeline';
import { AgentDiffReview } from './AgentDiffReview';
import { AgentActions } from './AgentActions';
import { classNames } from '~/utils/classNames';

export const AgentPanel = memo(() => {
  const session = useStore(agentSessionStore);
  const isActive = useStore(agentSessionActive);
  const { acceptChanges, rejectChanges, interrupt, dismiss } = useAgentSession();

  const stats = useMemo(() => getSessionStats(), [session.completedAt, session.fileChanges.length]);

  if (!isActive) return null;

  const isRunning = ['analyzing', 'planning', 'executing', 'verifying', 'fixing'].includes(session.phase);
  const isReviewable = session.phase === 'reviewing' || session.phase === 'complete';
  const hasError = session.phase === 'error';
  const wasInterrupted = session.phase === 'interrupted';

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1 border-l border-bolt-elements-borderColor">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-bolt-elements-borderColor">
        <div className="i-ph:robot text-lg text-purple-400" />
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium text-bolt-elements-textPrimary truncate">
            Agent Mode
          </h3>
          <p className="text-[10px] text-bolt-elements-textTertiary truncate">
            {session.prompt.slice(0, 60)}{session.prompt.length > 60 ? '...' : ''}
          </p>
        </div>

        {/* Phase badge */}
        <span
          className={classNames(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            isRunning && 'bg-purple-500/15 text-purple-400',
            isReviewable && 'bg-green-500/15 text-green-400',
            hasError && 'bg-red-500/15 text-red-400',
            wasInterrupted && 'bg-yellow-500/15 text-yellow-400',
            session.phase === 'idle' && 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary',
          )}
        >
          {session.phase === 'reviewing' ? 'Review' :
           session.phase === 'complete' ? 'Done' :
           session.phase.charAt(0).toUpperCase() + session.phase.slice(1)}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Timeline */}
        <div className="border-b border-bolt-elements-borderColor">
          <AgentTimeline steps={session.steps} currentPhase={session.phase} />
        </div>

        {/* Plan (when available) */}
        {session.plan && (
          <div className="border-b border-bolt-elements-borderColor px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="i-ph:list-checks text-sm text-bolt-elements-textSecondary" />
              <h4 className="text-xs font-medium text-bolt-elements-textPrimary">
                {session.plan.title}
              </h4>
            </div>
            <p className="text-[10px] text-bolt-elements-textTertiary mb-2">
              {session.plan.summary}
            </p>
            <div className="flex flex-col gap-0.5">
              {session.plan.steps.map((step) => (
                <div key={step.id} className="flex items-start gap-1.5">
                  <div
                    className={classNames(
                      'text-[10px] mt-0.5',
                      step.status === 'complete' ? 'i-ph:check text-green-400' :
                      step.status === 'error' ? 'i-ph:x text-red-400' :
                      'i-ph:dot-outline text-bolt-elements-textTertiary',
                    )}
                  />
                  <span
                    className={classNames(
                      'text-[10px]',
                      step.status === 'complete' ? 'text-bolt-elements-textSecondary line-through' :
                      'text-bolt-elements-textTertiary',
                    )}
                  >
                    {step.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Streaming text (during active phases) */}
        {isRunning && session.streamingText && (
          <div className="px-3 py-2 border-b border-bolt-elements-borderColor">
            <p className="text-[10px] text-bolt-elements-textTertiary font-mono whitespace-pre-wrap">
              {session.streamingText}
            </p>
          </div>
        )}

        {/* Shell commands (during execution) */}
        {session.shellCommands.length > 0 && (
          <div className="border-b border-bolt-elements-borderColor px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="i-ph:terminal text-sm text-bolt-elements-textSecondary" />
              <h4 className="text-xs font-medium text-bolt-elements-textPrimary">
                Commands ({session.shellCommands.length})
              </h4>
            </div>
            <div className="flex flex-col gap-1">
              {session.shellCommands.map((cmd) => (
                <div key={cmd.id} className="bg-bolt-elements-background-depth-3 rounded px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {cmd.status === 'running' ? (
                      <div className="i-ph:circle-notch animate-spin text-[10px] text-purple-400" />
                    ) : cmd.exitCode === 0 ? (
                      <div className="i-ph:check text-[10px] text-green-400" />
                    ) : (
                      <div className="i-ph:x text-[10px] text-red-400" />
                    )}
                    <code className="text-[10px] text-bolt-elements-textPrimary font-mono truncate">
                      $ {cmd.command}
                    </code>
                  </div>
                  {cmd.output && (
                    <pre className="text-[9px] text-bolt-elements-textTertiary font-mono mt-1 max-h-20 overflow-auto whitespace-pre-wrap">
                      {cmd.output.slice(0, 500)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification errors */}
        {session.verificationErrors.length > 0 && (
          <div className="border-b border-bolt-elements-borderColor px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="i-ph:warning text-sm text-yellow-400" />
              <h4 className="text-xs font-medium text-yellow-400">
                Build Errors ({session.verificationErrors.length})
              </h4>
            </div>
            <div className="flex flex-col gap-0.5">
              {session.verificationErrors.slice(0, 5).map((err, i) => (
                <p key={i} className="text-[10px] text-red-400 font-mono truncate">
                  {err}
                </p>
              ))}
              {session.verificationErrors.length > 5 && (
                <p className="text-[10px] text-bolt-elements-textTertiary">
                  +{session.verificationErrors.length - 5} more errors
                </p>
              )}
            </div>
          </div>
        )}

        {/* Diff review (when in review phase) */}
        {(isReviewable || wasInterrupted) && session.fileChanges.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-bolt-elements-borderColor">
              <div className="i-ph:git-diff text-sm text-bolt-elements-textSecondary" />
              <h4 className="text-xs font-medium text-bolt-elements-textPrimary">
                File Changes ({session.fileChanges.length})
              </h4>
            </div>
            <AgentDiffReview fileChanges={session.fileChanges} />
          </div>
        )}

        {/* Stats (when complete) */}
        {(session.phase === 'complete' || session.phase === 'reviewing') && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-3 text-[10px] text-bolt-elements-textTertiary">
              {stats.filesCreated > 0 && (
                <span className="text-green-400">{stats.filesCreated} created</span>
              )}
              {stats.filesModified > 0 && (
                <span className="text-blue-400">{stats.filesModified} modified</span>
              )}
              {stats.filesDeleted > 0 && (
                <span className="text-red-400">{stats.filesDeleted} deleted</span>
              )}
              {stats.fixIterations > 0 && (
                <span>{stats.fixIterations} fix iterations</span>
              )}
              <span>{(stats.duration / 1000).toFixed(1)}s</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="px-3 py-4 text-center">
            <div className="i-ph:warning-circle text-2xl text-red-400 mb-2 mx-auto" />
            <p className="text-xs text-red-400">
              {session.steps.find((s) => s.status === 'error')?.detail || 'Agent encountered an error'}
            </p>
          </div>
        )}
      </div>

      {/* Actions footer */}
      <AgentActions
        phase={session.phase}
        fileChanges={session.fileChanges}
        onAccept={acceptChanges}
        onReject={rejectChanges}
        onInterrupt={interrupt}
        onDismiss={dismiss}
      />
    </div>
  );
});

AgentPanel.displayName = 'AgentPanel';
