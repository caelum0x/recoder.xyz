/**
 * StreamingIndicator - Shows streaming status with metrics
 *
 * Displays:
 * - "Thinking..." before first token
 * - Token count during generation
 * - Generation speed (tokens/sec)
 * - Time to first token
 */

import { useStore } from '@nanostores/react';
import { memo } from 'react';
import {
  streamingStore,
  isThinking,
  speedDisplay,
  tokenCountDisplay,
  ttftDisplay,
  type StreamPhase,
} from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';

interface StreamingIndicatorProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
}

/**
 * Get display info for stream phase
 */
function getPhaseInfo(phase: StreamPhase): { label: string; icon: string; color: string } {
  switch (phase) {
    case 'connecting':
      return { label: 'Connecting...', icon: 'i-ph:wifi-high', color: 'text-yellow-500' };
    case 'thinking':
      return { label: 'Thinking...', icon: 'i-ph:brain', color: 'text-blue-500' };
    case 'streaming':
      return { label: 'Generating', icon: 'i-ph:lightning', color: 'text-green-500' };
    case 'buffering':
      return { label: 'Buffering...', icon: 'i-ph:queue', color: 'text-orange-500' };
    case 'completing':
      return { label: 'Completing...', icon: 'i-ph:check-circle', color: 'text-blue-400' };
    case 'completed':
      return { label: 'Done', icon: 'i-ph:check-circle-fill', color: 'text-green-500' };
    case 'error':
      return { label: 'Error', icon: 'i-ph:warning-circle', color: 'text-red-500' };
    case 'aborted':
      return { label: 'Stopped', icon: 'i-ph:stop-circle', color: 'text-bolt-elements-textTertiary' };
    default:
      return { label: '', icon: '', color: '' };
  }
}

export const StreamingIndicator = memo(function StreamingIndicator({
  className,
  showDetails = true,
  compact = false,
}: StreamingIndicatorProps) {
  const state = useStore(streamingStore);
  const thinking = useStore(isThinking);
  const speed = useStore(speedDisplay);
  const tokens = useStore(tokenCountDisplay);
  const ttft = useStore(ttftDisplay);

  // Don't show if idle
  if (state.phase === 'idle') {
    return null;
  }

  const phaseInfo = getPhaseInfo(state.phase);

  if (compact) {
    return (
      <div className={classNames('flex items-center gap-1.5 text-xs', className)}>
        {thinking ? (
          <>
            <div className="i-svg-spinners:pulse-3 text-blue-500" />
            <span className="text-bolt-elements-textSecondary">Thinking...</span>
          </>
        ) : state.phase === 'streaming' ? (
          <>
            <div className="i-svg-spinners:bars-scale-middle text-green-500" />
            {speed && <span className="text-bolt-elements-textSecondary">{speed}</span>}
          </>
        ) : state.phase === 'completed' ? (
          <>
            <div className={classNames(phaseInfo.icon, phaseInfo.color)} />
            {tokens && <span className="text-bolt-elements-textTertiary">{tokens}</span>}
          </>
        ) : (
          <>
            <div className={classNames(phaseInfo.icon, phaseInfo.color)} />
            <span className="text-bolt-elements-textSecondary">{phaseInfo.label}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'flex items-center gap-3 px-3 py-2 rounded-lg',
        'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
        className
      )}
    >
      {/* Phase icon with animation */}
      <div className="flex items-center gap-2">
        {thinking ? (
          <div className="i-svg-spinners:pulse-rings-multiple text-xl text-blue-500" />
        ) : state.phase === 'streaming' ? (
          <div className="i-svg-spinners:bars-scale-middle text-xl text-green-500" />
        ) : (
          <div className={classNames(phaseInfo.icon, 'text-xl', phaseInfo.color)} />
        )}
        <span className={classNames('text-sm font-medium', phaseInfo.color)}>
          {phaseInfo.label}
        </span>
      </div>

      {/* Metrics */}
      {showDetails && state.phase === 'streaming' && (
        <div className="flex items-center gap-3 text-xs text-bolt-elements-textSecondary border-l border-bolt-elements-borderColor pl-3">
          {tokens && (
            <div className="flex items-center gap-1">
              <div className="i-ph:hash text-sm" />
              <span>{tokens}</span>
            </div>
          )}
          {speed && (
            <div className="flex items-center gap-1">
              <div className="i-ph:speedometer text-sm" />
              <span>{speed}</span>
            </div>
          )}
        </div>
      )}

      {/* Completion metrics */}
      {showDetails && state.phase === 'completed' && (
        <div className="flex items-center gap-3 text-xs text-bolt-elements-textTertiary border-l border-bolt-elements-borderColor pl-3">
          {tokens && (
            <div className="flex items-center gap-1" title="Total tokens generated">
              <div className="i-ph:hash text-sm" />
              <span>{tokens}</span>
            </div>
          )}
          {ttft && (
            <div className="flex items-center gap-1" title="Time to first token">
              <div className="i-ph:timer text-sm" />
              <span>{ttft}</span>
            </div>
          )}
          {state.metrics.streamDuration > 0 && (
            <div className="flex items-center gap-1" title="Total generation time">
              <div className="i-ph:clock text-sm" />
              <span>{(state.metrics.streamDuration / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>
      )}

      {/* Health warning */}
      {state.health.isStale && !state.health.isHealthy && (
        <div className="flex items-center gap-1 text-xs text-yellow-500">
          <div className="i-ph:warning text-sm" />
          <span>Slow response</span>
        </div>
      )}
    </div>
  );
});

/**
 * Compact inline streaming status for message area
 */
export const InlineStreamingStatus = memo(function InlineStreamingStatus() {
  const state = useStore(streamingStore);
  const thinking = useStore(isThinking);
  const speed = useStore(speedDisplay);

  if (state.phase === 'idle' || state.phase === 'completed') {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-bolt-elements-textTertiary ml-2">
      {thinking ? (
        <>
          <div className="i-svg-spinners:pulse-3" />
          <span>Thinking...</span>
        </>
      ) : (
        <>
          <div className="i-svg-spinners:bars-scale-middle" />
          {speed && <span>{speed}</span>}
        </>
      )}
    </div>
  );
});

/**
 * Minimal dot indicator for streaming status
 */
export const StreamingDot = memo(function StreamingDot() {
  const state = useStore(streamingStore);

  if (state.phase === 'idle' || state.phase === 'completed') {
    return null;
  }

  const isActive = state.phase === 'streaming';
  const isThinkingPhase = state.phase === 'thinking' || state.phase === 'connecting';

  return (
    <span
      className={classNames(
        'inline-block w-2 h-2 rounded-full',
        isActive && 'bg-green-500 animate-pulse',
        isThinkingPhase && 'bg-blue-500 animate-pulse',
        state.phase === 'error' && 'bg-red-500'
      )}
      title={getPhaseInfo(state.phase).label}
    />
  );
});

export default StreamingIndicator;
