/**
 * AI Provider and Model Configuration
 * Based on PRD requirements for BYOK model selection
 */

export interface ModelInfo {
  id: string;
  name: string;
  category: 'popular' | 'budget' | 'advanced';
  speed: 1 | 2 | 3; // 1=slow, 2=fast, 3=very fast
  cost: number; // Cost per 1K tokens
  contextLength: number;
  description: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  recommended?: boolean;
  endpoint: string;
  signupUrl: string;
  models: ModelInfo[];
}

export const MODEL_PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '📦',
    recommended: true,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    signupUrl: 'https://openrouter.ai?ref=recoder',
    models: [
      // Popular Models (Based on real OpenRouter usage data)
      {
        id: 'x-ai/grok-code-fast-1',
        name: 'Grok Code Fast 1',
        category: 'popular',
        speed: 3,
        cost: 0.001,
        contextLength: 131072,
        description: '#1 most used - Ultra-fast coding model by xAI',
      },
      {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        category: 'popular',
        speed: 3,
        cost: 0.003,
        contextLength: 200000,
        description: '#2 most used - Latest Claude, excellent for coding',
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        category: 'popular',
        speed: 3,
        cost: 0.0001,
        contextLength: 1000000,
        description: '#3 most used - Fastest Gemini model',
      },
      {
        id: 'x-ai/grok-4-fast',
        name: 'Grok 4 Fast',
        category: 'popular',
        speed: 3,
        cost: 0.002,
        contextLength: 131072,
        description: '#5 most used - Latest Grok model',
      },
      {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        category: 'popular',
        speed: 2,
        cost: 0.0005,
        contextLength: 2000000,
        description: '#6 most used - Most capable Gemini',
      },
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        category: 'popular',
        speed: 3,
        cost: 0.003,
        contextLength: 200000,
        description: '#9 most used - Previous gen Claude',
      },
      {
        id: 'openai/gpt-5-mini',
        name: 'GPT-5 Mini',
        category: 'popular',
        speed: 3,
        cost: 0.0002,
        contextLength: 128000,
        description: '#13 most used - Latest compact GPT',
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        category: 'popular',
        speed: 3,
        cost: 0.00015,
        contextLength: 128000,
        description: '#16 most used - Fast and affordable GPT',
      },
      // Budget Models (Free & Ultra-Cheap)
      {
        id: 'google/gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        category: 'budget',
        speed: 3,
        cost: 0.00005,
        contextLength: 1000000,
        description: '#8 most used - Ultra-fast, ultra-cheap',
      },
      {
        id: 'deepseek/deepseek-v3-0324',
        name: 'DeepSeek V3',
        category: 'budget',
        speed: 3,
        cost: 0.00014,
        contextLength: 65536,
        description: '#10 most used - Open source, very cheap',
      },
      {
        id: 'deepseek/deepseek-v3.1',
        name: 'DeepSeek V3.1',
        category: 'budget',
        speed: 3,
        cost: 0.00014,
        contextLength: 65536,
        description: '#14 most used - Latest DeepSeek',
      },
      {
        id: 'tngtech/deepseek-r1t2-chimera',
        name: 'DeepSeek R1T2 (Free)',
        category: 'budget',
        speed: 3,
        cost: 0,
        contextLength: 65536,
        description: '#17 most used - Completely FREE!',
      },
      {
        id: 'anthropic/claude-haiku-4.5',
        name: 'Claude Haiku 4.5',
        category: 'budget',
        speed: 3,
        cost: 0.0001,
        contextLength: 200000,
        description: '#20 most used - Fastest Claude, very cheap',
      },
      // Advanced Models (Reasoning & Complex Tasks)
      {
        id: 'minimax/minimax-m2',
        name: 'MiniMax M2',
        category: 'advanced',
        speed: 2,
        cost: 0.005,
        contextLength: 200000,
        description: '#4 most used - Advanced reasoning model',
      },
      {
        id: 'google/gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        category: 'advanced',
        speed: 3,
        cost: 0.0002,
        contextLength: 1000000,
        description: '#7 most used - Previous gen Gemini',
      },
      {
        id: 'openrouter/polaris-alpha',
        name: 'Polaris Alpha',
        category: 'advanced',
        speed: 2,
        cost: 0.003,
        contextLength: 128000,
        description: '#11 most used - OpenRouter native model',
      },
      {
        id: 'openrouter/sherlock-think-alpha',
        name: 'Sherlock Think Alpha',
        category: 'advanced',
        speed: 2,
        cost: 0.004,
        contextLength: 128000,
        description: '#12 most used - Advanced reasoning',
      },
      {
        id: 'z-ai/glm-4.6',
        name: 'GLM 4.6',
        category: 'advanced',
        speed: 2,
        cost: 0.002,
        contextLength: 131072,
        description: '#15 most used - Chinese powerhouse model',
      },
      {
        id: 'qwen/qwen3-235b-a22b-instruct',
        name: 'Qwen3 235B',
        category: 'advanced',
        speed: 1,
        cost: 0.003,
        contextLength: 32768,
        description: '#18 most used - Massive 235B parameter model',
      },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🤖',
    endpoint: 'https://api.anthropic.com/v1/messages',
    signupUrl: 'https://console.anthropic.com',
    models: [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        category: 'popular',
        speed: 3,
        cost: 0.003,
        contextLength: 200000,
        description: 'Latest Claude model, excellent for coding',
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        category: 'advanced',
        speed: 2,
        cost: 0.015,
        contextLength: 200000,
        description: 'Most capable Claude model',
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        category: 'popular',
        speed: 3,
        cost: 0.003,
        contextLength: 200000,
        description: 'Balanced performance and cost',
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        category: 'budget',
        speed: 3,
        cost: 0.00025,
        contextLength: 200000,
        description: 'Fastest Claude model',
      },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: '🔷',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    signupUrl: 'https://platform.openai.com',
    models: [
      {
        id: 'gpt-4-turbo-preview',
        name: 'GPT-4 Turbo',
        category: 'popular',
        speed: 3,
        cost: 0.01,
        contextLength: 128000,
        description: 'Latest GPT-4 with improved performance',
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        category: 'popular',
        speed: 2,
        cost: 0.03,
        contextLength: 8192,
        description: 'Most capable GPT model',
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        category: 'budget',
        speed: 3,
        cost: 0.0005,
        contextLength: 16385,
        description: 'Fast and cost-effective',
      },
    ],
  },
};

export function getSpeedIndicator(speed: number): string {
  switch (speed) {
    case 3:
      return 'Fast';
    case 2:
      return 'Medium';
    case 1:
      return 'Slow';
    default:
      return '';
  }
}

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

export function addCustomModel(providerId: string, model: Omit<ModelInfo, 'provider'>): boolean {
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
  const newModel: ModelInfo = {
    ...model,
    provider: providerId as any
  };

  provider.models.push(newModel);
  return true;
}
