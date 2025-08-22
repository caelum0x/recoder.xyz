/**
 * Production Configuration for CLI
 * Connects to centralized production engine with OpenRouter integration
 * Users don't need their own API keys - we handle all AI costs via subscription
 */

export interface ProductionConfig {
  productionEngineUrl: string;
  backendUrl: string;
  websiteUrl: string;
  centralizedOpenRouterKey: string;
  enableTelemetry: boolean;
  enableAutoUpdates: boolean;
  defaultTimeout: number;
  retryAttempts: number;
}

export const PRODUCTION_CONFIG: ProductionConfig = {
  // Production engine handles all AI requests with our OpenRouter key
  productionEngineUrl: process.env.PRODUCTION_ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL || 'https://engine.recoder.xyz',
  
  // Backend handles authentication and billing
  backendUrl: process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.recoder.xyz',
  
  // Main website for user management
  websiteUrl: process.env.WEBSITE_URL || process.env.NEXT_PUBLIC_WEB_URL || 'https://recoder.xyz',
  
  // OpenRouter API key from environment (CLI doesn't need to know the key)
  centralizedOpenRouterKey: process.env.OPENROUTER_API_KEY || '',
  
  // Analytics and monitoring
  enableTelemetry: process.env.ENABLE_TELEMETRY !== 'false',
  enableAutoUpdates: process.env.ENABLE_AUTO_UPDATES !== 'false',
  
  // Request configuration
  defaultTimeout: parseInt(process.env.REQUEST_TIMEOUT || '120000'), // 2 minutes
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3')
};

// Development/local configuration
export const DEVELOPMENT_CONFIG: ProductionConfig = {
  productionEngineUrl: 'http://localhost:3002',
  backendUrl: 'http://localhost:3001', 
  websiteUrl: 'http://localhost:3000',
  centralizedOpenRouterKey: process.env.OPENROUTER_API_KEY || '',
  enableTelemetry: true,
  enableAutoUpdates: false,
  defaultTimeout: 60000,
  retryAttempts: 2
};

// Get configuration based on environment
export function getConfig(): ProductionConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    return PRODUCTION_CONFIG;
  }
  
  return DEVELOPMENT_CONFIG;
}

// Available AI models through our production engine
export const AVAILABLE_MODELS = [
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: 'premium',
    bestFor: ['complex-coding', 'architecture', 'security-review'],
    description: 'Most advanced model for complex coding tasks'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    tier: 'premium',
    bestFor: ['fast-coding', 'large-projects', 'documentation'],
    description: 'Fastest premium model for rapid development'
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google', 
    tier: 'premium',
    bestFor: ['multimodal', 'web-development', 'ui-components'],
    description: 'Excellent for frontend and visual development'
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    tier: 'premium',
    bestFor: ['algorithms', 'math', 'optimization'],
    description: 'Specialized in mathematical and algorithmic problems'
  },
  {
    id: 'qwen3-coder',
    name: 'Qwen3 Coder',
    provider: 'qwen',
    tier: 'premium',
    bestFor: ['debugging', 'code-review', 'refactoring'],
    description: 'Purpose-built for code analysis and improvement'
  },
  {
    id: 'deepseek-free',
    name: 'DeepSeek V3 (Free)',
    provider: 'deepseek',
    tier: 'free',
    bestFor: ['learning', 'basic-coding', 'experimentation'],
    description: 'Free tier model for getting started'
  }
];

// Subscription tiers and their model access
export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    requestsPerMonth: 100,
    modelsAccess: ['deepseek-free'],
    features: ['Basic code generation', 'Community support']
  },
  pro: {
    name: 'Pro',
    price: 20,
    requestsPerMonth: 10000,
    modelsAccess: ['claude-sonnet-4', 'gemini-2.5-flash', 'gemini-2.0-flash', 'deepseek-v3', 'qwen3-coder'],
    features: ['All premium models', 'Priority support', 'Advanced features', 'Router optimization']
  },
  enterprise: {
    name: 'Enterprise',
    price: 100,
    requestsPerMonth: 100000,
    modelsAccess: ['claude-sonnet-4', 'gemini-2.5-flash', 'gemini-2.0-flash', 'deepseek-v3', 'qwen3-coder'],
    features: ['All premium models', 'Dedicated support', 'Team management', 'Custom integrations', 'SLA guarantees']
  }
};

// Default model selection based on task type
export function getDefaultModel(taskType: 'coding' | 'debugging' | 'architecture' | 'frontend' | 'algorithms' = 'coding'): string {
  const modelMap = {
    coding: 'claude-sonnet-4',
    debugging: 'qwen3-coder', 
    architecture: 'claude-sonnet-4',
    frontend: 'gemini-2.0-flash',
    algorithms: 'deepseek-v3'
  };
  
  return modelMap[taskType] || 'claude-sonnet-4';
}