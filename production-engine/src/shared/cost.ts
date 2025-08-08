/**
 * Cost calculation utilities for production engine
 */

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

export function calculateApiCostAnthropic(inputTokens: number, outputTokens: number): CostInfo {
  // Claude pricing: $3/1M input, $15/1M output tokens
  return calculateCost(inputTokens, outputTokens, 0.003, 0.015);
}

export function calculateApiCostOpenAI(inputTokens: number, outputTokens: number): CostInfo {
  // GPT-4 pricing: $10/1M input, $30/1M output tokens
  return calculateCost(inputTokens, outputTokens, 0.01, 0.03);
}