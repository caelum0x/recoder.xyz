import type { AnyLanguageModel } from "./language-model";

/**
 * Approximate token counting utilities
 *
 * Different models use different tokenizers, but we can provide
 * reasonable estimates for cost calculations and context management.
 *
 * General rules of thumb:
 * - English text: ~4 characters per token, ~0.75 words per token
 * - Code: ~3 characters per token (more special characters)
 * - Non-English: varies significantly by language
 */

/**
 * Estimate token count using character-based heuristic
 * This is a simple approximation - for precise counts, use the provider's tokenizer
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  // More accurate estimation considering different content types
  const words = text.split(/\s+/).filter(Boolean).length;
  const characters = text.length;
  const specialCharCount = (text.match(/[^a-zA-Z0-9\s]/g) || []).length;

  // Base estimate: ~4 characters per token for English
  // Adjust for code (more special characters = more tokens)
  const specialCharRatio = specialCharCount / characters;
  const charsPerToken = specialCharRatio > 0.1 ? 3 : 4;

  return Math.ceil(characters / charsPerToken);
}

/**
 * More accurate token estimation for specific providers
 * Uses provider-specific heuristics when available
 */
export function estimateTokenCountForModel(
  text: string,
  model: AnyLanguageModel,
): number {
  if (!text) return 0;

  const providerId = model.providerId;

  switch (providerId) {
    case "anthropic":
      // Claude uses ~4 chars per token for English, ~3 for code
      return estimateAnthropicTokens(text);
    case "openai":
      // GPT models use cl100k_base tokenizer (~4 chars per token)
      return estimateOpenAITokens(text);
    case "google":
      // Gemini models have similar tokenization
      return estimateGoogleTokens(text);
    default:
      // Fall back to general estimation
      return estimateTokenCount(text);
  }
}

function estimateAnthropicTokens(text: string): number {
  const characters = text.length;
  // Claude averages ~4 characters per token for mixed content
  // Code tends to be ~3-3.5 chars per token
  const codeIndicators = /[{}[\]();:=<>]/g;
  const isLikelyCode = (text.match(codeIndicators) || []).length > text.length * 0.05;
  const charsPerToken = isLikelyCode ? 3.2 : 4;
  return Math.ceil(characters / charsPerToken);
}

function estimateOpenAITokens(text: string): number {
  const characters = text.length;
  // GPT-4 and later use cl100k_base tokenizer
  // Average ~4 characters per token
  const codeIndicators = /[{}[\]();:=<>]/g;
  const isLikelyCode = (text.match(codeIndicators) || []).length > text.length * 0.05;
  const charsPerToken = isLikelyCode ? 3 : 4;
  return Math.ceil(characters / charsPerToken);
}

function estimateGoogleTokens(text: string): number {
  const characters = text.length;
  // Gemini uses SentencePiece tokenizer
  // Slightly more efficient for some content types
  const codeIndicators = /[{}[\]();:=<>]/g;
  const isLikelyCode = (text.match(codeIndicators) || []).length > text.length * 0.05;
  const charsPerToken = isLikelyCode ? 3.5 : 4.2;
  return Math.ceil(characters / charsPerToken);
}

/**
 * Check if a text fits within a model's context window
 */
export function fitsInContextWindow(
  text: string,
  model: AnyLanguageModel,
  reserveForOutput: number = 0,
): boolean {
  const estimatedTokens = estimateTokenCountForModel(text, model);
  const availableTokens = model.contextWindow - reserveForOutput;
  return estimatedTokens <= availableTokens;
}

/**
 * Estimate cost for a given text (as input)
 */
export function estimateInputCost(
  text: string,
  model: AnyLanguageModel,
): number {
  const tokens = estimateTokenCountForModel(text, model);
  return tokens * model.pricing.input.perToken;
}

/**
 * Estimate cost for a given text (as output)
 */
export function estimateOutputCost(
  text: string,
  model: AnyLanguageModel,
): number {
  const tokens = estimateTokenCountForModel(text, model);
  return tokens * model.pricing.output.perToken;
}

/**
 * Format token count with K/M suffix for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Format cost in dollars for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Truncate text to fit within a token budget
 * Returns the truncated text and whether it was truncated
 */
export function truncateToTokenBudget(
  text: string,
  model: AnyLanguageModel,
  maxTokens: number,
): { text: string; truncated: boolean; estimatedTokens: number } {
  const currentTokens = estimateTokenCountForModel(text, model);

  if (currentTokens <= maxTokens) {
    return { text, truncated: false, estimatedTokens: currentTokens };
  }

  // Binary search to find the right truncation point
  let low = 0;
  let high = text.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const truncated = text.slice(0, mid);
    const tokens = estimateTokenCountForModel(truncated, model);

    if (tokens <= maxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const truncatedText = text.slice(0, low);
  const truncatedTokens = estimateTokenCountForModel(truncatedText, model);

  return {
    text: truncatedText,
    truncated: true,
    estimatedTokens: truncatedTokens,
  };
}

/**
 * Split text into chunks that fit within a token budget
 * Useful for processing large documents
 */
export function splitIntoChunks(
  text: string,
  model: AnyLanguageModel,
  maxTokensPerChunk: number,
): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const { text: chunk, truncated } = truncateToTokenBudget(
      remaining,
      model,
      maxTokensPerChunk,
    );

    if (chunk.length === 0) {
      // Safety: if we can't make progress, take at least one character
      chunks.push(remaining.slice(0, 1));
      remaining = remaining.slice(1);
    } else {
      chunks.push(chunk);
      remaining = truncated ? remaining.slice(chunk.length) : "";
    }
  }

  return chunks;
}
