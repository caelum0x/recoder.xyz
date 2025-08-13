/**
 * Token counting utilities for the backend
 */

// Simple token counting implementation
export function countTokens(text: string): number {
  // GPT-3.5/4 tokenizer approximation: ~0.75 tokens per word
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 0.75);
}

export function countTextTokens(text: string): number {
  return countTokens(text);
}

export function estimateTokens(text: string): number {
  return countTokens(text);
}

export function calculateTokenUsage(input: string, output: string): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const inputTokens = countTokens(input);
  const outputTokens = countTokens(output);
  
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}
