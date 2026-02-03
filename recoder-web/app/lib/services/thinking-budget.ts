/**
 * Thinking budget control for extended thinking models.
 * Adapted from dyad's thinking_utils.ts pattern.
 *
 * This module provides provider-specific options for controlling
 * how much "thinking" (chain-of-thought reasoning) a model performs.
 * Different providers use different parameter formats:
 * - Anthropic: thinking.budget_tokens
 * - Google: thinking.budget_tokens + include_thoughts
 * - OpenAI: reasoning.effort (low/medium/high)
 * - DeepSeek: thinking.budget_tokens
 *
 * The budget parameter is best-effort: if the model or provider
 * doesn't support it, the options are silently ignored.
 */

export type ThinkingBudget = 'low' | 'medium' | 'high';

// Models that support extended thinking / reasoning
const THINKING_MODELS = new Set([
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-opus-4.5',
  'google/gemini-2.5-pro-preview',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash-thinking',
  'deepseek/deepseek-r1',
  'openai/o1',
  'openai/o3-mini',
  'openai/o1-mini',
]);

/**
 * Check whether a model supports extended thinking / reasoning.
 * Uses both an explicit allowlist and heuristic pattern matching.
 */
export function supportsThinking(modelId: string): boolean {
  if (THINKING_MODELS.has(modelId)) return true;

  // Heuristic: models with "thinking", "-r1", "o1", or "o3" in the name
  return (
    modelId.includes('thinking') ||
    modelId.includes('-r1') ||
    /\bo[13](-|$)/.test(modelId)
  );
}

/**
 * Convert a budget level to a token count.
 * -1 means "unlimited" (let the model decide).
 */
export function getThinkingBudgetTokens(budget: ThinkingBudget): number {
  switch (budget) {
    case 'low':
      return 1024;
    case 'medium':
      return 4096;
    case 'high':
      return -1; // Unlimited - model decides
    default:
      return 4096;
  }
}

/**
 * Get provider-specific options for thinking/reasoning control.
 * Returns null if the model doesn't support thinking, so callers
 * can safely skip merging when the result is null.
 */
export function getThinkingProviderOptions(
  modelId: string,
  budget: ThinkingBudget,
): Record<string, any> | null {
  if (!supportsThinking(modelId)) return null;

  const budgetTokens = getThinkingBudgetTokens(budget);

  // Anthropic Claude models
  if (modelId.includes('anthropic') || modelId.includes('claude')) {
    // Anthropic's extended thinking requires a minimum of 1024 budget_tokens
    const tokens = budgetTokens === -1 ? 10000 : Math.max(budgetTokens, 1024);
    return { thinking: { type: 'enabled', budget_tokens: tokens } };
  }

  // Google Gemini models
  if (modelId.includes('google') || modelId.includes('gemini')) {
    return {
      thinking: {
        type: 'enabled',
        include_thoughts: true,
        budget_tokens: budgetTokens === -1 ? undefined : budgetTokens,
      },
    };
  }

  // OpenAI reasoning models (o1, o3, etc.)
  if (modelId.includes('openai') || /\bo[13](-|$)/.test(modelId)) {
    const effortMap: Record<ThinkingBudget, string> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
    };
    return {
      reasoning: {
        effort: effortMap[budget],
      },
    };
  }

  // DeepSeek R1
  if (modelId.includes('deepseek') && modelId.includes('r1')) {
    const tokens = budgetTokens === -1 ? 8192 : budgetTokens;
    return {
      thinking: { type: 'enabled', budget_tokens: tokens },
    };
  }

  // Unknown thinking model - return a generic thinking config
  // This is best-effort; the provider will ignore unsupported params
  return null;
}
