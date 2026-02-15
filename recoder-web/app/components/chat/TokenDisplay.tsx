import React, { useState } from 'react';
import { useTokenCount, formatTokenCount, type TokenCountResult } from '~/lib/hooks/useTokenCount';
import type { Message } from 'ai';

interface TokenDisplayProps {
  input: string;
  messages?: Message[];
  contextWindow?: number;
  showProgressBar?: boolean;
}

/**
 * Displays token count and usage information near the chat input.
 * Shows input tokens, context tokens, and a progress bar for context usage.
 */
export function TokenDisplay({
  input,
  messages = [],
  contextWindow = 128000,
  showProgressBar = true,
}: TokenDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Convert messages to the format expected by useTokenCount
  const contextMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : '',
  }));

  const tokenResult = useTokenCount(input, contextMessages, { contextWindow });

  const {
    inputTokens,
    contextTokens,
    totalTokens,
    percentUsed,
    isNearLimit,
    isOverLimit,
  } = tokenResult;

  // Don't show if no tokens
  if (totalTokens === 0 && inputTokens === 0) {
    return null;
  }

  // Color classes based on usage level
  const getColorClass = () => {
    if (isOverLimit) return 'text-red-500';
    if (isNearLimit) return 'text-yellow-500';
    return 'text-bolt-elements-textTertiary';
  };

  const getProgressBarColor = () => {
    if (isOverLimit) return 'bg-red-500';
    if (isNearLimit) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Compact token display */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 text-xs ${getColorClass()} hover:opacity-80 transition-opacity`}
        title="Click to see token breakdown"
      >
        <div className="i-ph:coins text-sm" />
        <span>
          {formatTokenCount(totalTokens)} tokens
        </span>
        {isNearLimit && !isOverLimit && (
          <span className="text-yellow-500 flex items-center gap-1">
            <div className="i-ph:warning text-sm" />
            {Math.round(percentUsed)}%
          </span>
        )}
        {isOverLimit && (
          <span className="text-red-500 flex items-center gap-1">
            <div className="i-ph:warning-circle text-sm" />
            Limit
          </span>
        )}
        <div className={`i-ph:caret-${isExpanded ? 'up' : 'down'} text-xs`} />
      </button>

      {/* Expanded breakdown */}
      {isExpanded && (
        <div className="bg-bolt-elements-background-depth-3 rounded-md p-2 text-xs space-y-2">
          {/* Token breakdown */}
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 items-center">
            <div className="i-ph:text-aa text-blue-400" />
            <span className="text-bolt-elements-textSecondary">Input</span>
            <span className="text-bolt-elements-textPrimary font-mono">
              {formatTokenCount(inputTokens)}
            </span>

            <div className="i-ph:chat-dots text-green-400" />
            <span className="text-bolt-elements-textSecondary">Context</span>
            <span className="text-bolt-elements-textPrimary font-mono">
              {formatTokenCount(contextTokens)}
            </span>

            <div className="i-ph:equals text-bolt-elements-textTertiary" />
            <span className="text-bolt-elements-textSecondary font-medium">Total</span>
            <span className={`font-mono font-medium ${getColorClass()}`}>
              {formatTokenCount(totalTokens)}
            </span>
          </div>

          {/* Progress bar */}
          {showProgressBar && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-bolt-elements-textTertiary">
                <span>Context Usage</span>
                <span>
                  {Math.round(percentUsed)}% of {formatTokenCount(contextWindow)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-bolt-elements-background-depth-4 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${getProgressBarColor()}`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Warning messages */}
          {isNearLimit && !isOverLimit && (
            <div className="flex items-center gap-1 text-yellow-500 text-[10px]">
              <div className="i-ph:warning" />
              Approaching context limit. Consider starting a new chat.
            </div>
          )}
          {isOverLimit && (
            <div className="flex items-center gap-1 text-red-500 text-[10px]">
              <div className="i-ph:warning-circle" />
              Context limit exceeded. Messages may be truncated.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline token count display for showing near the send button.
 */
export function InlineTokenCount({ input }: { input: string }) {
  const tokenResult = useTokenCount(input, [], { contextWindow: 128000 });
  const { inputTokens } = tokenResult;

  if (inputTokens === 0) {
    return null;
  }

  return (
    <span className="text-xs text-bolt-elements-textTertiary font-mono">
      ~{formatTokenCount(inputTokens)}
    </span>
  );
}

/**
 * Context usage progress bar component.
 * Shows a visual indicator of how much of the context window is being used.
 */
export function ContextUsageBar({
  input,
  messages = [],
  contextWindow = 128000,
}: TokenDisplayProps) {
  const contextMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : '',
  }));

  const { percentUsed, isNearLimit, isOverLimit, totalTokens } = useTokenCount(
    input,
    contextMessages,
    { contextWindow }
  );

  const getProgressBarColor = () => {
    if (isOverLimit) return 'bg-red-500';
    if (isNearLimit) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="w-full space-y-1">
      <div className="flex justify-between text-xs text-bolt-elements-textTertiary">
        <span className="flex items-center gap-1">
          <div className="i-ph:coins" />
          {formatTokenCount(totalTokens)} tokens
        </span>
        <span>{Math.round(percentUsed)}%</span>
      </div>
      <div className="w-full h-1 bg-bolt-elements-background-depth-4 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getProgressBarColor()}`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}
