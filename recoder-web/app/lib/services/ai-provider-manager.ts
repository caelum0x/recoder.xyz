/**
 * AI Provider Manager Service
 * Unified interface for managing multiple AI providers (OpenRouter, Anthropic, OpenAI, Google, Groq)
 *
 * Based on open-lovable's provider-manager.ts
 * Adapted for recoder-web with:
 * - Nanostores for state management
 * - Support for OpenRouter as primary provider
 * - Direct API clients as fallback
 * - Caching and error handling
 *
 * Features:
 * 1. Unified provider interface
 * 2. Automatic provider selection based on model ID
 * 3. API key management and validation
 * 4. Provider health checking
 * 5. Rate limit handling
 * 6. Caching of provider instances
 */

import { atom, map, type WritableAtom, type MapStore } from 'nanostores';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported AI providers
 */
export type ProviderName = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'groq';

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Optional base URL override */
  baseURL?: string;
  /** Optional organization ID (for OpenAI) */
  organizationId?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries for failed requests */
  maxRetries?: number;
}

/**
 * Provider resolution result
 */
export interface ProviderResolution {
  /** The provider name */
  provider: ProviderName;
  /** The actual model ID to use with the provider */
  actualModel: string;
  /** The configuration for the provider */
  config: ProviderConfig;
  /** Whether this resolution uses a fallback */
  isFallback: boolean;
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  /** Whether the provider is currently healthy */
  isHealthy: boolean;
  /** Last check timestamp */
  lastChecked: number;
  /** Last error message if unhealthy */
  lastError?: string;
  /** Average response time in ms */
  avgResponseTime?: number;
  /** Rate limit info */
  rateLimit?: {
    remaining: number;
    reset: number;
  };
}

/**
 * Model information
 */
export interface ModelInfo {
  /** Model ID */
  id: string;
  /** Display name */
  name: string;
  /** Provider */
  provider: ProviderName;
  /** Context window size */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutput: number;
  /** Whether the model supports vision */
  supportsVision: boolean;
  /** Whether the model supports function calling */
  supportsFunctionCalling: boolean;
  /** Cost per 1M input tokens (USD) */
  inputCostPer1M?: number;
  /** Cost per 1M output tokens (USD) */
  outputCostPer1M?: number;
}

/**
 * Provider manager state
 */
export interface ProviderManagerState {
  /** Primary provider */
  primaryProvider: ProviderName;
  /** Provider health status */
  health: Map<ProviderName, ProviderHealth>;
  /** Available models */
  models: Map<string, ModelInfo>;
  /** Last used model */
  lastUsedModel?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default timeouts and retry settings
 */
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_RETRIES = 3;
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutes
const CACHE_TTL = 3600000; // 1 hour

/**
 * Provider API endpoints
 */
const PROVIDER_ENDPOINTS: Record<ProviderName, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
};

/**
 * Model prefix to provider mapping
 */
const MODEL_PREFIXES: Record<string, ProviderName> = {
  'anthropic/': 'anthropic',
  'claude-': 'anthropic',
  'openai/': 'openai',
  'gpt-': 'openai',
  'o1-': 'openai',
  'google/': 'google',
  'gemini-': 'google',
  'groq/': 'groq',
  'llama-': 'groq',
  'mixtral-': 'groq',
  'deepseek/': 'openrouter',
  'meta-llama/': 'openrouter',
  'mistralai/': 'openrouter',
  'qwen/': 'openrouter',
};

/**
 * Popular models with their information
 */
const KNOWN_MODELS: ModelInfo[] = [
  // Anthropic
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsVision: true,
    supportsFunctionCalling: true,
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
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
  },
  // OpenAI
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsFunctionCalling: true,
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
    inputCostPer1M: 15.0,
    outputCostPer1M: 60.0,
  },
  // Google
  {
    id: 'google/gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsVision: true,
    supportsFunctionCalling: true,
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
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
  },
  // Groq (fast inference)
  {
    id: 'groq/llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
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
    inputCostPer1M: 0.24,
    outputCostPer1M: 0.24,
  },
  // DeepSeek (via OpenRouter)
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'openrouter',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsFunctionCalling: true,
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
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
  },
];

// ============================================================================
// STATE STORES (nanostores)
// ============================================================================

/** Current primary provider */
export const primaryProvider: WritableAtom<ProviderName> = atom<ProviderName>('openrouter');

/** Provider health status */
export const providerHealth: MapStore<Record<ProviderName, ProviderHealth>> = map({
  openrouter: { isHealthy: true, lastChecked: 0 },
  anthropic: { isHealthy: true, lastChecked: 0 },
  openai: { isHealthy: true, lastChecked: 0 },
  google: { isHealthy: true, lastChecked: 0 },
  groq: { isHealthy: true, lastChecked: 0 },
});

/** API keys store (in-memory only, never persisted) */
const apiKeys: Map<ProviderName, string> = new Map();

/** Provider config cache */
const configCache: Map<ProviderName, { config: ProviderConfig; timestamp: number }> = new Map();

/** Models cache */
const modelsCache: Map<string, ModelInfo> = new Map();

// Initialize models cache
for (const model of KNOWN_MODELS) {
  modelsCache.set(model.id, model);
}

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Set API key for a provider
 */
export function setApiKey(provider: ProviderName, apiKey: string): void {
  apiKeys.set(provider, apiKey);
  // Invalidate config cache
  configCache.delete(provider);
}

/**
 * Get API key for a provider
 * Checks memory first, then environment variables
 */
export function getApiKey(provider: ProviderName): string | undefined {
  // Check memory first
  if (apiKeys.has(provider)) {
    return apiKeys.get(provider);
  }

  // Fall back to environment variables
  const envVarNames: Record<ProviderName, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    groq: 'GROQ_API_KEY',
  };

  const envVar = envVarNames[provider];
  if (typeof process !== 'undefined' && process.env) {
    return process.env[envVar];
  }

  return undefined;
}

/**
 * Check if a provider has a valid API key configured
 */
export function hasApiKey(provider: ProviderName): boolean {
  return !!getApiKey(provider);
}

/**
 * Clear API key for a provider
 */
export function clearApiKey(provider: ProviderName): void {
  apiKeys.delete(provider);
  configCache.delete(provider);
}

// ============================================================================
// PROVIDER RESOLUTION
// ============================================================================

/**
 * Determine the provider for a given model ID
 */
export function getProviderForModel(modelId: string): ProviderName {
  // Check exact prefix matches
  for (const [prefix, provider] of Object.entries(MODEL_PREFIXES)) {
    if (modelId.startsWith(prefix) || modelId.includes(prefix)) {
      return provider;
    }
  }

  // Check if it's in our known models
  const knownModel = modelsCache.get(modelId);
  if (knownModel) {
    return knownModel.provider;
  }

  // Default to OpenRouter for unknown models (it supports many providers)
  return 'openrouter';
}

/**
 * Get the actual model ID to use with a provider
 * Some providers need the model ID without the provider prefix
 */
export function getActualModelId(modelId: string, provider: ProviderName): string {
  // OpenRouter uses full model IDs with provider prefix
  if (provider === 'openrouter') {
    return modelId;
  }

  // For direct providers, strip the provider prefix
  const prefixes = ['anthropic/', 'openai/', 'google/', 'groq/'];
  for (const prefix of prefixes) {
    if (modelId.startsWith(prefix)) {
      return modelId.substring(prefix.length);
    }
  }

  return modelId;
}

/**
 * Resolve provider and model for a given model ID
 */
export function resolveProvider(modelId: string): ProviderResolution {
  const provider = getProviderForModel(modelId);
  const actualModel = getActualModelId(modelId, provider);
  const apiKey = getApiKey(provider);

  // Check if we need to fall back to OpenRouter
  let isFallback = false;
  let finalProvider = provider;
  let finalApiKey = apiKey;

  if (!apiKey && provider !== 'openrouter') {
    // Try to use OpenRouter as fallback
    const openRouterKey = getApiKey('openrouter');
    if (openRouterKey) {
      finalProvider = 'openrouter';
      finalApiKey = openRouterKey;
      isFallback = true;
    }
  }

  const config: ProviderConfig = {
    apiKey: finalApiKey || '',
    baseURL: PROVIDER_ENDPOINTS[finalProvider],
    timeout: DEFAULT_TIMEOUT,
    maxRetries: DEFAULT_MAX_RETRIES,
  };

  return {
    provider: finalProvider,
    actualModel: isFallback ? modelId : actualModel,
    config,
    isFallback,
  };
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: ProviderName): ProviderConfig | null {
  // Check cache first
  const cached = configCache.get(provider);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return null;
  }

  const config: ProviderConfig = {
    apiKey,
    baseURL: PROVIDER_ENDPOINTS[provider],
    timeout: DEFAULT_TIMEOUT,
    maxRetries: DEFAULT_MAX_RETRIES,
  };

  // Cache the config
  configCache.set(provider, { config, timestamp: Date.now() });

  return config;
}

/**
 * Get all available providers (those with API keys)
 */
export function getAvailableProviders(): ProviderName[] {
  const providers: ProviderName[] = [];

  for (const provider of Object.keys(PROVIDER_ENDPOINTS) as ProviderName[]) {
    if (hasApiKey(provider)) {
      providers.push(provider);
    }
  }

  return providers;
}

// ============================================================================
// PROVIDER HEALTH
// ============================================================================

/**
 * Check provider health
 */
export async function checkProviderHealth(provider: ProviderName): Promise<ProviderHealth> {
  const config = getProviderConfig(provider);
  const health: ProviderHealth = {
    isHealthy: false,
    lastChecked: Date.now(),
  };

  if (!config) {
    health.lastError = 'No API key configured';
    providerHealth.setKey(provider, health);
    return health;
  }

  const startTime = Date.now();

  try {
    // Make a lightweight request to check health
    let url: string;
    let headers: Record<string, string>;

    switch (provider) {
      case 'openrouter':
        url = `${config.baseURL}/models`;
        headers = {
          Authorization: `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://recoder.xyz',
        };
        break;

      case 'anthropic':
        // Anthropic doesn't have a models endpoint, so we'll just check the API is reachable
        url = `${config.baseURL}/messages`;
        headers = {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        };
        // This will return 400 (no body) but proves the API is reachable
        break;

      case 'openai':
        url = `${config.baseURL}/models`;
        headers = {
          Authorization: `Bearer ${config.apiKey}`,
        };
        break;

      case 'google':
        url = `${config.baseURL}/models?key=${config.apiKey}`;
        headers = {};
        break;

      case 'groq':
        url = `${config.baseURL}/models`;
        headers = {
          Authorization: `Bearer ${config.apiKey}`,
        };
        break;

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: provider === 'anthropic' ? 'POST' : 'GET',
      headers,
      signal: controller.signal,
      body: provider === 'anthropic' ? JSON.stringify({}) : undefined,
    });

    clearTimeout(timeoutId);

    // For Anthropic, 400 is expected (no body), other 4xx are auth errors
    const isHealthy =
      response.ok ||
      (provider === 'anthropic' && response.status === 400);

    health.isHealthy = isHealthy;
    health.avgResponseTime = Date.now() - startTime;

    if (!isHealthy) {
      health.lastError = `HTTP ${response.status}: ${response.statusText}`;
    }

    // Parse rate limit headers if present
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    if (remaining || reset) {
      health.rateLimit = {
        remaining: remaining ? parseInt(remaining, 10) : -1,
        reset: reset ? parseInt(reset, 10) : 0,
      };
    }
  } catch (error) {
    health.lastError = error instanceof Error ? error.message : String(error);
    health.avgResponseTime = Date.now() - startTime;
  }

  providerHealth.setKey(provider, health);
  return health;
}

/**
 * Check all provider health
 */
export async function checkAllProvidersHealth(): Promise<Map<ProviderName, ProviderHealth>> {
  const results = new Map<ProviderName, ProviderHealth>();
  const providers = getAvailableProviders();

  await Promise.all(
    providers.map(async (provider) => {
      const health = await checkProviderHealth(provider);
      results.set(provider, health);
    })
  );

  return results;
}

/**
 * Get cached health status for a provider
 */
export function getProviderHealthStatus(provider: ProviderName): ProviderHealth | undefined {
  return providerHealth.get()[provider];
}

/**
 * Check if a provider is healthy
 */
export function isProviderHealthy(provider: ProviderName): boolean {
  const health = providerHealth.get()[provider];
  if (!health) return false;

  // Consider stale health checks as potentially unhealthy
  if (Date.now() - health.lastChecked > HEALTH_CHECK_INTERVAL) {
    return true; // Assume healthy if we haven't checked recently
  }

  return health.isHealthy;
}

// ============================================================================
// MODEL INFORMATION
// ============================================================================

/**
 * Get model information
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return modelsCache.get(modelId);
}

/**
 * Get all known models
 */
export function getAllModels(): ModelInfo[] {
  return Array.from(modelsCache.values());
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider: ProviderName): ModelInfo[] {
  return getAllModels().filter((m) => m.provider === provider);
}

/**
 * Register a custom model
 */
export function registerModel(model: ModelInfo): void {
  modelsCache.set(model.id, model);
}

/**
 * Get models that support a specific feature
 */
export function getModelsWithFeature(
  feature: 'vision' | 'functionCalling'
): ModelInfo[] {
  return getAllModels().filter((m) =>
    feature === 'vision' ? m.supportsVision : m.supportsFunctionCalling
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Estimate cost for a request
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const model = getModelInfo(modelId);
  if (!model || model.inputCostPer1M === undefined || model.outputCostPer1M === undefined) {
    return undefined;
  }

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;

  return inputCost + outputCost;
}

/**
 * Get the best available model for a use case
 */
export function getBestAvailableModel(options: {
  requiresVision?: boolean;
  requiresFunctionCalling?: boolean;
  maxContextWindow?: number;
  maxCostPer1M?: number;
  preferredProvider?: ProviderName;
}): ModelInfo | undefined {
  let candidates = getAllModels();

  // Filter by requirements
  if (options.requiresVision) {
    candidates = candidates.filter((m) => m.supportsVision);
  }
  if (options.requiresFunctionCalling) {
    candidates = candidates.filter((m) => m.supportsFunctionCalling);
  }
  if (options.maxContextWindow) {
    candidates = candidates.filter(
      (m) => m.contextWindow >= options.maxContextWindow!
    );
  }
  if (options.maxCostPer1M !== undefined) {
    candidates = candidates.filter(
      (m) => (m.inputCostPer1M ?? 0) <= options.maxCostPer1M!
    );
  }

  // Filter by available providers
  candidates = candidates.filter((m) => hasApiKey(m.provider) || hasApiKey('openrouter'));

  // Prefer specified provider
  if (options.preferredProvider) {
    const preferred = candidates.filter(
      (m) => m.provider === options.preferredProvider
    );
    if (preferred.length > 0) {
      candidates = preferred;
    }
  }

  // Sort by capability (context window) descending
  candidates.sort((a, b) => b.contextWindow - a.contextWindow);

  return candidates[0];
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: ProviderName): string {
  const names: Record<ProviderName, string> = {
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    groq: 'Groq',
  };
  return names[provider];
}

/**
 * Validate API key format (basic check)
 */
export function validateApiKeyFormat(provider: ProviderName, apiKey: string): boolean {
  if (!apiKey || apiKey.length < 10) {
    return false;
  }

  // Provider-specific validation
  switch (provider) {
    case 'openrouter':
      return apiKey.startsWith('sk-or-');
    case 'anthropic':
      return apiKey.startsWith('sk-ant-');
    case 'openai':
      return apiKey.startsWith('sk-');
    case 'groq':
      return apiKey.startsWith('gsk_');
    case 'google':
      return apiKey.length >= 30; // Google API keys are typically longer
    default:
      return true;
  }
}

/**
 * Initialize provider manager with environment variables
 */
export function initializeFromEnvironment(): void {
  const providers: ProviderName[] = ['openrouter', 'anthropic', 'openai', 'google', 'groq'];

  for (const provider of providers) {
    const apiKey = getApiKey(provider);
    if (apiKey) {
      setApiKey(provider, apiKey);
    }
  }
}

/**
 * Get provider summary for debugging
 */
export function getProviderSummary(): {
  providers: Array<{
    name: ProviderName;
    hasKey: boolean;
    isHealthy: boolean;
    modelCount: number;
  }>;
  totalModels: number;
  primaryProvider: ProviderName;
} {
  const providers: ProviderName[] = ['openrouter', 'anthropic', 'openai', 'google', 'groq'];

  return {
    providers: providers.map((name) => ({
      name,
      hasKey: hasApiKey(name),
      isHealthy: isProviderHealthy(name),
      modelCount: getModelsForProvider(name).length,
    })),
    totalModels: getAllModels().length,
    primaryProvider: primaryProvider.get(),
  };
}
