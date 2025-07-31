/**
 * Reasoning and budget utilities
 */

// Import the actual types from @roo-code/types for compatibility
import type { ModelInfo, ProviderSettings } from '@roo-code/types';

export const DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS = 16_384
export const DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS = 8_192

export function shouldUseReasoningBudget(modelOrOptions: string | { model: ModelInfo; settings: ProviderSettings }): boolean {
  if (typeof modelOrOptions === 'string') {
    // Check if model supports reasoning budget
    const reasoningModels = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-5-sonnet-20241022',
      'gpt-4',
      'gpt-4-turbo'
    ]
    
    return reasoningModels.some(m => modelOrOptions.includes(m))
  }
  
  // For the object form, check model properties
  const { model } = modelOrOptions
  return shouldUseReasoningBudget(model.description || '')
}

export function shouldUseReasoningEffort(options: { model: ModelInfo; settings: ProviderSettings }): boolean {
  // Check if model supports reasoning effort (traditional reasoning models)
  const { model } = options
  const modelName = model.description || ''
  
  const reasoningEffortModels = [
    'o1-preview',
    'o1-mini',
    'o3-mini'
  ]
  
  return reasoningEffortModels.some(m => modelName.includes(m))
}

export function getModelMaxOutputTokens(options: {
  modelId: string
  model: ModelInfo
  settings: ProviderSettings
  format: string
}): number | undefined {
  const { model, settings } = options
  
  // Use custom max tokens from settings if provided
  if (settings.modelMaxTokens) {
    return settings.modelMaxTokens
  }
  
  // Use model's maxTokens if available
  if (model.maxTokens && model.maxTokens > 0) {
    return model.maxTokens
  }
  
  // For reasoning models, use default
  if (shouldUseReasoningBudget(options)) {
    return DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS
  }
  
  // Default fallback
  return undefined
}