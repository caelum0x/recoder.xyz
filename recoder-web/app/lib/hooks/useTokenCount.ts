import { useState, useEffect, useMemo } from 'react';

export interface TokenCountResult {
  inputTokens: number;
  contextTokens: number;
  totalTokens: number;
  contextWindow: number;
  percentUsed: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

interface UseTokenCountOptions {
  contextWindow?: number;
  warningThreshold?: number; // Percentage (0-100) at which to show warning
}

/**
 * Simple token estimation using character count divided by 4.
 * This is a rough approximation - most LLM tokenizers average about 4 characters per token.
 * For more accurate counting, you could integrate tiktoken or a similar library.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average of ~4 characters per token for English text
  // This is a rough estimate - actual token counts vary by model and content
  return Math.ceil(text.length / 4);
}

/**
 * Hook for counting and tracking token usage in chat input.
 *
 * @param input - The current input text
 * @param contextMessages - Array of previous messages to include in context
 * @param options - Configuration options
 * @returns Token count result with breakdown and warnings
 */
export function useTokenCount(
  input: string = '',
  contextMessages: Array<{ role: string; content: string }> = [],
  options: UseTokenCountOptions = {}
): TokenCountResult {
  const {
    contextWindow = 128000, // Default to 128K context window (common for modern models)
    warningThreshold = 80, // Show warning at 80% usage
  } = options;

  // Debounce the input to avoid excessive recalculations on every keystroke
  const [debouncedInput, setDebouncedInput] = useState(input);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(input);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [input]);

  const result = useMemo(() => {
    // Estimate tokens for current input
    const inputTokens = estimateTokens(debouncedInput);

    // Estimate tokens for context (previous messages)
    const contextTokens = contextMessages.reduce((total, msg) => {
      // Add some overhead for message structure (role, separators, etc.)
      return total + estimateTokens(msg.content) + 4; // ~4 tokens overhead per message
    }, 0);

    // Add estimated system prompt tokens (rough estimate)
    const systemPromptTokens = 500; // Conservative estimate for system prompt

    const totalTokens = inputTokens + contextTokens + systemPromptTokens;
    const percentUsed = Math.min((totalTokens / contextWindow) * 100, 100);

    return {
      inputTokens,
      contextTokens: contextTokens + systemPromptTokens,
      totalTokens,
      contextWindow,
      percentUsed,
      isNearLimit: percentUsed >= warningThreshold,
      isOverLimit: percentUsed >= 95,
    };
  }, [debouncedInput, contextMessages, contextWindow, warningThreshold]);

  return result;
}

/**
 * Simple hook for just counting input tokens without context.
 * Useful for basic token display near the send button.
 */
export function useInputTokenCount(input: string = ''): number {
  const [debouncedInput, setDebouncedInput] = useState(input);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(input);
    }, 150); // Faster debounce for input-only counting

    return () => clearTimeout(timer);
  }, [input]);

  return useMemo(() => estimateTokens(debouncedInput), [debouncedInput]);
}

/**
 * Utility to format token count for display.
 * Converts large numbers to K format (e.g., 1500 -> "1.5K")
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return count.toString();
}
