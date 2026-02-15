/**
 * Multi-Model Provider via OpenRouter
 * Uses OpenRouter.ai to access ALL AI models with a single API key
 * Supports: Anthropic, DeepSeek, Google Gemini, OpenAI, Mistral, Grok, etc.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { ModelConfig } from './model-router';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ModelProvider');

export interface ModelProviderConfig {
  openrouterKey?: string;
  anthropicKey?: string; // Fallback for direct Anthropic access
}

/**
 * OpenRouter Model ID Mappings
 * Maps our internal model IDs to OpenRouter model identifiers
 *
 * TOP PROGRAMMING MODELS (ordered by performance):
 * 1. Grok Code Fast 1 (x-ai) - 1.2T tokens, 57.9% market share
 * 2. Claude Sonnet 4.5 (anthropic) - 302B tokens, 14.5%
 * 3. Claude Sonnet 4 (anthropic) - 88.4B tokens, 4.3%
 * 4. GPT-5 (openai) - 50.5B tokens, 2.4%
 * 5. GPT-OSS-20B (openai) - 46B tokens, 2.2%
 * 6. Gemini 2.5 Flash (google) - 34.8B tokens, 1.7%
 * 7. GLM 4.6 (z-ai) - 34.5B tokens, 1.7%
 * 8. Gemini 2.5 Pro (google) - 30.9B tokens, 1.5%
 * 9. Qwen3 Coder 30B (qwen) - 28B tokens, 1.4%
 */
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  // TOP TIER - Best for Programming
  'grok-code-fast-1': 'x-ai/grok-code-fast-1',
  'claude-sonnet-4.5': 'anthropic/claude-sonnet-4.5',
  'claude-sonnet-4': 'anthropic/claude-sonnet-4-20250514',
  'gpt-5': 'openai/gpt-5',
  'gpt-oss-20b': 'openai/gpt-oss-20b',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'glm-4.6': 'zhipuai/glm-4.6',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'qwen3-coder-30b': 'qwen/qwen3-coder-30b-a3b-instruct',

  // LEGACY - Other Claude Models
  'claude-opus-4.1': 'anthropic/claude-opus-4-20250514',
  'claude-sonnet-3.5': 'anthropic/claude-3.5-sonnet',
  'claude-haiku-3.5': 'anthropic/claude-3.5-haiku',

  // DeepSeek
  'deepseek-r1': 'deepseek/deepseek-r1',
  'deepseek-r1-qwen3-8b': 'deepseek/deepseek-r1:free', // Free tier
  'deepseek-v3': 'deepseek/deepseek-chat',

  // Google Gemini - FREE models
  'gemini-2.5-flash-lite': 'google/gemini-2.0-flash-exp:free',
  'gemini-2.0-flash-thinking': 'google/gemini-2.0-flash-thinking-exp:free',
  'gemini-flash-free': 'google/gemini-flash-1.5:free',

  // OpenAI (Legacy)
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',

  // Mistral
  'mistral-small': 'mistralai/mistral-small',
  'mistral-large': 'mistralai/mistral-large',

  // xAI Grok (Legacy)
  'grok-2-mini': 'x-ai/grok-2-1212',
  'grok-2-vision': 'x-ai/grok-2-vision-1212'
};

/**
 * Get the appropriate AI model via OpenRouter
 */
export function getModel(
  modelConfig: ModelConfig,
  providerConfig: ModelProviderConfig
): LanguageModel {
  // Try OpenRouter first (preferred - one API key for all models)
  if (providerConfig.openrouterKey) {
    return getOpenRouterModel(modelConfig.id, providerConfig.openrouterKey);
  }

  // Fallback to direct Anthropic if no OpenRouter key
  if (providerConfig.anthropicKey && modelConfig.provider === 'anthropic') {
    logger.warn('⚠️  Using direct Anthropic (OpenRouter recommended for cost savings)');
    return getAnthropicDirect(modelConfig.id, providerConfig.anthropicKey);
  }

  throw new Error('No API keys configured. Please set OPENROUTER_API_KEY or ANTHROPIC_API_KEY');
}

/**
 * Get model via OpenRouter (supports ALL providers with one API key)
 */
function getOpenRouterModel(modelId: string, apiKey: string): LanguageModel {
  // Use OpenAI SDK with OpenRouter baseURL (compatible with AI SDK v3)
  const openrouter = createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder.xyz'
    },
  });

  // Map our model ID to OpenRouter model ID
  const openrouterModelId = OPENROUTER_MODEL_MAP[modelId] || modelId;

  logger.info(`🌐 OpenRouter: ${modelId} → ${openrouterModelId}`);

  // Use .chat() for OpenAI SDK adapter - cast through unknown to avoid type mismatch
  return openrouter.chat(openrouterModelId) as unknown as LanguageModel;
}

/**
 * Direct Anthropic access (fallback when no OpenRouter key)
 */
function getAnthropicDirect(modelId: string, apiKey: string): LanguageModel {
  const anthropic = createAnthropic({ apiKey });

  // Map our model IDs to Anthropic's model names
  const modelMap: Record<string, string> = {
    'claude-opus-4.1': 'claude-opus-4-20250514',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-sonnet-3.5': 'claude-3-5-sonnet-20240620',
    'claude-haiku-3.5': 'claude-3-5-haiku-20241022'
  };

  const anthropicModelName = modelMap[modelId] || 'claude-3-5-sonnet-20240620';
  return anthropic(anthropicModelName);
}

/**
 * Get fallback model (free Gemini via OpenRouter)
 */
export function getFallbackModel(providerConfig: ModelProviderConfig): LanguageModel {
  logger.info('⚠️  Using fallback model: Gemini 2.0 Flash (free via OpenRouter)');

  if (providerConfig.openrouterKey) {
    return getOpenRouterModel('gemini-2.5-flash', providerConfig.openrouterKey);
  }

  if (providerConfig.anthropicKey) {
    logger.warn('⚠️  OpenRouter not configured, using Anthropic Haiku');
    return getAnthropicDirect('claude-haiku-3.5', providerConfig.anthropicKey);
  }

  throw new Error('No API keys configured for fallback model');
}

/**
 * Validate model provider configuration
 */
export function validateProviderConfig(
  modelConfig: ModelConfig,
  providerConfig: ModelProviderConfig
): { valid: boolean; error?: string } {
  // If OpenRouter is configured, all models are available
  if (providerConfig.openrouterKey) {
    return { valid: true };
  }

  // If using direct Anthropic, check if model is Anthropic
  if (providerConfig.anthropicKey) {
    if (modelConfig.provider === 'anthropic') {
      return { valid: true };
    } else {
      return {
        valid: false,
        error: `${modelConfig.provider} models require OpenRouter API key`
      };
    }
  }

  return { valid: false, error: 'No API keys configured (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)' };
}

/**
 * Get model with automatic fallback
 */
export function getModelWithFallback(
  modelConfig: ModelConfig,
  providerConfig: ModelProviderConfig
): { model: LanguageModel; usingFallback: boolean } {
  // Validate configuration
  const validation = validateProviderConfig(modelConfig, providerConfig);

  if (!validation.valid) {
    logger.warn(`⚠️  ${validation.error}, using fallback model`);
    return {
      model: getFallbackModel(providerConfig),
      usingFallback: true
    };
  }

  try {
    const model = getModel(modelConfig, providerConfig);
    return { model, usingFallback: false };
  } catch (error) {
    logger.error(`Failed to get model ${modelConfig.id}:`, error);
    return {
      model: getFallbackModel(providerConfig),
      usingFallback: true
    };
  }
}
