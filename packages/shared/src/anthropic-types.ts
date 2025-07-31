/**
 * Anthropic types and constants for recoder.xyz
 */

import type { ModelInfo } from './api';

// Anthropic Model IDs
export type AnthropicModelId = 
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-sonnet-20240620"
  | "claude-3-5-haiku-20241022"
  | "claude-3-opus-20240229"
  | "claude-3-sonnet-20240229"
  | "claude-3-haiku-20240307"
  | "claude-2.1"
  | "claude-2.0"
  | "claude-instant-1.2"
  | "claude-3-7-sonnet-20250219:thinking";

// Vertex AI Model IDs  
export type VertexModelId = 
  | "claude-3-5-sonnet@20241022"
  | "claude-3-5-sonnet@20240620"
  | "claude-3-5-haiku@20241022"
  | "claude-3-opus@20240229"
  | "claude-3-sonnet@20240229"
  | "claude-3-haiku@20240307";

// Default models
export const anthropicDefaultModelId: AnthropicModelId = "claude-3-5-sonnet-20241022";
export const vertexDefaultModelId: VertexModelId = "claude-3-5-sonnet@20241022";

// Constants
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;
export const ANTHROPIC_DEFAULT_TEMPERATURE = 0.7;

// Anthropic model definitions
export const anthropicModels: Record<AnthropicModelId, ModelInfo> = {
  "claude-3-5-sonnet-20241022": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.5 Sonnet v2 - Most capable Claude model"
  },
  "claude-3-5-sonnet-20240620": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.5 Sonnet v1"
  },
  "claude-3-5-haiku-20241022": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    description: "Claude 3.5 Haiku - Fast and efficient"
  },
  "claude-3-opus-20240229": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    description: "Claude 3 Opus - Most powerful model"
  },
  "claude-3-sonnet-20240229": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3 Sonnet - Balanced performance"
  },
  "claude-3-haiku-20240307": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    description: "Claude 3 Haiku - Fast and cost-effective"
  },
  "claude-2.1": {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 8.00,
    outputPricePerMillion: 24.00,
    description: "Claude 2.1 - Legacy model"
  },
  "claude-2.0": {
    maxTokens: 4096,
    contextWindow: 100000,
    supportsImages: false,
    supportsTools: false,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 8.00,
    outputPricePerMillion: 24.00,
    description: "Claude 2.0 - Legacy model"
  },
  "claude-instant-1.2": {
    maxTokens: 4096,
    contextWindow: 100000,
    supportsImages: false,
    supportsTools: false,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 2.40,
    description: "Claude Instant - Fast and efficient legacy model"
  },
  "claude-3-7-sonnet-20250219:thinking": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    maxThinkingTokens: 100000,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.7 Sonnet with thinking - Advanced reasoning"
  }
};

// Vertex model definitions (same models, different naming)
export const vertexModels: Record<VertexModelId, ModelInfo> = {
  "claude-3-5-sonnet@20241022": anthropicModels["claude-3-5-sonnet-20241022"],
  "claude-3-5-sonnet@20240620": anthropicModels["claude-3-5-sonnet-20240620"],
  "claude-3-5-haiku@20241022": anthropicModels["claude-3-5-haiku-20241022"],
  "claude-3-opus@20240229": anthropicModels["claude-3-opus-20240229"],
  "claude-3-sonnet@20240229": anthropicModels["claude-3-sonnet-20240229"],
  "claude-3-haiku@20240307": anthropicModels["claude-3-haiku-20240307"]
};