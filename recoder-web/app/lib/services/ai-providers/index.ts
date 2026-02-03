/**
 * AI Providers System
 * Copied from Kilocode - Provides a unified abstraction for multiple AI providers
 * with consistent interfaces for message creation, token counting, and streaming
 */

import { z } from 'zod';
import { atom, map, computed } from 'nanostores';

// =============================================================================
// Provider Types
// =============================================================================

export const AIProviderTypeSchema = z.enum([
  'anthropic',
  'openai',
  'openrouter',
  'google',
  'azure',
  'bedrock',
  'deepseek',
  'mistral',
  'groq',
  'together',
  'fireworks',
  'ollama',
  'lmstudio',
  'custom',
]);

export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;

// =============================================================================
// Model Schemas
// =============================================================================

export const ModelCapabilitiesSchema = z.object({
  supportsImages: z.boolean().default(false),
  supportsTools: z.boolean().default(true),
  supportsStreaming: z.boolean().default(true),
  supportsSystemMessages: z.boolean().default(true),
  supportsFIM: z.boolean().default(false), // Fill-in-the-Middle
  maxOutputTokens: z.number().optional(),
  contextWindow: z.number(),
});

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: AIProviderTypeSchema,
  description: z.string().optional(),
  capabilities: ModelCapabilitiesSchema,
  pricing: z.object({
    inputCostPer1k: z.number(),
    outputCostPer1k: z.number(),
    currency: z.string().default('USD'),
  }).optional(),
  isDefault: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
});

export const ProviderConfigSchema = z.object({
  type: AIProviderTypeSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  defaultModel: z.string().optional(),
  enabled: z.boolean().default(true),
  customHeaders: z.record(z.string()).optional(),
  timeout: z.number().default(120000), // 2 minutes
  maxRetries: z.number().default(3),
});

// =============================================================================
// Message Types
// =============================================================================

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const ContentPartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.enum(['base64', 'url']),
      mediaType: z.string(),
      data: z.string(),
    }),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    toolUseId: z.string(),
    content: z.string(),
    isError: z.boolean().optional(),
  }),
]);

export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(ContentPartSchema)]),
});

export const CreateMessageParamsSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    input_schema: z.unknown(),
  })).optional(),
  stopSequences: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
});

export const CreateMessageMetadataSchema = z.object({
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  modeSlug: z.string().optional(),
  requestId: z.string().optional(),
});

// =============================================================================
// Response Types
// =============================================================================

export const StreamEventTypeSchema = z.enum([
  'message_start',
  'content_block_start',
  'content_block_delta',
  'content_block_stop',
  'message_delta',
  'message_stop',
  'error',
]);

export const StreamEventSchema = z.object({
  type: StreamEventTypeSchema,
  index: z.number().optional(),
  delta: z.object({
    type: z.string().optional(),
    text: z.string().optional(),
    partial_json: z.string().optional(),
  }).optional(),
  content_block: ContentPartSchema.optional(),
  message: z.object({
    id: z.string(),
    model: z.string(),
    stopReason: z.string().optional(),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
    }).optional(),
  }).optional(),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }).optional(),
});

export const MessageResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  content: z.array(ContentPartSchema),
  stopReason: z.string().optional(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
});

// =============================================================================
// Types
// =============================================================================

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type ContentPart = z.infer<typeof ContentPartSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CreateMessageParams = z.infer<typeof CreateMessageParamsSchema>;
export type CreateMessageMetadata = z.infer<typeof CreateMessageMetadataSchema>;
export type StreamEventType = z.infer<typeof StreamEventTypeSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

// =============================================================================
// State
// =============================================================================

export const providersStore = map<Record<AIProviderType, ProviderConfig | null>>({
  anthropic: null,
  openai: null,
  openrouter: null,
  google: null,
  azure: null,
  bedrock: null,
  deepseek: null,
  mistral: null,
  groq: null,
  together: null,
  fireworks: null,
  ollama: null,
  lmstudio: null,
  custom: null,
});

export const modelsStore = map<Record<string, ModelInfo>>({});
export const activeProviderId = atom<AIProviderType | null>(null);
export const activeModelId = atom<string | null>(null);
export const isStreaming = atom<boolean>(false);
export const lastError = atom<string | null>(null);

// =============================================================================
// Computed State
// =============================================================================

export const activeProvider = computed(
  [providersStore, activeProviderId],
  (providers, id) => (id ? providers[id] : null)
);

export const activeModel = computed(
  [modelsStore, activeModelId],
  (models, id) => (id ? models[id] : null)
);

export const enabledProviders = computed(providersStore, (providers) =>
  Object.entries(providers)
    .filter(([_, config]) => config?.enabled)
    .map(([type]) => type as AIProviderType)
);

export const availableModels = computed(modelsStore, (models) =>
  Object.values(models).filter(m => m?.isAvailable)
);

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Configure a provider
 */
export function configureProvider(
  type: AIProviderType,
  config: Partial<ProviderConfig>
): void {
  const existing = providersStore.get()[type];
  providersStore.setKey(type, {
    type,
    enabled: true,
    timeout: 120000,
    maxRetries: 3,
    ...existing,
    ...config,
  });
}

/**
 * Remove a provider configuration
 */
export function removeProvider(type: AIProviderType): void {
  providersStore.setKey(type, null);
  if (activeProviderId.get() === type) {
    activeProviderId.set(null);
  }
}

/**
 * Set the active provider
 */
export function setActiveProvider(type: AIProviderType): void {
  const config = providersStore.get()[type];
  if (!config || !config.enabled) {
    throw new Error(`Provider ${type} is not configured or enabled`);
  }
  activeProviderId.set(type);
}

/**
 * Get provider config
 */
export function getProviderConfig(type: AIProviderType): ProviderConfig | null {
  return providersStore.get()[type];
}

// =============================================================================
// Model Management
// =============================================================================

/**
 * Register a model
 */
export function registerModel(model: ModelInfo): void {
  modelsStore.setKey(model.id, model);
}

/**
 * Remove a model
 */
export function removeModel(id: string): void {
  const models = { ...modelsStore.get() };
  delete models[id];
  modelsStore.set(models);

  if (activeModelId.get() === id) {
    activeModelId.set(null);
  }
}

/**
 * Set the active model
 */
export function setActiveModel(id: string): void {
  const model = modelsStore.get()[id];
  if (!model || !model.isAvailable) {
    throw new Error(`Model ${id} is not available`);
  }
  activeModelId.set(id);
}

/**
 * Get models for a provider
 */
export function getProviderModels(provider: AIProviderType): ModelInfo[] {
  return Object.values(modelsStore.get()).filter(m => m?.provider === provider);
}

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate token count for text
 * Uses ~4 characters per token as a rough estimate
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // More accurate estimation
  const words = text.split(/\s+/).length;
  const chars = text.length;

  // Blend word and character estimates
  return Math.ceil((words * 1.3 + chars / 4) / 2);
}

/**
 * Estimate tokens for a message
 */
export function estimateMessageTokens(message: ChatMessage): number {
  const roleOverhead = 4; // Approximate tokens for role

  if (typeof message.content === 'string') {
    return roleOverhead + estimateTokens(message.content);
  }

  // Content parts
  let tokens = roleOverhead;
  for (const part of message.content) {
    if (part.type === 'text') {
      tokens += estimateTokens(part.text);
    } else if (part.type === 'image') {
      // Images are typically ~1000 tokens
      tokens += 1000;
    } else if (part.type === 'tool_use') {
      tokens += estimateTokens(JSON.stringify(part.input));
    } else if (part.type === 'tool_result') {
      tokens += estimateTokens(part.content);
    }
  }

  return tokens;
}

/**
 * Estimate total tokens for messages
 */
export function estimateTotalTokens(
  messages: ChatMessage[],
  systemPrompt?: string
): number {
  let total = 0;

  if (systemPrompt) {
    total += estimateTokens(systemPrompt) + 4;
  }

  for (const message of messages) {
    total += estimateMessageTokens(message);
  }

  return total;
}

// =============================================================================
// Cost Estimation
// =============================================================================

/**
 * Estimate cost for a request
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): { input: number; output: number; total: number } | null {
  const model = modelsStore.get()[modelId];
  if (!model?.pricing) return null;

  const inputCost = (inputTokens / 1000) * model.pricing.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * model.pricing.outputCostPer1k;

  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number, currency: string = 'USD'): string {
  if (cost < 0.01) {
    return `<$0.01`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

// =============================================================================
// Default Models
// =============================================================================

export const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Most intelligent model, best for complex tasks',
    capabilities: {
      supportsImages: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
      supportsFIM: false,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    pricing: {
      inputCostPer1k: 0.003,
      outputCostPer1k: 0.015,
      currency: 'USD',
    },
    isDefault: true,
    isAvailable: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    description: 'Fast and efficient for simpler tasks',
    capabilities: {
      supportsImages: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
      supportsFIM: false,
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    pricing: {
      inputCostPer1k: 0.0008,
      outputCostPer1k: 0.004,
      currency: 'USD',
    },
    isDefault: false,
    isAvailable: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI flagship model',
    capabilities: {
      supportsImages: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
      supportsFIM: false,
      contextWindow: 128000,
      maxOutputTokens: 16384,
    },
    pricing: {
      inputCostPer1k: 0.005,
      outputCostPer1k: 0.015,
      currency: 'USD',
    },
    isDefault: false,
    isAvailable: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Affordable small model',
    capabilities: {
      supportsImages: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
      supportsFIM: false,
      contextWindow: 128000,
      maxOutputTokens: 16384,
    },
    pricing: {
      inputCostPer1k: 0.00015,
      outputCostPer1k: 0.0006,
      currency: 'USD',
    },
    isDefault: false,
    isAvailable: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Google flagship with 1M context',
    capabilities: {
      supportsImages: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
      supportsFIM: false,
      contextWindow: 1000000,
      maxOutputTokens: 8192,
    },
    pricing: {
      inputCostPer1k: 0.00125,
      outputCostPer1k: 0.005,
      currency: 'USD',
    },
    isDefault: false,
    isAvailable: true,
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    description: 'Specialized for coding tasks',
    capabilities: {
      supportsImages: false,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
      supportsFIM: true,
      contextWindow: 128000,
      maxOutputTokens: 8192,
    },
    pricing: {
      inputCostPer1k: 0.00014,
      outputCostPer1k: 0.00028,
      currency: 'USD',
    },
    isDefault: false,
    isAvailable: true,
  },
];

/**
 * Initialize default models
 */
export function initializeDefaultModels(): void {
  for (const model of DEFAULT_MODELS) {
    registerModel(model);
  }
}

// =============================================================================
// Provider Base URLs
// =============================================================================

export const PROVIDER_BASE_URLS: Record<AIProviderType, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  azure: '', // Requires custom endpoint
  bedrock: '', // AWS SDK
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234/v1',
  custom: '',
};

/**
 * Get the base URL for a provider
 */
export function getProviderBaseUrl(type: AIProviderType): string {
  const config = providersStore.get()[type];
  return config?.baseUrl || PROVIDER_BASE_URLS[type];
}

// =============================================================================
// Usage Tracking
// =============================================================================

interface UsageRecord {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
}

const usageHistory = map<Record<string, UsageRecord[]>>({});

/**
 * Track usage for a model
 */
export function trackUsage(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): void {
  const cost = estimateCost(modelId, inputTokens, outputTokens);

  const record: UsageRecord = {
    modelId,
    inputTokens,
    outputTokens,
    cost: cost?.total ?? 0,
    timestamp: new Date().toISOString(),
  };

  const history = usageHistory.get()[modelId] || [];
  history.push(record);

  // Keep last 1000 records per model
  usageHistory.setKey(modelId, history.slice(-1000));
}

/**
 * Get usage summary for a model
 */
export function getUsageSummary(modelId: string): {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
} {
  const history = usageHistory.get()[modelId] || [];

  return {
    totalInputTokens: history.reduce((sum, r) => sum + r.inputTokens, 0),
    totalOutputTokens: history.reduce((sum, r) => sum + r.outputTokens, 0),
    totalCost: history.reduce((sum, r) => sum + r.cost, 0),
    requestCount: history.length,
  };
}

/**
 * Get total usage across all models
 */
export function getTotalUsage(): {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
} {
  const allHistory = Object.values(usageHistory.get()).flat();

  return {
    totalInputTokens: allHistory.reduce((sum, r) => sum + r.inputTokens, 0),
    totalOutputTokens: allHistory.reduce((sum, r) => sum + r.outputTokens, 0),
    totalCost: allHistory.reduce((sum, r) => sum + r.cost, 0),
    requestCount: allHistory.length,
  };
}
