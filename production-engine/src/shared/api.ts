/**
 * Shared API types for production engine
 */

import { type ModelInfo, type ProviderSettings } from "@roo-code/types"

export interface ApiHandlerOptions {
  // Common options
  maxRetries?: number;
  timeout?: number;
  
  // Provider-specific options
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiModelId?: string;
  
  // Anthropic specific
  anthropicApiKey?: string;
  anthropicVersion?: string;
  anthropicBaseUrl?: string;
  anthropicUseAuthToken?: boolean;
  
  // Vertex specific  
  vertexProjectId?: string;
  vertexRegion?: string;
  
  // Gemini specific
  geminiApiKey?: string;
  
  // Other provider options
  [key: string]: any;
}

export interface ApiResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}

// Constants for reasoning models
export const DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS = 64000
export const DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS = 25000

// Helper functions for reasoning capabilities
export function shouldUseReasoningBudget({ model, settings }: { model: ModelInfo; settings: ProviderSettings }): boolean {
  return model.supportsReasoningBudget === true && settings.enableReasoningEffort !== false
}

export function shouldUseReasoningEffort({ model, settings }: { model: ModelInfo; settings: ProviderSettings }): boolean {
  return model.supportsReasoningEffort === true && settings.enableReasoningEffort === true
}

export function getModelMaxOutputTokens({ 
  modelId, 
  model, 
  settings, 
  format 
}: { 
  modelId: string; 
  model: ModelInfo; 
  settings: ProviderSettings; 
  format: string 
}): number | undefined {
  // Use custom max tokens if specified
  if (settings.modelMaxTokens) {
    return settings.modelMaxTokens
  }
  
  // Use model's default max tokens
  return model.maxTokens || undefined
}

// Model definitions for different providers
export interface ModelRecord {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxTokens: number;
  pricing?: {
    input: number;
    output: number;
  };
}

export type RouterName = 'openrouter' | 'litellm' | 'ollama' | 'local';

// Cerebras model definitions
export type CerebrasModelId = 'llama3.1-8b' | 'llama3.1-70b';
export const cerebrasDefaultModelId: CerebrasModelId = 'llama3.1-8b';
export const cerebrasModels: Record<CerebrasModelId, ModelRecord> = {
  'llama3.1-8b': {
    id: 'llama3.1-8b',
    name: 'Llama 3.1 8B',
    description: 'Fast and efficient 8B parameter model',
    contextWindow: 128000,
    maxTokens: 8192
  },
  'llama3.1-70b': {
    id: 'llama3.1-70b', 
    name: 'Llama 3.1 70B',
    description: 'Large 70B parameter model for complex tasks',
    contextWindow: 128000,
    maxTokens: 8192
  }
};

// Fireworks model definitions
export type FireworksModelId = 'llama-v3p1-8b-instruct' | 'llama-v3p1-70b-instruct';
export const fireworksDefaultModelId: FireworksModelId = 'llama-v3p1-8b-instruct';
export const fireworksModels: Record<FireworksModelId, ModelRecord> = {
  'llama-v3p1-8b-instruct': {
    id: 'llama-v3p1-8b-instruct',
    name: 'Llama 3.1 8B Instruct',
    description: 'Instruction-tuned 8B parameter model',
    contextWindow: 128000,
    maxTokens: 8192
  },
  'llama-v3p1-70b-instruct': {
    id: 'llama-v3p1-70b-instruct',
    name: 'Llama 3.1 70B Instruct', 
    description: 'Instruction-tuned 70B parameter model',
    contextWindow: 128000,
    maxTokens: 8192
  }
};

// Options for fetching models
export interface GetModelsOptions {
  provider?: string;
  cached?: boolean;
  refresh?: boolean;
}