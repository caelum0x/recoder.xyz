/**
 * AI Models
 * Model configuration and selection for AI generation
 * Adapted from Libra's AI models module
 */

import type { AIModel, AIProvider, ProviderOptions } from './types';

// ============================================================================
// Model Definitions
// ============================================================================

/**
 * All available AI models
 */
export const AI_MODELS: AIModel[] = [
  // Anthropic Models
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 64000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: true,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 4096,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 4096,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
  },

  // OpenAI Models
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  {
    id: 'openai/o1-preview',
    name: 'O1 Preview',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: false,
    supportsFunctionCalling: false,
    supportsThinking: true,
    inputCostPer1M: 15.0,
    outputCostPer1M: 60.0,
  },
  {
    id: 'openai/o1-mini',
    name: 'O1 Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 65536,
    supportsVision: false,
    supportsFunctionCalling: false,
    supportsThinking: true,
    inputCostPer1M: 3.0,
    outputCostPer1M: 12.0,
  },

  // Google Models
  {
    id: 'google/gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: true,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
  },
  {
    id: 'google/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    contextWindow: 2000000,
    maxOutput: 8192,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro Preview',
    provider: 'google',
    contextWindow: 1000000,
    maxOutput: 65536,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsThinking: true,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
  },

  // Groq Models (fast inference)
  {
    id: 'groq/llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 0.59,
    outputCostPer1M: 0.79,
  },
  {
    id: 'groq/mixtral-8x7b-32768',
    name: 'Mixtral 8x7B (Groq)',
    provider: 'groq',
    contextWindow: 32768,
    maxOutput: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 0.24,
    outputCostPer1M: 0.24,
  },

  // DeepSeek Models (via OpenRouter)
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'openrouter',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'openrouter',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsThinking: true,
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
  },

  // XAI Models
  {
    id: 'xai/grok-3-fast-beta',
    name: 'Grok 3 Fast',
    provider: 'xai',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsThinking: false,
    inputCostPer1M: 5.0,
    outputCostPer1M: 15.0,
  },
];

// ============================================================================
// Model Mapping
// ============================================================================

/**
 * Map from model ID to internal provider model name
 */
export const MODEL_MAPPING: Record<string, string> = {
  'gpt-4-1': 'chat-model-reasoning-azure',
  'gpt-4-1-mini': 'chat-model-reasoning-azure-mini',
  'claude-4-0-sonnet': 'chat-model-reasoning-anthropic',
  'gemini-2-5-pro': 'chat-model-reasoning-google',
  'deepseek-v3': 'deepseek/deepseek-chat',
  'deepseek-r1': 'deepseek/deepseek-r1',
};

/**
 * Default models for different operations
 */
export const DEFAULT_MODELS = {
  /** Default model for file edit operations */
  FILE_EDIT: 'gpt-4-1-mini',
  /** Default fallback model */
  FALLBACK: 'anthropic/claude-3.5-sonnet',
  /** Default model for file edit fallback */
  FILE_EDIT_FALLBACK: 'anthropic/claude-3-haiku',
  /** Default model for new projects */
  NEW_PROJECT: 'anthropic/claude-3.5-sonnet',
} as const;

// ============================================================================
// Model Selection
// ============================================================================

/**
 * Get model by ID
 */
export function getModelById(modelId: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: AIProvider): AIModel[] {
  return AI_MODELS.filter((m) => m.provider === provider);
}

/**
 * Get models that support a feature
 */
export function getModelsWithFeature(
  feature: 'vision' | 'functionCalling' | 'thinking'
): AIModel[] {
  switch (feature) {
    case 'vision':
      return AI_MODELS.filter((m) => m.supportsVision);
    case 'functionCalling':
      return AI_MODELS.filter((m) => m.supportsFunctionCalling);
    case 'thinking':
      return AI_MODELS.filter((m) => m.supportsThinking);
  }
}

/**
 * Check if user plan can access model
 */
export function canAccessModel(userPlan: string, modelId: string): boolean {
  const model = getModelById(modelId);
  if (!model) return false;

  // No plan restrictions in recoder
  return true;
}

/**
 * Get default model for user plan
 */
export function getDefaultModelForPlan(userPlan: string): AIModel {
  // Return default model for recoder
  return (
    getModelById(DEFAULT_MODELS.NEW_PROJECT) ||
    AI_MODELS[0]
  );
}

/**
 * Select and validate AI model
 */
export function selectModel(
  userPlan: string,
  selectedModelId?: string,
  isFileEdit = false
): string {
  let modelToUse = selectedModelId;

  if (isFileEdit) {
    modelToUse = DEFAULT_MODELS.FILE_EDIT;
  } else if (!modelToUse) {
    const defaultModel = getDefaultModelForPlan(userPlan);
    modelToUse = defaultModel.id;
  } else {
    // Check access
    if (!canAccessModel(userPlan, modelToUse)) {
      const requestedModel = getModelById(modelToUse);
      console.warn(
        `Model ${requestedModel?.name || modelToUse} not accessible, using default`
      );
      modelToUse = getDefaultModelForPlan(userPlan).id;
    }
  }

  // Return mapped model or original
  return (
    MODEL_MAPPING[modelToUse] ||
    (isFileEdit ? DEFAULT_MODELS.FILE_EDIT_FALLBACK : DEFAULT_MODELS.FALLBACK)
  );
}

// ============================================================================
// Provider Options
// ============================================================================

/**
 * Build provider options based on model and config
 */
export function buildProviderOptions(
  modelId?: string,
  enableThinking?: boolean
): ProviderOptions {
  const model = modelId ? getModelById(modelId) : undefined;

  const options: ProviderOptions = {};

  // Anthropic options
  if (model?.provider === 'anthropic' && model.supportsThinking && enableThinking !== false) {
    options.anthropic = {
      thinking: { type: 'enabled', budgetTokens: 4096 },
    };
  }

  // OpenAI options
  if (model?.provider === 'openai' && model.supportsThinking) {
    options.openai = {
      reasoningEffort: 'medium',
    };
  }

  return options;
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate cost for a request
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const model = getModelById(modelId);
  if (!model || model.inputCostPer1M === undefined || model.outputCostPer1M === undefined) {
    return undefined;
  }

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;

  return inputCost + outputCost;
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(4)}¢`;
  }
  return `$${cost.toFixed(4)}`;
}

// ============================================================================
// Model Selection Helpers
// ============================================================================

/**
 * Get best model for task based on requirements
 */
export function getBestModelForTask(options: {
  requiresVision?: boolean;
  requiresThinking?: boolean;
  requiresFunctionCalling?: boolean;
  maxContextNeeded?: number;
  preferredProvider?: AIProvider;
  maxCostPer1M?: number;
}): AIModel | undefined {
  let candidates = [...AI_MODELS];

  // Filter by requirements
  if (options.requiresVision) {
    candidates = candidates.filter((m) => m.supportsVision);
  }
  if (options.requiresThinking) {
    candidates = candidates.filter((m) => m.supportsThinking);
  }
  if (options.requiresFunctionCalling) {
    candidates = candidates.filter((m) => m.supportsFunctionCalling);
  }
  if (options.maxContextNeeded) {
    candidates = candidates.filter((m) => m.contextWindow >= options.maxContextNeeded!);
  }
  if (options.maxCostPer1M !== undefined) {
    candidates = candidates.filter(
      (m) => (m.inputCostPer1M ?? 0) <= options.maxCostPer1M!
    );
  }

  // Prefer specified provider
  if (options.preferredProvider) {
    const preferred = candidates.filter((m) => m.provider === options.preferredProvider);
    if (preferred.length > 0) {
      candidates = preferred;
    }
  }

  // Sort by capability (context window) descending, then by cost ascending
  candidates.sort((a, b) => {
    const contextDiff = b.contextWindow - a.contextWindow;
    if (contextDiff !== 0) return contextDiff;
    return (a.inputCostPer1M ?? 0) - (b.inputCostPer1M ?? 0);
  });

  return candidates[0];
}

/**
 * Get popular models for quick selection
 */
export function getPopularModels(): AIModel[] {
  const popularIds = [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash-exp',
    'deepseek/deepseek-chat',
  ];

  return popularIds
    .map((id) => getModelById(id))
    .filter((m): m is AIModel => m !== undefined);
}
