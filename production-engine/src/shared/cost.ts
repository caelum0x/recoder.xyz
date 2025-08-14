/**
 * Cost calculation utilities for production engine
 */

import type { ModelInfo } from "@roo-code/types"

export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputCostPer1K: number = 0.01,
  outputCostPer1K: number = 0.03
): CostInfo {
  const inputCost = (inputTokens / 1000) * inputCostPer1K;
  const outputCost = (outputTokens / 1000) * outputCostPer1K;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    inputTokens,
    outputTokens
  };
}

export function calculateApiCostAnthropic(
  info: ModelInfo,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens?: number,
  cacheReadTokens?: number
): number {
  // Calculate input cost (per million tokens)
  let totalCost = 0;
  
  if (inputTokens > 0 && info.inputPrice) {
    totalCost += (inputTokens / 1_000_000) * info.inputPrice;
  }
  
  if (outputTokens > 0 && info.outputPrice) {
    totalCost += (outputTokens / 1_000_000) * info.outputPrice;
  }
  
  if (cacheWriteTokens && cacheWriteTokens > 0 && info.cacheWritesPrice) {
    totalCost += (cacheWriteTokens / 1_000_000) * info.cacheWritesPrice;
  }
  
  if (cacheReadTokens && cacheReadTokens > 0 && info.cacheReadsPrice) {
    totalCost += (cacheReadTokens / 1_000_000) * info.cacheReadsPrice;
  }
  
  return totalCost;
}

export function calculateApiCostOpenAI(inputTokens: number, outputTokens: number): CostInfo {
  // GPT-4 pricing: $10/1M input, $30/1M output tokens
  return calculateCost(inputTokens, outputTokens, 0.01, 0.03);
}

/**
 * Parse API price from various formats
 */
export function parseApiPrice(price: any): number {
  if (typeof price === 'number') {
    return price;
  }
  
  if (typeof price === 'string') {
    // Remove currency symbols and parse
    const cleanPrice = price.replace(/[\$,\s]/g, '');
    const parsed = parseFloat(cleanPrice);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
}