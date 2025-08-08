/**
 * Browser-safe shared utilities for Web Platform
 * This is a client-safe version of @recoder/shared
 */

// Browser-safe logger that doesn't import winston
export class Logger {
  private prefix: string;

  constructor(prefix: string = 'recoder-web') {
    this.prefix = prefix;
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${this.prefix}:INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.prefix}:WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${this.prefix}:ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.debug(`[${this.prefix}:DEBUG] ${message}`, ...args);
  }

  static getInstance(): Logger {
    return new Logger();
  }
}

// Re-export only the types and utilities we need from @recoder/shared
// without importing the actual package (to avoid winston dependency)

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR', 
  API_ERROR = 'API_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export class RecoderError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(message: string, code: ErrorCode, statusCode: number = 500) {
    super(message);
    this.name = 'RecoderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ErrorHandler {
  static handle(error: unknown): RecoderError {
    if (error instanceof RecoderError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new RecoderError(error.message, ErrorCode.INTERNAL_ERROR);
    }
    
    return new RecoderError('Unknown error', ErrorCode.INTERNAL_ERROR);
  }
}

// Cost calculation utilities (browser-safe)
export function parseApiPrice(priceStr: string | null | undefined): number {
  if (!priceStr || typeof priceStr !== 'string') {
    return 0;
  }
  const price = parseFloat(priceStr.replace(/[^0-9.-]/g, ''));
  return isNaN(price) ? 0 : price;
}

// Safe JSON parsing
export function safeJsonParse<T>(jsonStr: string, fallback: T): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

// API Handler types
export interface ApiHandlerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  [key: string]: any;
}

// Model record type
export type ModelRecord = Record<string, any>;

// API Message interface for browser environments
export interface ApiMessage {
  role: string;
  content: any;
  [key: string]: any;
}

// Package type for provider integrations
export interface Package {
  name: string;
  version: string;
  [key: string]: any;
}

// Package constant for browser environment
export const Package: Package = {
  name: "recoder-web",
  version: "1.0.0"
};

// VS Code LM utilities
export const SELECTOR_SEPARATOR = '/';

export function stringifyVsCodeLmModelSelector(selector: { vendor: string; family: string }): string {
  return `${selector.vendor}${SELECTOR_SEPARATOR}${selector.family}`;
}

// Model types
export type FireworksModelId = string;
export const fireworksDefaultModelId: FireworksModelId = "accounts/fireworks/models/llama-v3p1-405b-instruct";
export const fireworksModels: Record<string, any> = {};

// Cerebras model types
export type CerebrasModelId = string;
export const cerebrasDefaultModelId: CerebrasModelId = "llama3.1-8b";
export const cerebrasModels: Record<string, any> = {
  "llama3.1-8b": { maxTokens: 8192, inputPrice: 0.1, outputPrice: 0.1 },
  "llama3.1-70b": { maxTokens: 8192, inputPrice: 0.6, outputPrice: 0.6 },
  "llama-3.3-70b": { maxTokens: 8192, inputPrice: 0.6, outputPrice: 0.6 }
};

// Router and model cache types
export type RouterName = 'openrouter' | 'requesty' | 'glama' | 'unbound' | 'litellm' | 'ollama' | 'lmstudio';

export interface GetModelsOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  [key: string]: any;
}

// Cost calculation functions
export function calculateApiCostOpenAI(totalTokens: number, modelName: string): number {
  // Simplified cost calculation - replace with actual logic
  const costPerToken = 0.000001; // $0.000001 per token
  return totalTokens * costPerToken;
}

export function calculateApiCostAnthropic(
  modelInfo: any,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  // Simplified Anthropic cost calculation based on model pricing
  // These are approximate rates - should be updated with actual pricing
  const inputCostPer1M = modelInfo?.inputPrice || 3.0; // $3 per million input tokens
  const outputCostPer1M = modelInfo?.outputPrice || 15.0; // $15 per million output tokens
  const cacheWriteCostPer1M = modelInfo?.cacheWritePrice || 3.75; // $3.75 per million cache write tokens
  const cacheReadCostPer1M = modelInfo?.cacheReadPrice || 0.3; // $0.30 per million cache read tokens
  
  const inputCost = (inputTokens * inputCostPer1M) / 1_000_000;
  const outputCost = (outputTokens * outputCostPer1M) / 1_000_000;
  const cacheWriteCost = (cacheWriteTokens * cacheWriteCostPer1M) / 1_000_000;
  const cacheReadCost = (cacheReadTokens * cacheReadCostPer1M) / 1_000_000;
  
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

// Reasoning model constants and functions
export const DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS = 4096;
export const DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS = 2048;

export function shouldUseReasoningBudget(input: string | { model: any; settings: any }): boolean {
  // Handle both string and object input for compatibility
  let modelId: string;
  
  if (typeof input === 'string') {
    modelId = input;
  } else {
    // Extract model ID from object
    modelId = input.model?.id || input.model?.modelId || '';
  }
  
  // Simplified logic - replace with actual reasoning logic
  return modelId.includes('reasoning') || modelId.includes('o1');
}

export function shouldUseReasoningEffort(input: string | { model: any; settings: any }): boolean {
  // Handle both string and object input for compatibility
  let modelId: string;
  
  if (typeof input === 'string') {
    modelId = input;
  } else {
    // Extract model ID from object
    modelId = input.model?.id || input.model?.modelId || '';
  }
  
  // Simplified logic - replace with actual reasoning logic
  return modelId.includes('reasoning') || modelId.includes('o1');
}

export function getModelMaxOutputTokens(input: string | { modelId: string; model: any; settings: any; format?: string }): number {
  // Handle both string and object input for compatibility
  let modelId: string;
  let model: any;
  
  if (typeof input === 'string') {
    modelId = input;
    model = null;
  } else {
    modelId = input.modelId;
    model = input.model;
  }
  
  // Use model info if available, otherwise fall back to modelId-based lookup
  if (model && model.maxTokens) {
    return model.maxTokens;
  }
  
  // Simplified logic - replace with actual model limits
  const modelLimits: Record<string, number> = {
    'gpt-4': 4096,
    'gpt-3.5-turbo': 4096,
    'claude-3': 4096,
    'claude-3-opus': 4096,
    'claude-3-sonnet': 4096,
    'claude-3-haiku': 4096,
    'meta-llama/meta-llama-3.3-70b-instruct-turbo': 8192,
    'meta-llama/llama-3.1-70b-instruct-turbo': 8192,
    'meta-llama/llama-3.1-8b-instruct-turbo': 8192,
  };
  
  return modelLimits[modelId] || 4096;
}

// Constants that are safe to use in browser
export const TEMPLATE_CATEGORIES = {
  WEB: 'web',
  MOBILE: 'mobile',
  AI: 'ai',
  BLOCKCHAIN: 'blockchain',
  FULLSTACK: 'fullstack'
} as const;

export const FRAMEWORK_TYPES = {
  REACT: 'react',
  NEXTJS: 'nextjs',
  VUE: 'vue',
  ANGULAR: 'angular',
  SVELTE: 'svelte'
} as const;

export const PROJECT_TYPES = {
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  FULLSTACK: 'fullstack',
  MOBILE: 'mobile',
  AI: 'ai'
} as const;

// Token counting utilities (browser-safe)
export async function countTokens(content: any[], options?: { useWorker?: boolean }): Promise<number> {
  // Simplified token counting for browser environments
  // In a real implementation, you might use a browser-compatible tokenizer
  if (!content || content.length === 0) {
    return 0;
  }
  
  let totalText = '';
  for (const item of content) {
    if (typeof item === 'string') {
      totalText += item;
    } else if (item && typeof item === 'object') {
      if (item.text) {
        totalText += item.text;
      } else if (item.content) {
        totalText += typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
      }
    }
  }
  
  // Rough approximation: ~4 characters per token (varies by language)
  return Math.ceil(totalText.length / 4);
}