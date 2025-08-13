/**
 * AI API Handler interfaces and types
 * Shared across all Recoder apps
 */

import { Anthropic } from "@anthropic-ai/sdk";

// Re-export reasoning utilities
export {
  DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
  DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
  shouldUseReasoningBudget,
  shouldUseReasoningEffort,
  getModelMaxOutputTokens
} from './reasoning';

export interface ModelInfo {
  maxTokens?: number;
  contextWindow: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsPromptCache: boolean;
  supportsComputerUse?: boolean;
  supportsReasoningBudget?: boolean;
  maxThinkingTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  description?: string;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  inputPrice?: number;
  outputPrice?: number;
  cacheWritesPrice?: number;
  cacheReadsPrice?: number;
  supportedParameters?: string[];
  preferredIndex?: number;
  requiredReasoningBudget?: boolean;
  cost?: string | number; // ADD COST PROPERTY
  pricing?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  tiers?: Array<{
    contextWindow: number;
    inputPrice?: number;
    outputPrice?: number;
    cacheWritesPrice?: number;
    cacheReadsPrice?: number;
    name?: string;
    maxTokens?: number;
  }>;
}

export interface ApiHandlerOptions {
  // Core API settings
  apiKey?: string;
  apiModelId?: string;
  modelTemperature?: number;
  
  // Provider-specific API keys
  anthropicApiKey?: string;
  openaiApiKey?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  huggingFaceApiKey?: string;
  togetherApiKey?: string;
  openRouterApiKey?: string;
  ollamaBaseUrl?: string;
  
  // Model settings
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  
  // Provider-specific settings
  openRouterBaseUrl?: string;
  openRouterModelId?: string;
  openRouterSpecificProvider?: string;
  openRouterUseMiddleOutTransform?: boolean;
  
  // Other settings
  [key: string]: any;
}

export interface AITokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalCost?: number;
}

export interface StreamChunk {
  type: 'text' | 'usage' | 'reasoning' | 'error';
  text?: string;
  usage?: AITokenUsage;
  error?: string;
}

export interface AIGenerationResult {
  text: string;
  usage?: AITokenUsage;
  model?: string;
  provider?: string;
  finishReason?: string;
}

export interface ApiHandler {
  name: string;
  createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata?: any
  ): AsyncGenerator<StreamChunk>;
  
  completePrompt?(prompt: string): Promise<string>;
  
  getModel(): {
    id: string;
    info: ModelInfo;
  };
}

export interface SingleCompletionHandler {
  completePrompt(prompt: string): Promise<string>;
}

export interface ModelRecord {
  [modelId: string]: ModelInfo;
}

export interface ReasoningParams {
  include?: boolean;
  exclude?: boolean;
  budget?: number;
}

export interface ApiProviderConfig {
  name: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  models: ModelRecord;
  defaultModel: string;
  supportsStreaming?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
}

// Cerebras model definitions are in cerebras.ts

// Error types
export class AIApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public provider?: string
  ) {
    super(message);
    this.name = 'AIApiError';
  }
}

export class AIRateLimitError extends AIApiError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'AIRateLimitError';
  }
}

export class AIAuthenticationError extends AIApiError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION', 401);
    this.name = 'AIAuthenticationError';
  }
}

// Utility types for better TypeScript support
export type ApiProvider = 
  | 'anthropic'
  | 'openai' 
  | 'groq'
  | 'gemini'
  | 'huggingface'
  | 'together'
  | 'openrouter'
  | 'ollama'
  | 'mistral'
  | 'deepseek'
  | 'xai';

export interface ProviderCapabilities {
  streaming: boolean;
  images: boolean;
  tools: boolean;
  reasoning: boolean;
  caching: boolean;
}

export interface ProviderStatus {
  available: boolean;
  configured: boolean;
  models: string[];
  lastChecked?: Date;
  error?: string;
}

// Additional types for model fetching and routing
export interface GetModelsOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  provider?: RouterName;
  kilocodeToken?: string;
}

export type RouterName = 
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'gemini'
  | 'huggingface'
  | 'together'
  | 'openrouter'
  | 'ollama'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'cerebras'
  | 'litellm'
  | 'lmstudio'
  | 'bedrock'
  | 'vertex'
  | 'claude-code'
  | 'fireworks'
  | 'chutes'
  | 'requesty'
  | 'glama'
  | 'unbound'
  | 'human-relay'
  | 'fake-ai'
  | 'vscode-lm'
  | 'kilocode-openrouter';