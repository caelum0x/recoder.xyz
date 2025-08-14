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