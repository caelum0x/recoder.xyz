/**
 * LLM Configuration for cost optimization and performance tuning
 */

export interface LLMConfig {
  promptOptimization: {
    enabled: boolean;
    strategy: 'smart' | 'minimal' | 'optimized' | 'context-aware' | 'original';
    adaptiveSelection: boolean;
    responseOptimization: boolean;
  };
  caching: {
    enabled: boolean;
    systemPromptTTL: number;
    templateDataTTL: number;
    conversationTTL: number;
  };
  responseControl: {
    maxTokens: number;
    encourageConciseness: boolean;
    artifactFirst: boolean;
  };
  analytics: {
    trackTokenUsage: boolean;
    trackCostSavings: boolean;
    trackPromptEffectiveness: boolean;
  };
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  promptOptimization: {
    enabled: true,
    strategy: 'smart',
    adaptiveSelection: true,
    responseOptimization: true,
  },
  caching: {
    enabled: true,
    systemPromptTTL: 3600, // 1 hour
    templateDataTTL: 300,   // 5 minutes
    conversationTTL: 300,   // 5 minutes
  },
  responseControl: {
    maxTokens: 16000,
    encourageConciseness: true,
    artifactFirst: true,
  },
  analytics: {
    trackTokenUsage: true,
    trackCostSavings: true,
    trackPromptEffectiveness: true,
  }
};

// Environment-based configuration
export const getLLMConfig = (env?: Env): LLMConfig => {
  // In production, use more aggressive optimization
  if (env && (env as any).NODE_ENV === 'production') {
    return {
      ...DEFAULT_LLM_CONFIG,
      promptOptimization: {
        ...DEFAULT_LLM_CONFIG.promptOptimization,
        strategy: 'smart',
        responseOptimization: true,
      },
      responseControl: {
        ...DEFAULT_LLM_CONFIG.responseControl,
        maxTokens: 16000, // gpt-4o-mini supports 16K output — use full capacity for code generation
        encourageConciseness: true,
      }
    };
  }

  return DEFAULT_LLM_CONFIG;
};

// Cost tracking utilities
export interface CostMetrics {
  originalTokens: number;
  optimizedTokens: number;
  savings: number;
  savingsPercentage: number;
  estimatedCostSaving: number; // in USD
}

export const calculateCostSavings = (
  originalTokens: number,
  optimizedTokens: number,
  costPerMToken: number = 3.0 // Claude Sonnet pricing
): CostMetrics => {
  const savings = originalTokens - optimizedTokens;
  const savingsPercentage = (savings / originalTokens) * 100;
  const estimatedCostSaving = (savings / 1000000) * costPerMToken;

  return {
    originalTokens,
    optimizedTokens,
    savings,
    savingsPercentage,
    estimatedCostSaving
  };
};

// Prompt strategy selection logic
export const selectPromptStrategy = (
  userMessage: string,
  conversationLength: number,
  config: LLMConfig
): string => {
  if (!config.promptOptimization.enabled) {
    return 'original';
  }

  if (!config.promptOptimization.adaptiveSelection) {
    return config.promptOptimization.strategy;
  }

  // Smart adaptive selection
  const message = userMessage.toLowerCase();

  // For template/framework requests, use template-specific prompts
  if (message.includes('next.js') || message.includes('react') ||
      message.includes('vue') || message.includes('svelte') ||
      message.includes('node') || message.includes('express')) {
    return 'template';
  }

  // For simple requests, use minimal
  if (message.length < 50 || message.includes('simple') ||
      message.includes('basic') || message.includes('quick')) {
    return 'minimal';
  }

  // For long conversations, prefer minimal
  if (conversationLength > 10) {
    return 'minimal';
  }

  // For medium conversations, use optimized
  if (conversationLength > 5) {
    return 'optimized';
  }

  // Default to smart selection
  return 'smart';
};