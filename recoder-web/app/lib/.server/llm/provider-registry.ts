/**
 * Multi-Provider AI Registry
 *
 * Unified interface for multiple AI providers inspired by kilocode and open-lovable.
 * Supports: OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Ollama, and OpenRouter.
 *
 * Features:
 * - Unified streaming interface for all providers
 * - Model capability detection (vision, tools, reasoning, etc.)
 * - Cost tracking per model
 * - Automatic retry with exponential backoff
 * - Provider-specific error handling
 */
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ProviderRegistry');

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'deepseek'
  | 'ollama'
  | 'openrouter';

export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  streaming: boolean;
  reasoning: boolean;
  json_mode: boolean;
  max_tokens: number;
  context_window: number;
}

export interface ModelCost {
  input_per_1m: number;  // Cost per 1M input tokens in USD
  output_per_1m: number; // Cost per 1M output tokens in USD
  cached_per_1m?: number; // Cost per 1M cached tokens (if supported)
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  capabilities: ModelCapabilities;
  cost: ModelCost;
  description?: string;
  deprecated?: boolean;
}

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnvVar: string;
  supportsStreaming: boolean;
  requiresApiKey: boolean;
}

export interface StreamOptions {
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  /** Optional env object for OpenRouter API key rotation */
  env?: Record<string, string | undefined>;
  /** Provider-specific thinking/reasoning options (passed through to API request) */
  thinking?: Record<string, any>;
  /** Provider-specific reasoning options (e.g., OpenAI o1/o3 effort level) */
  reasoning?: Record<string, any>;
  /** Provider-native tools (e.g., web search) injected by buildToolSet */
  tools?: ProviderNativeTool[];
}

/**
 * Provider-native tool definition.
 * Each provider expects a different shape; the `raw` field carries the
 * provider-specific JSON that gets merged into the API request body.
 */
export interface ProviderNativeTool {
  /** Which provider this tool definition targets */
  target: 'anthropic' | 'openai' | 'google';
  /** Provider-specific tool object (merged into the request body's tools array) */
  raw: Record<string, unknown>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface StreamResult {
  stream: ReadableStream<Uint8Array>;
  usage?: UsageMetrics;
}

// ============================================================================
// Provider Configurations
// ============================================================================

export const PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    supportsStreaming: true,
    requiresApiKey: true,
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5-20250929',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    supportsStreaming: true,
    requiresApiKey: true,
  },
  google: {
    type: 'google',
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    supportsStreaming: true,
    requiresApiKey: true,
  },
  groq: {
    type: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    apiKeyEnvVar: 'GROQ_API_KEY',
    supportsStreaming: true,
    requiresApiKey: true,
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    requiresApiKey: true,
  },
  ollama: {
    type: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    apiKeyEnvVar: 'OLLAMA_API_KEY', // Optional for Ollama
    supportsStreaming: true,
    requiresApiKey: false,
  },
  openrouter: {
    type: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    supportsStreaming: true,
    requiresApiKey: true,
  },
};

// ============================================================================
// Model Catalog with Capabilities and Costs
// ============================================================================

export const MODEL_CATALOG: Record<string, ModelInfo> = {
  // OpenAI Models
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 16384,
      context_window: 128000,
    },
    cost: { input_per_1m: 2.50, output_per_1m: 10.00 },
    description: 'Most advanced GPT-4 model with vision capabilities',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 16384,
      context_window: 128000,
    },
    cost: { input_per_1m: 0.15, output_per_1m: 0.60 },
    description: 'Fast and affordable GPT-4 model',
  },
  'gpt-4.1': {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 32768,
      context_window: 1000000,
    },
    cost: { input_per_1m: 2.00, output_per_1m: 8.00 },
    description: 'Latest GPT-4.1 with 1M context window',
  },
  'o1': {
    id: 'o1',
    name: 'o1',
    provider: 'openai',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 100000,
      context_window: 200000,
    },
    cost: { input_per_1m: 15.00, output_per_1m: 60.00 },
    description: 'Advanced reasoning model',
  },
  'o3-mini': {
    id: 'o3-mini',
    name: 'o3 Mini',
    provider: 'openai',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 65536,
      context_window: 200000,
    },
    cost: { input_per_1m: 1.10, output_per_1m: 4.40 },
    description: 'Fast reasoning model',
  },

  // Anthropic Models
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 16384,
      context_window: 200000,
    },
    cost: { input_per_1m: 3.00, output_per_1m: 15.00, cached_per_1m: 0.30 },
    description: 'Best balance of intelligence, speed, and cost',
  },
  'claude-opus-4-5-20251101': {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 32768,
      context_window: 200000,
    },
    cost: { input_per_1m: 15.00, output_per_1m: 75.00, cached_per_1m: 1.50 },
    description: 'Most capable Claude model for complex tasks',
  },
  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 200000,
    },
    cost: { input_per_1m: 0.80, output_per_1m: 4.00, cached_per_1m: 0.08 },
    description: 'Fast and affordable Claude model',
  },

  // Google Gemini Models
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 8192,
      context_window: 1000000,
    },
    cost: { input_per_1m: 0.075, output_per_1m: 0.30 },
    description: 'Fast multimodal model with 1M context',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 8192,
      context_window: 2000000,
    },
    cost: { input_per_1m: 1.25, output_per_1m: 10.00 },
    description: 'Most capable Gemini with 2M context',
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 1000000,
    },
    cost: { input_per_1m: 0.10, output_per_1m: 0.40 },
    description: 'Fast and capable multimodal model',
  },

  // Groq Models
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'groq',
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 32768,
      context_window: 128000,
    },
    cost: { input_per_1m: 0.59, output_per_1m: 0.79 },
    description: 'Fast inference with Groq hardware',
  },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'groq',
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 128000,
    },
    cost: { input_per_1m: 0.05, output_per_1m: 0.08 },
    description: 'Ultra-fast small model',
  },

  // DeepSeek Models
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 64000,
    },
    cost: { input_per_1m: 0.14, output_per_1m: 0.28, cached_per_1m: 0.014 },
    description: 'Powerful and affordable chat model',
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner (R1)',
    provider: 'deepseek',
    capabilities: {
      vision: false,
      tools: true,
      streaming: true,
      reasoning: true,
      json_mode: true,
      max_tokens: 8192,
      context_window: 64000,
    },
    cost: { input_per_1m: 0.55, output_per_1m: 2.19, cached_per_1m: 0.14 },
    description: 'Advanced reasoning with chain-of-thought',
  },

  // Ollama Models (local, no cost)
  'llama3.2': {
    id: 'llama3.2',
    name: 'Llama 3.2',
    provider: 'ollama',
    capabilities: {
      vision: false,
      tools: false,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 128000,
    },
    cost: { input_per_1m: 0, output_per_1m: 0 },
    description: 'Local Llama 3.2 model',
  },
  'codellama': {
    id: 'codellama',
    name: 'Code Llama',
    provider: 'ollama',
    capabilities: {
      vision: false,
      tools: false,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 16000,
    },
    cost: { input_per_1m: 0, output_per_1m: 0 },
    description: 'Specialized for code generation',
  },
  'deepseek-coder-v2': {
    id: 'deepseek-coder-v2',
    name: 'DeepSeek Coder V2',
    provider: 'ollama',
    capabilities: {
      vision: false,
      tools: false,
      streaming: true,
      reasoning: false,
      json_mode: true,
      max_tokens: 8192,
      context_window: 128000,
    },
    cost: { input_per_1m: 0, output_per_1m: 0 },
    description: 'Advanced code model for local use',
  },
};

// ============================================================================
// Error Classes
// ============================================================================

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: ProviderType,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ============================================================================
// Fallback & Retry Configuration
// ============================================================================

/**
 * Defines fallback provider chains: if the primary provider fails after all
 * retries, we attempt the request through the fallback provider instead.
 */
const FALLBACK_PROVIDERS: Partial<Record<ProviderType, ProviderType>> = {
  openrouter: 'anthropic',  // If OpenRouter fails, try direct Anthropic
  anthropic: 'openrouter',  // If direct Anthropic fails, try via OpenRouter
  openai: 'openrouter',     // If direct OpenAI fails, try via OpenRouter
  groq: 'openrouter',
  deepseek: 'openrouter',
};

/**
 * Maps direct-provider model IDs to their OpenRouter equivalents so that
 * fallback requests route to the right model on the fallback provider.
 */
const MODEL_FALLBACK_MAP: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'anthropic/claude-sonnet-4',
  'claude-opus-4-5-20251101': 'anthropic/claude-opus-4.5',
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
};

/** Maximum number of retry attempts (total attempts = MAX_RETRIES + 1). */
const MAX_RETRIES = 2;

/** Base delays (in ms) for each retry attempt. Index 0 = first retry. */
const RETRY_DELAYS_MS = [1000, 2000];

// ============================================================================
// Retry Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns the delay for a given retry attempt with exponential base + jitter.
 * @param attempt - zero-based retry index (0 = first retry, 1 = second retry)
 */
function getRetryDelay(attempt: number): number {
  const base = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
  // Add random jitter up to 30% of the base delay to prevent thundering herd
  const jitter = Math.random() * 0.3 * base;
  return base + jitter;
}

/**
 * Determines whether an error should trigger a retry.
 *
 * Retryable: 429 (rate limit), 500+ (server errors), network/timeout errors.
 * Non-retryable: 401, 402, 403, 404.
 */
function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return error.retryable;
  }

  // Network / fetch errors (e.g. DNS failure, connection refused)
  if (error instanceof TypeError && (error as TypeError).message.includes('fetch')) {
    return true;
  }

  // AbortError / timeout
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return false;
}

// ============================================================================
// Provider Registry Class
// ============================================================================

class ProviderRegistry {
  private static instance: ProviderRegistry;
  private usageCache: Map<string, UsageMetrics> = new Map();

  private constructor() {}

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Get provider configuration by type
   */
  getProviderConfig(provider: ProviderType): ProviderConfig {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      throw new ProviderError(
        `Unknown provider: ${provider}`,
        'UNKNOWN_PROVIDER',
        provider
      );
    }
    return config;
  }

  /**
   * Get model info by ID (searches all providers)
   */
  getModelInfo(modelId: string): ModelInfo | undefined {
    return MODEL_CATALOG[modelId];
  }

  /**
   * Get all models for a specific provider
   */
  getModelsByProvider(provider: ProviderType): ModelInfo[] {
    return Object.values(MODEL_CATALOG).filter(m => m.provider === provider);
  }

  /**
   * Check if a model supports a specific capability
   */
  hasCapability(modelId: string, capability: keyof ModelCapabilities): boolean {
    const model = this.getModelInfo(modelId);
    if (!model) return false;
    return Boolean(model.capabilities[capability]);
  }

  /**
   * Estimate cost for a given usage
   */
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = this.getModelInfo(modelId);
    if (!model) return 0;

    const inputCost = (inputTokens / 1_000_000) * model.cost.input_per_1m;
    const outputCost = (outputTokens / 1_000_000) * model.cost.output_per_1m;
    return inputCost + outputCost;
  }

  /**
   * Detect provider from model ID (for OpenRouter-style prefixed models)
   */
  detectProviderFromModelId(modelId: string): ProviderType {
    const prefixMap: Record<string, ProviderType> = {
      'anthropic/': 'anthropic',
      'openai/': 'openai',
      'google/': 'google',
      'meta-llama/': 'groq', // Llama via Groq
      'deepseek/': 'deepseek',
      'x-ai/': 'openrouter', // Grok via OpenRouter
      'mistralai/': 'openrouter',
      'qwen/': 'openrouter',
    };

    for (const [prefix, provider] of Object.entries(prefixMap)) {
      if (modelId.startsWith(prefix)) {
        return provider;
      }
    }

    // Check if it's a known model ID in the catalog
    const catalogModel = MODEL_CATALOG[modelId];
    if (catalogModel) {
      return catalogModel.provider;
    }

    // Default to OpenRouter for unknown models
    return 'openrouter';
  }

  /**
   * Create streaming response for any provider, with automatic retry
   * (exponential backoff) and provider fallback on exhaustion.
   *
   * Flow:
   *   try provider (attempt 1)
   *   -> if retryable error, wait + retry (attempt 2)
   *   -> if still failing, wait + retry (attempt 3)
   *   -> if all retries exhausted AND fallback provider exists:
   *       -> remap model to fallback equivalent
   *       -> try fallback provider (single attempt)
   *   -> if everything fails, throw last error
   *
   * @param fallbackApiKey Optional API key for the fallback provider.
   *                       Falls back to the original apiKey when not provided.
   */
  async createStream(
    provider: ProviderType,
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    fallbackApiKey?: string
  ): Promise<ReadableStream<Uint8Array>> {
    let lastError: unknown;

    // --- Primary provider: up to MAX_RETRIES + 1 total attempts ---
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._executeProviderStream(
          provider, systemPrompt, messages, apiKey, options
        );
      } catch (error) {
        lastError = error;

        const retryable = isRetryableProviderError(error);
        const retriesLeft = MAX_RETRIES - attempt;

        if (!retryable || retriesLeft <= 0) {
          // Non-retryable or out of retries — break to fallback logic
          break;
        }

        const delay = getRetryDelay(attempt);
        logger.info(
          `[ProviderRegistry] ${provider} attempt ${attempt + 1} failed (retryable). ` +
          `Retrying in ${Math.round(delay)}ms... (${retriesLeft} retries left). ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
        await sleep(delay);
      }
    }

    // --- Fallback provider: single attempt ---
    const fallbackProvider = FALLBACK_PROVIDERS[provider];
    if (fallbackProvider) {
      // Remap model for the fallback provider
      const originalModel = options.model;
      const remappedModel = MODEL_FALLBACK_MAP[originalModel] ?? originalModel;
      const fallbackOptions: StreamOptions = { ...options, model: remappedModel };
      const keyForFallback = fallbackApiKey ?? apiKey;

      logger.info(
        `[ProviderRegistry] All retries exhausted for ${provider}. ` +
        `Falling back to ${fallbackProvider} with model ${remappedModel} ` +
        `(original: ${originalModel}). ` +
        `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      );

      try {
        return await this._executeProviderStream(
          fallbackProvider, systemPrompt, messages, keyForFallback, fallbackOptions
        );
      } catch (fallbackError) {
        logger.info(
          `[ProviderRegistry] Fallback provider ${fallbackProvider} also failed: ` +
          `${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
        );
        // Fall through to throw the original error — it's usually more informative
      }
    }

    // --- Everything failed — throw the last primary error ---
    throw lastError;
  }

  /**
   * Dispatches a single streaming request to the appropriate provider handler.
   * This is the low-level method with NO retry logic.
   */
  private async _executeProviderStream(
    provider: ProviderType,
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const config = this.getProviderConfig(provider);

    switch (provider) {
      case 'openai':
        return this.streamOpenAI(systemPrompt, messages, apiKey, options, config);
      case 'anthropic':
        return this.streamAnthropic(systemPrompt, messages, apiKey, options, config);
      case 'google':
        return this.streamGoogle(systemPrompt, messages, apiKey, options, config);
      case 'groq':
        return this.streamGroq(systemPrompt, messages, apiKey, options, config);
      case 'deepseek':
        return this.streamDeepSeek(systemPrompt, messages, apiKey, options, config);
      case 'ollama':
        return this.streamOllama(systemPrompt, messages, apiKey, options, config);
      case 'openrouter':
        return this.streamOpenRouter(systemPrompt, messages, apiKey, options, config);
      default:
        throw new ProviderError(
          `Unsupported provider: ${provider}`,
          'UNSUPPORTED_PROVIDER',
          provider
        );
    }
  }

  // ============================================================================
  // Provider-Specific Streaming Implementations
  // ============================================================================

  private async streamOpenAI(
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    // Collect any OpenAI-targeted native tools (e.g., web_search_preview)
    const nativeTools = (options.tools || [])
      .filter(t => t.target === 'openai')
      .map(t => t.raw);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || config.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 16000,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        presence_penalty: options.presence_penalty,
        stop: options.stop,
        // Reasoning options for o1/o3 models (best-effort)
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        // Provider-native tools (web search, etc.)
        ...(nativeTools.length > 0 ? { tools: nativeTools } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `OpenAI API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'openai',
        response.status,
        response.status >= 500
      );
    }

    return this.transformSSEStream(response.body!, 'openai');
  }

  private async streamAnthropic(
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    // Anthropic requires alternating user/assistant messages
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

    // Collect any Anthropic-targeted native tools (e.g., web_search_20250305)
    const nativeTools = (options.tools || [])
      .filter(t => t.target === 'anthropic')
      .map(t => t.raw);

    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || config.defaultModel,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 16000,
        // Thinking options for extended thinking models (best-effort)
        ...(options.thinking ? { thinking: options.thinking } : {}),
        // Provider-native tools (web search, etc.)
        ...(nativeTools.length > 0 ? { tools: nativeTools } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `Anthropic API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'anthropic',
        response.status,
        response.status >= 500
      );
    }

    return this.transformSSEStream(response.body!, 'anthropic');
  }

  private async streamGoogle(
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    const model = options.model || config.defaultModel;

    // Convert messages to Gemini format
    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Collect any Google-targeted native tools (e.g., google_search_retrieval)
    const nativeTools = (options.tools || [])
      .filter(t => t.target === 'google')
      .map(t => t.raw);

    const response = await fetch(
      `${config.baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.max_tokens ?? 16000,
            topP: options.top_p ?? 0.95,
            // Thinking config for Gemini thinking models (best-effort)
            ...(options.thinking?.budget_tokens
              ? { thinkingConfig: { thinkingBudget: options.thinking.budget_tokens } }
              : {}),
          },
          // Provider-native tools (google_search_retrieval, etc.)
          ...(nativeTools.length > 0 ? { tools: nativeTools } : {}),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `Google AI API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'google',
        response.status,
        response.status >= 500
      );
    }

    return this.transformGeminiStream(response.body!);
  }

  private async streamGroq(
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    // Groq uses OpenAI-compatible API
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || config.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: options.temperature ?? 0.5, // Groq default
        max_tokens: options.max_tokens ?? 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `Groq API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'groq',
        response.status,
        response.status >= 500
      );
    }

    return this.transformSSEStream(response.body!, 'openai');
  }

  private async streamDeepSeek(
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    const model = options.model || config.defaultModel;
    const isReasoningModel = model.includes('reasoner') || model.includes('r1');

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 16000,
        // Enable thinking mode for reasoning models - use configured budget if provided, else default
        ...(options.thinking
          ? { thinking: options.thinking }
          : isReasoningModel
            ? { thinking: { type: 'enabled' } }
            : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `DeepSeek API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'deepseek',
        response.status,
        response.status >= 500
      );
    }

    return this.transformSSEStream(response.body!, 'deepseek');
  }

  private async streamOllama(
    systemPrompt: string,
    messages: Message[],
    _apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    const baseUrl = process.env.OLLAMA_BASE_URL || config.baseUrl;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || config.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ],
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.max_tokens ?? 16000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        `Ollama API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'ollama',
        response.status,
        true // Ollama errors are usually retryable
      );
    }

    return this.transformOllamaStream(response.body!);
  }

  private async streamOpenRouter(
    systemPrompt: string,
    messages: Message[],
    apiKey: string,
    options: StreamOptions,
    config: ProviderConfig
  ): Promise<ReadableStream<Uint8Array>> {
    // Use key rotation: initialize the pool and pick the best available key
    const {
      initializeOpenRouterKeys,
      getNextOpenRouterKey,
      markOpenRouterKeyFailed,
      markOpenRouterKeySuccess,
      classifyOpenRouterKeyError,
    } = await import('./openrouter-stream');

    initializeOpenRouterKeys(apiKey, options.env);
    const currentKey = getNextOpenRouterKey() || apiKey;

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz',
      },
      body: JSON.stringify({
        model: options.model || config.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 16000,
        top_p: options.top_p ?? 0.95,
        // Thinking/reasoning options (provider-specific, best-effort)
        ...(options.thinking ? { thinking: options.thinking } : {}),
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new ProviderError(
        `OpenRouter API error: ${response.status} - ${errorText}`,
        this.getErrorCode(response.status),
        'openrouter',
        response.status,
        response.status >= 500 || response.status === 429
      );

      // Mark this key as failed so the retry loop picks a different key next time
      const keyErrorType = classifyOpenRouterKeyError(error);
      if (keyErrorType) {
        markOpenRouterKeyFailed(currentKey, keyErrorType);
      }

      throw error;
    }

    // Key succeeded — clear cooldown
    markOpenRouterKeySuccess(currentKey);

    return this.transformSSEStream(response.body!, 'openai');
  }

  // ============================================================================
  // Stream Transformation Helpers
  // ============================================================================

  private transformSSEStream(
    body: ReadableStream<Uint8Array>,
    format: 'openai' | 'anthropic' | 'deepseek'
  ): ReadableStream<Uint8Array> {
    const textDecoder = new TextDecoder();
    const textEncoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        const reader = body.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const data = JSON.parse(trimmed.substring(6));
                let content = '';

                if (format === 'anthropic') {
                  if (data.type === 'content_block_delta') {
                    content = data.delta?.text || '';
                  }
                } else {
                  // OpenAI and OpenAI-compatible formats (including DeepSeek)
                  content = data.choices?.[0]?.delta?.content || '';
                }

                if (content) {
                  controller.enqueue(textEncoder.encode(content));
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });
  }

  private transformGeminiStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const textDecoder = new TextDecoder();
    const textEncoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        const reader = body.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += textDecoder.decode(value, { stream: true });

            // Gemini returns JSON array chunks
            try {
              // Try to parse the buffer as JSON array
              const lines = buffer.split('\n').filter(l => l.trim());
              for (const line of lines) {
                try {
                  const data = JSON.parse(line.trim().replace(/^,/, '').replace(/^\[/, '').replace(/\]$/, ''));
                  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    controller.enqueue(textEncoder.encode(text));
                  }
                } catch {
                  // Partial JSON, keep in buffer
                }
              }
              buffer = '';
            } catch {
              // Keep accumulating
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });
  }

  private transformOllamaStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const textDecoder = new TextDecoder();
    const textEncoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        const reader = body.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const data = JSON.parse(line);
                const content = data.message?.content;
                if (content) {
                  controller.enqueue(textEncoder.encode(content));
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });
  }

  private getErrorCode(statusCode: number): string {
    switch (statusCode) {
      case 401: return 'INVALID_API_KEY';
      case 402: return 'INSUFFICIENT_CREDITS';
      case 403: return 'FORBIDDEN';
      case 404: return 'MODEL_NOT_FOUND';
      case 429: return 'RATE_LIMITED';
      case 500:
      case 502:
      case 503:
        return 'SERVER_ERROR';
      default:
        return 'API_ERROR';
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

// Singleton instance
export const providerRegistry = ProviderRegistry.getInstance();

/**
 * Get model capabilities for a given model ID
 */
export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  const model = providerRegistry.getModelInfo(modelId);
  return model?.capabilities ?? null;
}

/**
 * Get cost estimate for a model and token count
 */
export function getModelCost(modelId: string, inputTokens: number, outputTokens: number): number {
  return providerRegistry.estimateCost(modelId, inputTokens, outputTokens);
}

/**
 * Check if a model supports a capability
 */
export function modelSupports(modelId: string, capability: keyof ModelCapabilities): boolean {
  return providerRegistry.hasCapability(modelId, capability);
}

/**
 * Create a streaming response using the unified provider interface
 */
export async function createProviderStream(
  provider: ProviderType,
  systemPrompt: string,
  messages: Message[],
  apiKey: string,
  options: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  return providerRegistry.createStream(provider, systemPrompt, messages, apiKey, options);
}

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: ProviderType): ProviderConfig {
  return providerRegistry.getProviderConfig(provider);
}

/**
 * Detect provider from model ID
 */
export function detectProvider(modelId: string): ProviderType {
  return providerRegistry.detectProviderFromModelId(modelId);
}

/**
 * Get all models for a provider
 */
export function getProviderModels(provider: ProviderType): ModelInfo[] {
  return providerRegistry.getModelsByProvider(provider);
}
