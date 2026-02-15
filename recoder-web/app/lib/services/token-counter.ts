/**
 * Token Estimation Service
 *
 * Lightweight token counting using character-based heuristics.
 * No external dependencies -- approximates token counts using
 * the observation that English text averages ~4 characters per token
 * while code averages ~3.5 characters per token.
 *
 * Inspired by dyad's token counting pattern.
 */

import { MODEL_PROVIDERS, type ModelInfo } from '~/lib/models';

// ---------------------------------------------------------------------------
// Core estimation
// ---------------------------------------------------------------------------

/**
 * Approximate token count for a string.
 * Uses a sliding scale between 4 chars/token (natural language) and
 * 3.5 chars/token (code-heavy content).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const codeRatio = estimateCodeRatio(text);
  const charsPerToken = 4 - codeRatio * 0.5; // 4 for text, 3.5 for code

  return Math.ceil(text.length / charsPerToken);
}

/**
 * Heuristic: what fraction of the text looks like source code?
 */
function estimateCodeRatio(text: string): number {
  const codeIndicators = [
    '{', '}', '(', ')', ';', '=>', 'import ', 'export ',
    'const ', 'function ', 'class ', 'return ', '</', '/>',
  ];

  let codeChars = 0;

  for (const indicator of codeIndicators) {
    const count = text.split(indicator).length - 1;
    codeChars += count * indicator.length;
  }

  return Math.min(codeChars / Math.max(text.length, 1), 1);
}

// ---------------------------------------------------------------------------
// Token breakdown
// ---------------------------------------------------------------------------

export interface TokenBreakdown {
  systemPrompt: number;
  messageHistory: number;
  codebaseContext: number;
  lastMessage: number;
  total: number;
  limit: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Model context limits
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from the canonical MODEL_PROVIDERS registry so we
 * stay in sync with the model catalog without duplicating data.
 */
function buildModelLimits(): Record<string, number> {
  const limits: Record<string, number> = {};

  for (const provider of Object.values(MODEL_PROVIDERS)) {
    for (const model of provider.models) {
      if (model.contextWindow) {
        limits[model.id] = model.contextWindow;

        // Also register with the provider prefix for OpenRouter-style IDs
        const prefixed = `${provider.id}/${model.id}`;
        if (!limits[prefixed]) {
          limits[prefixed] = model.contextWindow;
        }
      }
    }
  }

  return limits;
}

let _modelLimitsCache: Record<string, number> | null = null;

function getModelLimits(): Record<string, number> {
  if (!_modelLimitsCache) {
    _modelLimitsCache = buildModelLimits();
  }
  return _modelLimitsCache;
}

const DEFAULT_CONTEXT_LIMIT = 128000;

/**
 * Get the context window size for a model ID.
 * Falls back to 128k if the model is not in the registry.
 */
export function getModelLimit(modelId: string): number {
  const limits = getModelLimits();

  // Exact match
  if (limits[modelId]) {
    return limits[modelId];
  }

  // Partial / fuzzy match (e.g. "claude-sonnet-4" matching an entry
  // that has "anthropic/claude-sonnet-4")
  const lower = modelId.toLowerCase();
  for (const [key, value] of Object.entries(limits)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return value;
    }
  }

  return DEFAULT_CONTEXT_LIMIT;
}

// ---------------------------------------------------------------------------
// Breakdown calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a detailed token usage breakdown.
 *
 * @param systemPrompt  - The system prompt text sent to the model
 * @param messages      - All messages in the conversation
 * @param codebaseContext - Additional code context injected into the request
 * @param modelId       - Model identifier for limit lookup
 */
export function calculateBreakdown(
  systemPrompt: string,
  messages: Array<{ role: string; content: string | unknown }>,
  codebaseContext: string,
  modelId: string,
): TokenBreakdown {
  const systemTokens = estimateTokens(systemPrompt);

  // All messages except the last user message count as "history"
  const historyTokens = messages.slice(0, -1).reduce((acc, msg) => {
    const content =
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return acc + estimateTokens(content);
  }, 0);

  const contextTokens = estimateTokens(codebaseContext);

  const lastMsg = messages[messages.length - 1];
  const lastMsgContent = lastMsg
    ? typeof lastMsg.content === 'string'
      ? lastMsg.content
      : JSON.stringify(lastMsg.content)
    : '';
  const lastMsgTokens = estimateTokens(lastMsgContent);

  const total = systemTokens + historyTokens + contextTokens + lastMsgTokens;
  const limit = getModelLimit(modelId);

  return {
    systemPrompt: systemTokens,
    messageHistory: historyTokens,
    codebaseContext: contextTokens,
    lastMessage: lastMsgTokens,
    total,
    limit,
    percentage: Math.round((total / limit) * 100),
  };
}
