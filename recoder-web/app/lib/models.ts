/**
 * AI Provider and Model Configuration
 */

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  endpoint: string;
  signupUrl: string;
  models: ModelInfo[];
}

export const MODEL_PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: 'OR',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    signupUrl: 'https://openrouter.ai?ref=recoder',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4' },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'openai/gpt-4.1', name: 'GPT-4.1' },
      { id: 'openai/o1', name: 'o1' },
      { id: 'openai/o3-mini', name: 'o3 Mini' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'x-ai/grok-4', name: 'Grok 4' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
      { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' },
      { id: 'mistralai/mistral-large-2411', name: 'Mistral Large' },
      { id: 'minimax/minimax-m2', name: 'MiniMax M2' },
      { id: 'openrouter/polaris-alpha', name: 'Polaris Alpha' },
      { id: 'openrouter/sherlock-think-alpha', name: 'Sherlock Think Alpha' },
      { id: 'zhipu-ai/glm-4-plus', name: 'GLM 4 Plus' },
      { id: 'qwen/qwen3-235b-a22b-instruct', name: 'Qwen3 235B' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'AN',
    endpoint: 'https://api.anthropic.com/v1/messages',
    signupUrl: 'https://console.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: 'OA',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    signupUrl: 'https://platform.openai.com',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3', name: 'o3' },
      { id: 'o3-mini', name: 'o3 Mini' },
      { id: 'o1', name: 'o1' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: 'GQ',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    signupUrl: 'https://console.groq.com',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B' },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
      { id: 'meta-llama/llama-guard-4-12b', name: 'Llama Guard 4 12B' },
    ],
  },
  google: {
    id: 'google',
    name: 'Google AI',
    icon: 'GO',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    signupUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
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
