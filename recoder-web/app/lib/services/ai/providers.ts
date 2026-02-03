/**
 * AI Providers
 * Provider configuration for AI generation
 * Adapted from Libra's AI providers module
 */

import type { AIProvider, ProviderOptions } from './types';

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Base URL for API requests */
  baseURL: string;
  /** Optional organization ID (for OpenAI) */
  organizationId?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries for failed requests */
  maxRetries?: number;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Provider definition with endpoints
 */
export interface ProviderDefinition {
  name: AIProvider;
  displayName: string;
  baseURL: string;
  authHeader: string;
  authPrefix?: string;
  additionalHeaders?: Record<string, string>;
}

// ============================================================================
// Provider Definitions
// ============================================================================

/**
 * Provider endpoint definitions
 */
export const PROVIDERS: Record<AIProvider, ProviderDefinition> = {
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    additionalHeaders: {
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder AI',
    },
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
    additionalHeaders: {
      'anthropic-version': '2023-06-01',
    },
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  azure: {
    name: 'azure',
    displayName: 'Azure OpenAI',
    baseURL: '', // Set dynamically based on resource
    authHeader: 'api-key',
  },
  google: {
    name: 'google',
    displayName: 'Google AI',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    authHeader: '', // Uses query param
  },
  groq: {
    name: 'groq',
    displayName: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  xai: {
    name: 'xai',
    displayName: 'xAI',
    baseURL: 'https://api.x.ai/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
};

// ============================================================================
// Environment Variable Names
// ============================================================================

/**
 * Environment variable names for each provider
 */
export const PROVIDER_ENV_VARS: Record<AIProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  azure: 'AZURE_API_KEY',
  google: 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
};

// ============================================================================
// Provider Configuration Functions
// ============================================================================

/**
 * Get API key for a provider from environment
 */
export function getProviderApiKey(provider: AIProvider): string | undefined {
  const envVar = PROVIDER_ENV_VARS[provider];
  if (typeof process !== 'undefined' && process.env) {
    return process.env[envVar];
  }
  return undefined;
}

/**
 * Check if a provider has an API key configured
 */
export function hasProviderApiKey(provider: AIProvider): boolean {
  return !!getProviderApiKey(provider);
}

/**
 * Build provider configuration
 */
export function buildProviderConfig(
  provider: AIProvider,
  apiKey?: string
): ProviderConfig | null {
  const key = apiKey || getProviderApiKey(provider);
  if (!key) {
    return null;
  }

  const definition = PROVIDERS[provider];

  return {
    apiKey: key,
    baseURL: definition.baseURL,
    timeout: 60000,
    maxRetries: 3,
    headers: definition.additionalHeaders,
  };
}

/**
 * Get authorization headers for a provider
 */
export function getAuthHeaders(
  provider: AIProvider,
  apiKey: string
): Record<string, string> {
  const definition = PROVIDERS[provider];
  const headers: Record<string, string> = {};

  if (definition.authHeader) {
    const prefix = definition.authPrefix || '';
    headers[definition.authHeader] = prefix + apiKey;
  }

  if (definition.additionalHeaders) {
    Object.assign(headers, definition.additionalHeaders);
  }

  return headers;
}

// ============================================================================
// Model to Provider Mapping
// ============================================================================

/**
 * Model prefix to provider mapping
 */
const MODEL_PREFIXES: Record<string, AIProvider> = {
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
  'xai/': 'xai',
  'grok-': 'xai',
};

/**
 * Determine provider from model ID
 */
export function getProviderFromModelId(modelId: string): AIProvider {
  for (const [prefix, provider] of Object.entries(MODEL_PREFIXES)) {
    if (modelId.startsWith(prefix) || modelId.includes(prefix)) {
      return provider;
    }
  }
  // Default to OpenRouter for unknown models
  return 'openrouter';
}

/**
 * Get the actual model ID to use with a provider
 * (some providers need the prefix stripped)
 */
export function getActualModelId(modelId: string, provider: AIProvider): string {
  // OpenRouter uses full model IDs
  if (provider === 'openrouter') {
    return modelId;
  }

  // Strip provider prefix for direct providers
  const prefixes = ['anthropic/', 'openai/', 'google/', 'groq/', 'xai/'];
  for (const prefix of prefixes) {
    if (modelId.startsWith(prefix)) {
      return modelId.substring(prefix.length);
    }
  }

  return modelId;
}

// ============================================================================
// Provider Health Checking
// ============================================================================

/**
 * Provider health status
 */
export interface ProviderHealth {
  isHealthy: boolean;
  lastChecked: number;
  latencyMs?: number;
  error?: string;
  rateLimit?: {
    remaining: number;
    reset: number;
  };
}

/**
 * Check provider health
 */
export async function checkProviderHealth(
  provider: AIProvider
): Promise<ProviderHealth> {
  const startTime = Date.now();
  const health: ProviderHealth = {
    isHealthy: false,
    lastChecked: startTime,
  };

  const config = buildProviderConfig(provider);
  if (!config) {
    health.error = 'No API key configured';
    return health;
  }

  try {
    let url: string;
    let method = 'GET';
    let body: string | undefined;

    switch (provider) {
      case 'openrouter':
        url = `${config.baseURL}/models`;
        break;
      case 'anthropic':
        url = `${config.baseURL}/messages`;
        method = 'POST';
        body = JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [] });
        break;
      case 'openai':
        url = `${config.baseURL}/models`;
        break;
      case 'google':
        url = `${config.baseURL}/models?key=${config.apiKey}`;
        break;
      case 'groq':
        url = `${config.baseURL}/models`;
        break;
      case 'xai':
        url = `${config.baseURL}/models`;
        break;
      default:
        url = config.baseURL;
    }

    const headers = getAuthHeaders(provider, config.apiKey);
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // For Anthropic, 400 is expected (empty messages), other errors are failures
    const isHealthy =
      response.ok || (provider === 'anthropic' && response.status === 400);

    health.isHealthy = isHealthy;
    health.latencyMs = Date.now() - startTime;

    if (!isHealthy) {
      health.error = `HTTP ${response.status}: ${response.statusText}`;
    }

    // Parse rate limit headers
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    if (remaining || reset) {
      health.rateLimit = {
        remaining: remaining ? parseInt(remaining, 10) : -1,
        reset: reset ? parseInt(reset, 10) : 0,
      };
    }
  } catch (error) {
    health.error = error instanceof Error ? error.message : String(error);
    health.latencyMs = Date.now() - startTime;
  }

  return health;
}

// ============================================================================
// Available Providers
// ============================================================================

/**
 * Get list of all available providers (with API keys)
 */
export function getAvailableProviders(): AIProvider[] {
  return (Object.keys(PROVIDERS) as AIProvider[]).filter(hasProviderApiKey);
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(provider: AIProvider): string {
  return PROVIDERS[provider]?.displayName || provider;
}

/**
 * Validate API key format for a provider
 */
export function validateApiKeyFormat(provider: AIProvider, apiKey: string): boolean {
  if (!apiKey || apiKey.length < 10) {
    return false;
  }

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
      return apiKey.length >= 30;
    case 'xai':
      return apiKey.startsWith('xai-');
    default:
      return true;
  }
}
