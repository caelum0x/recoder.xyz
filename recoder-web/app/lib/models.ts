/**
 * AI Provider and Model Configuration
 *
 * Multi-provider support with comprehensive model catalog.
 * Providers: OpenRouter, Anthropic, OpenAI, Google, Groq, DeepSeek, Ollama
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Models');

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  costPer1MInput?: number;
  costPer1MOutput?: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  endpoint: string;
  signupUrl: string;
  models: ModelInfo[];
  requiresApiKey: boolean;
  description?: string;
}

export const MODEL_PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: 'OR',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    signupUrl: 'https://openrouter.ai?ref=recoder',
    requiresApiKey: true,
    description: 'Access 200+ models from multiple providers with a single API key',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', contextWindow: 200000, supportsVision: true },
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, supportsVision: true },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200000, supportsVision: true },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsVision: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsVision: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsVision: true },
      { id: 'openai/gpt-4.1', name: 'GPT-4.1', contextWindow: 1000000, supportsVision: true },
      { id: 'openai/o1', name: 'o1', contextWindow: 200000, supportsVision: true },
      { id: 'openai/o3-mini', name: 'o3 Mini', contextWindow: 200000, supportsVision: true },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, supportsVision: true },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 2000000, supportsVision: true },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsVision: true },
      { id: 'x-ai/grok-4', name: 'Grok 4', contextWindow: 128000, supportsVision: false },
      { id: 'x-ai/grok-code-fast-1', name: 'Grok Code Fast', contextWindow: 128000, supportsVision: false },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', contextWindow: 64000, supportsVision: false },
      { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', contextWindow: 64000, supportsVision: false },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextWindow: 128000, supportsVision: false },
      { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', contextWindow: 128000, supportsVision: false },
      { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', contextWindow: 128000, supportsVision: true },
      { id: 'minimax/minimax-m2', name: 'MiniMax M2', contextWindow: 128000, supportsVision: false },
      { id: 'openrouter/polaris-alpha', name: 'Polaris Alpha', contextWindow: 128000, supportsVision: false },
      { id: 'openrouter/sherlock-think-alpha', name: 'Sherlock Think Alpha', contextWindow: 128000, supportsVision: false },
      { id: 'zhipu-ai/glm-4-plus', name: 'GLM 4 Plus', contextWindow: 128000, supportsVision: true },
      { id: 'qwen/qwen3-235b-a22b-instruct', name: 'Qwen3 235B', contextWindow: 128000, supportsVision: false },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'AN',
    endpoint: 'https://api.anthropic.com/v1/messages',
    signupUrl: 'https://console.anthropic.com',
    requiresApiKey: true,
    description: 'Direct access to Claude models',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextWindow: 200000, supportsVision: true, costPer1MInput: 3, costPer1MOutput: 15 },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', contextWindow: 200000, supportsVision: true, costPer1MInput: 15, costPer1MOutput: 75 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsVision: true, costPer1MInput: 0.8, costPer1MOutput: 4 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, supportsVision: true, costPer1MInput: 3, costPer1MOutput: 15 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000, supportsVision: true, costPer1MInput: 15, costPer1MOutput: 75 },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: 'OA',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    signupUrl: 'https://platform.openai.com',
    requiresApiKey: true,
    description: 'Direct access to GPT and o-series models',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1000000, supportsVision: true, costPer1MInput: 2, costPer1MOutput: 8 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', contextWindow: 1000000, supportsVision: true, costPer1MInput: 0.4, costPer1MOutput: 1.6 },
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsVision: true, costPer1MInput: 2.5, costPer1MOutput: 10 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsVision: true, costPer1MInput: 0.15, costPer1MOutput: 0.6 },
      { id: 'o3', name: 'o3', contextWindow: 200000, supportsVision: true, costPer1MInput: 10, costPer1MOutput: 40 },
      { id: 'o3-mini', name: 'o3 Mini', contextWindow: 200000, supportsVision: true, costPer1MInput: 1.1, costPer1MOutput: 4.4 },
      { id: 'o1', name: 'o1', contextWindow: 200000, supportsVision: true, costPer1MInput: 15, costPer1MOutput: 60 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, supportsVision: true, costPer1MInput: 10, costPer1MOutput: 30 },
    ],
  },
  google: {
    id: 'google',
    name: 'Google AI',
    icon: 'GO',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    signupUrl: 'https://aistudio.google.com/apikey',
    requiresApiKey: true,
    description: 'Direct access to Gemini models with up to 2M context',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, supportsVision: true, costPer1MInput: 0.075, costPer1MOutput: 0.3 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 2000000, supportsVision: true, costPer1MInput: 1.25, costPer1MOutput: 10 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', contextWindow: 1000000, supportsVision: true, costPer1MInput: 0.02, costPer1MOutput: 0.08 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsVision: true, costPer1MInput: 0.1, costPer1MOutput: 0.4 },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', contextWindow: 1000000, supportsVision: true, costPer1MInput: 0.02, costPer1MOutput: 0.08 },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: 'GQ',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    signupUrl: 'https://console.groq.com',
    requiresApiKey: true,
    description: 'Ultra-fast inference with custom LPU hardware',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', contextWindow: 128000, supportsVision: false, costPer1MInput: 0.59, costPer1MOutput: 0.79 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextWindow: 128000, supportsVision: false, costPer1MInput: 0.05, costPer1MOutput: 0.08 },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', contextWindow: 128000, supportsVision: false, costPer1MInput: 0.11, costPer1MOutput: 0.34 },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B', contextWindow: 128000, supportsVision: false, costPer1MInput: 0.20, costPer1MOutput: 0.60 },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', contextWindow: 128000, supportsVision: false, costPer1MInput: 0.29, costPer1MOutput: 0.39 },
      { id: 'meta-llama/llama-guard-4-12b', name: 'Llama Guard 4 12B', contextWindow: 128000, supportsVision: false, costPer1MInput: 0.15, costPer1MOutput: 0.15 },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768, supportsVision: false, costPer1MInput: 0.24, costPer1MOutput: 0.24 },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'DS',
    endpoint: 'https://api.deepseek.com/chat/completions',
    signupUrl: 'https://platform.deepseek.com',
    requiresApiKey: true,
    description: 'Affordable and powerful AI models with reasoning capabilities',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 64000, supportsVision: false, costPer1MInput: 0.14, costPer1MOutput: 0.28 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', contextWindow: 64000, supportsVision: false, costPer1MInput: 0.55, costPer1MOutput: 2.19 },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', contextWindow: 64000, supportsVision: false, costPer1MInput: 0.14, costPer1MOutput: 0.28 },
    ],
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    icon: 'OL',
    endpoint: 'http://localhost:11434/api/chat',
    signupUrl: 'https://ollama.ai',
    requiresApiKey: false,
    description: 'Run models locally on your machine - free and private',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'llama3.2:3b', name: 'Llama 3.2 3B', contextWindow: 128000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'llama3.2:1b', name: 'Llama 3.2 1B', contextWindow: 128000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'codellama', name: 'Code Llama', contextWindow: 16000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'codellama:34b', name: 'Code Llama 34B', contextWindow: 16000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', contextWindow: 128000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', contextWindow: 128000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'mistral', name: 'Mistral 7B', contextWindow: 32000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'mixtral', name: 'Mixtral 8x7B', contextWindow: 32000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'phi3', name: 'Phi-3', contextWindow: 128000, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
      { id: 'gemma2', name: 'Gemma 2', contextWindow: 8192, supportsVision: false, costPer1MInput: 0, costPer1MOutput: 0 },
    ],
  },
};

export function getModelsByProvider(providerId: string): ModelInfo[] {
  return MODEL_PROVIDERS[providerId]?.models || [];
}

export function getAllProviders(): ProviderConfig[] {
  return Object.values(MODEL_PROVIDERS);
}

export function getProvider(providerId: string): ProviderConfig | undefined {
  return MODEL_PROVIDERS[providerId];
}

export function getModel(providerId: string, modelId: string): ModelInfo | undefined {
  const provider = getProvider(providerId);
  return provider?.models.find((m) => m.id === modelId);
}

export function addCustomModel(providerId: string, model: ModelInfo): boolean {
  const provider = MODEL_PROVIDERS[providerId];

  if (!provider) {
    return false;
  }

  // Check if model with same ID already exists
  const existingModel = provider.models.find((m) => m.id === model.id);
  if (existingModel) {
    return false;
  }

  // Add the new model to the provider
  provider.models.push(model);
  return true;
}

// ==================== Dynamic OpenRouter Model Fetching ====================

const OPENROUTER_MODELS_CACHE_KEY = 'recoder_openrouter_models_cache';
const OPENROUTER_CACHE_TTL = 3600000; // 1 hour

interface OpenRouterCacheEntry {
  models: ModelInfo[];
  fetchedAt: number;
}

interface OpenRouterApiModel {
  id: string;
  name: string;
  description?: string;
  pricing?: { prompt?: string; completion?: string };
  context_length?: number;
  top_provider?: { max_completion_tokens?: number };
  architecture?: { modality?: string };
}

function getOpenRouterCache(): OpenRouterCacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(OPENROUTER_MODELS_CACHE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as OpenRouterCacheEntry;
  } catch {
    return null;
  }
}

function setOpenRouterCache(models: ModelInfo[]): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: OpenRouterCacheEntry = { models, fetchedAt: Date.now() };
    localStorage.setItem(OPENROUTER_MODELS_CACHE_KEY, JSON.stringify(entry));
  } catch (e) {
    logger.error('[Models] Failed to cache OpenRouter models:', e);
  }
}

function mapOpenRouterModel(m: OpenRouterApiModel): ModelInfo {
  const promptCost = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : undefined;
  const completionCost = m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : undefined;
  const modality = m.architecture?.modality || '';

  return {
    id: m.id,
    name: m.name || m.id,
    description: m.description,
    contextWindow: m.context_length,
    maxTokens: m.top_provider?.max_completion_tokens,
    supportsVision: modality.includes('image') || modality.includes('multimodal'),
    costPer1MInput: promptCost,
    costPer1MOutput: completionCost,
  };
}

let _dynamicModelsPromise: Promise<ModelInfo[]> | null = null;
let _dynamicModelsLoaded = false;

/**
 * Fetch models from OpenRouter API. Two-tier cache:
 * 1. Server-side Redis cache via /api/models/list (1h TTL)
 * 2. Client-side localStorage cache (1h TTL)
 * Falls back to direct OpenRouter API, then hardcoded models.
 */
export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  // Check client-side cache first
  const cache = getOpenRouterCache();
  if (cache && (Date.now() - cache.fetchedAt) < OPENROUTER_CACHE_TTL) {
    return cache.models;
  }

  // Try server-side cached route first
  try {
    const serverResponse = await fetch('/api/models/list');
    if (serverResponse.ok) {
      const result = await serverResponse.json() as { models: ModelInfo[]; cached: boolean };
      if (result.models && result.models.length > 0) {
        setOpenRouterCache(result.models);
        return result.models;
      }
    }
  } catch {
    // Server route failed, fall through to direct API
  }

  // Fall back to direct OpenRouter API
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`OpenRouter API returned ${response.status}`);
    }
    const data = await response.json() as { data: OpenRouterApiModel[] };
    const models = (data.data || []).map(mapOpenRouterModel);
    setOpenRouterCache(models);
    return models;
  } catch (e) {
    logger.error('[Models] Failed to fetch OpenRouter models:', e);
    // Return stale cache if available
    if (cache) return cache.models;
    // Last resort: return hardcoded models
    return MODEL_PROVIDERS.openrouter.models;
  }
}

/**
 * Get dynamic OpenRouter models. Returns cached/fetched models.
 * Deduplicates concurrent calls.
 */
export async function getOpenRouterModels(): Promise<ModelInfo[]> {
  if (!_dynamicModelsPromise) {
    _dynamicModelsPromise = fetchOpenRouterModels().finally(() => {
      _dynamicModelsPromise = null;
      _dynamicModelsLoaded = true;
    });
  }
  return _dynamicModelsPromise;
}

/**
 * Check if dynamic models have been loaded at least once.
 */
export function isDynamicModelsLoaded(): boolean {
  return _dynamicModelsLoaded;
}

/**
 * Get all OpenRouter models: dynamic if loaded, otherwise hardcoded fallback.
 */
export function getOpenRouterModelsCached(): ModelInfo[] {
  const cache = getOpenRouterCache();
  if (cache) return cache.models;
  return MODEL_PROVIDERS.openrouter.models;
}
