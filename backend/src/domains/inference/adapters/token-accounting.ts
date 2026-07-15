/**
 * `token-accounting.ts` — token counting + cost computation for the usage ledger.
 *
 * Two responsibilities, both pure and deterministic (easy to unit-test, no I/O):
 *   1. ESTIMATE tokens when the gateway did not report usage. A ~4-chars/token
 *      heuristic (the well-known GPT-family approximation) bounds the estimate;
 *      it is explicitly a fallback — real `usage` from the gateway always wins.
 *   2. COST a `TokenUsage` against a `ModelCatalogEntry`'s per-MTok micro-USD
 *      pricing, in integer micro-USD (currency-safe; never floats-as-money).
 *
 * DEGRADE-SAFE: an unpriced model (0/0 pricing) or an absent catalog entry costs
 * 0 micro-USD — truthful, never a fabricated charge.
 */
import type { InferenceMessage, ModelCatalogEntry, TokenUsage } from '../types.js';
import { tokenUsage } from '../types.js';

/** Rough characters-per-token used ONLY when the gateway reports no usage. */
const CHARS_PER_TOKEN = 4;

/** Micro-USD are per 1,000,000 tokens in the catalog; divide by this to scale. */
const TOKENS_PER_PRICING_UNIT = 1_000_000;

/** Estimate the token count of a single string (fallback heuristic). */
export function estimateStringTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/** Estimate prompt tokens across a message array (fallback heuristic). */
export function estimatePromptTokens(messages: readonly InferenceMessage[]): number {
  let total = 0;
  for (const m of messages) {
    // A small per-message overhead approximates role/formatting framing tokens.
    total += estimateStringTokens(m.content) + 3;
  }
  return total;
}

/**
 * Resolve the token usage for a call: prefer the gateway-reported counts; fall
 * back to the char heuristic for any missing side. `reported` may be partial
 * (e.g. only input tokens from an embedding call).
 */
export function resolveUsage(params: {
  readonly messages?: readonly InferenceMessage[];
  readonly completion?: string | null;
  readonly reported?: { readonly inputTokens?: number; readonly outputTokens?: number } | undefined;
}): TokenUsage {
  const reportedIn = params.reported?.inputTokens;
  const reportedOut = params.reported?.outputTokens;
  const input =
    typeof reportedIn === 'number' && reportedIn >= 0
      ? reportedIn
      : params.messages
        ? estimatePromptTokens(params.messages)
        : 0;
  const output =
    typeof reportedOut === 'number' && reportedOut >= 0
      ? reportedOut
      : params.completion
        ? estimateStringTokens(params.completion)
        : 0;
  return tokenUsage(input, output);
}

/**
 * Compute the integer micro-USD cost of a `TokenUsage` against a catalog entry.
 * An absent entry or 0/0 pricing costs 0 — never a fabricated charge.
 */
export function computeCostMicroUsd(
  usage: TokenUsage,
  entry: Pick<ModelCatalogEntry, 'inputMicroUsdPerMTok' | 'outputMicroUsdPerMTok'> | null,
): number {
  if (!entry) return 0;
  const inputCost = (usage.inputTokens * entry.inputMicroUsdPerMTok) / TOKENS_PER_PRICING_UNIT;
  const outputCost = (usage.outputTokens * entry.outputMicroUsdPerMTok) / TOKENS_PER_PRICING_UNIT;
  return Math.round(inputCost + outputCost);
}
