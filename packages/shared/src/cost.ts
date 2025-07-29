/**
 * AI API Cost Calculation Utilities
 * Provides cost calculation for different AI providers
 */

import { TokenUsage } from './types/ai-models';

export interface ExtendedTokenUsage extends TokenUsage {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface CostInfo {
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheCost?: number;
}

// Cost per 1M tokens (in USD)
const ANTHROPIC_PRICING = {
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
};

const OPENAI_PRICING = {
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
};

export function calculateApiCostAnthropic(
  model: string,
  usage: ExtendedTokenUsage
): CostInfo {
  const pricing = ANTHROPIC_PRICING[model as keyof typeof ANTHROPIC_PRICING] || 
    ANTHROPIC_PRICING['claude-3-sonnet-20240229']; // fallback

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  
  // Cache costs (if applicable)
  const cacheReadCost = usage.cacheReadTokens 
    ? (usage.cacheReadTokens / 1_000_000) * (pricing.input * 0.1) // 10% of input cost
    : 0;
  const cacheWriteCost = usage.cacheWriteTokens
    ? (usage.cacheWriteTokens / 1_000_000) * (pricing.input * 1.25) // 125% of input cost
    : 0;

  const cacheCost = cacheReadCost + cacheWriteCost;
  const totalCost = inputCost + outputCost + cacheCost;

  return {
    totalCost,
    inputCost,
    outputCost,
    cacheCost: cacheCost > 0 ? cacheCost : undefined,
  };
}

export function calculateApiCostOpenAI(
  model: string,
  usage: ExtendedTokenUsage
): CostInfo {
  const pricing = OPENAI_PRICING[model as keyof typeof OPENAI_PRICING] || 
    OPENAI_PRICING['gpt-3.5-turbo']; // fallback

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    totalCost,
    inputCost,
    outputCost,
  };
}

export function calculateApiCostGeneric(
  inputPricePerMillion: number,
  outputPricePerMillion: number,
  usage: ExtendedTokenUsage
): CostInfo {
  const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerMillion;
  const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerMillion;
  const totalCost = inputCost + outputCost;

  return {
    totalCost,
    inputCost,
    outputCost,
  };
}