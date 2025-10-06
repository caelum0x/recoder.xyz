/**
 * Comprehensive AI Model Registry
 * Includes FREE models, image generation, and ChatGPT-like features
 */

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  inputPrice: number;  // per million tokens
  outputPrice: number; // per million tokens
  imagePriceInput?: number; // per 1K images
  imagePriceOutput?: number; // per 1K images
  capabilities: {
    text: boolean;
    code: boolean;
    reasoning: boolean;
    imageGeneration?: boolean;
    imageInput?: boolean;
    streaming: boolean;
    functionCalling?: boolean;
    vision?: boolean;
  };
  isFree: boolean;
  apiEndpoint?: string;
}

/**
 * FREE AI MODELS REGISTRY
 */
export const FREE_MODELS: AIModel[] = [
  {
    id: 'glm-4.5-air',
    name: 'GLM 4.5 Air',
    provider: 'z-ai',
    contextWindow: 131000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
      functionCalling: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 164000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-r1-0528:free',
    name: 'DeepSeek R1 0528',
    provider: 'deepseek',
    contextWindow: 164000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'tngtech/deepseek-r1t2-chimera:free',
    name: 'DeepSeek R1T2 Chimera',
    provider: 'tngtech',
    contextWindow: 164000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'deepseek/deepseek-v3-0324:free',
    name: 'DeepSeek V3 0324',
    provider: 'deepseek',
    contextWindow: 164000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'tngtech/deepseek-r1t-chimera:free',
    name: 'DeepSeek R1T Chimera',
    provider: 'tngtech',
    contextWindow: 164000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'qwen/qwen3-coder-480b-a35b:free',
    name: 'Qwen3 Coder 480B',
    provider: 'qwen',
    contextWindow: 262000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
      functionCalling: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'microsoft/mai-ds-r1:free',
    name: 'Microsoft MAI DS R1',
    provider: 'microsoft',
    contextWindow: 164000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
    },
    isFree: true,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
];

/**
 * IMAGE GENERATION MODELS
 */
export const IMAGE_MODELS: AIModel[] = [
  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image (Nano Banana)',
    provider: 'google',
    contextWindow: 33000,
    inputPrice: 0.30,
    outputPrice: 2.50,
    imagePriceInput: 1.238,
    imagePriceOutput: 0.03,
    capabilities: {
      text: true,
      code: false,
      reasoning: true,
      imageGeneration: true,
      imageInput: true,
      streaming: true,
      vision: true,
    },
    isFree: false,
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1',
  },
  {
    id: 'black-forest-labs/flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    provider: 'black-forest-labs',
    contextWindow: 0,
    inputPrice: 0,
    outputPrice: 0.04, // per image
    capabilities: {
      text: false,
      code: false,
      reasoning: false,
      imageGeneration: true,
      streaming: false,
    },
    isFree: false,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
  {
    id: 'stability-ai/stable-diffusion-3.5-large',
    name: 'Stable Diffusion 3.5 Large',
    provider: 'stability-ai',
    contextWindow: 0,
    inputPrice: 0,
    outputPrice: 0.065, // per image
    capabilities: {
      text: false,
      code: false,
      reasoning: false,
      imageGeneration: true,
      streaming: false,
    },
    isFree: false,
    apiEndpoint: 'https://api.openrouter.ai/api/v1',
  },
];

/**
 * PREMIUM MODELS (for reference)
 */
export const PREMIUM_MODELS: AIModel[] = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    isFree: false,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    inputPrice: 2.5,
    outputPrice: 10.0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    isFree: false,
  },
  {
    id: 'google/gemini-2.0-flash-thinking-exp',
    name: 'Gemini 2.0 Flash Thinking',
    provider: 'google',
    contextWindow: 1000000,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: {
      text: true,
      code: true,
      reasoning: true,
      streaming: true,
      functionCalling: true,
      vision: true,
    },
    isFree: true,
  },
];

/**
 * ALL MODELS COMBINED
 */
export const ALL_MODELS = [...FREE_MODELS, ...IMAGE_MODELS, ...PREMIUM_MODELS];

/**
 * Model Categories for UI
 */
export const MODEL_CATEGORIES = {
  free: {
    name: 'Free Models',
    description: 'No API costs - Perfect for development and testing',
    models: FREE_MODELS,
  },
  image: {
    name: 'Image Generation',
    description: 'Create stunning images with AI',
    models: IMAGE_MODELS,
  },
  premium: {
    name: 'Premium Models',
    description: 'Advanced capabilities with API costs',
    models: PREMIUM_MODELS,
  },
};

/**
 * Helper Functions
 */
export function getModelById(modelId: string): AIModel | undefined {
  return ALL_MODELS.find((m) => m.id === modelId);
}

export function getFreeModels(): AIModel[] {
  return ALL_MODELS.filter((m) => m.isFree);
}

export function getImageGenerationModels(): AIModel[] {
  return ALL_MODELS.filter((m) => m.capabilities.imageGeneration);
}

export function getReasoningModels(): AIModel[] {
  return ALL_MODELS.filter((m) => m.capabilities.reasoning);
}

export function getCodingModels(): AIModel[] {
  return ALL_MODELS.filter((m) => m.capabilities.code);
}

/**
 * Model Recommendations
 */
export function recommendModel(task: 'coding' | 'reasoning' | 'image' | 'general'): AIModel {
  switch (task) {
    case 'coding':
      return getModelById('qwen/qwen3-coder-480b-a35b:free') || FREE_MODELS[0];
    case 'reasoning':
      return getModelById('deepseek/deepseek-r1:free') || FREE_MODELS[1];
    case 'image':
      return getModelById('google/gemini-2.5-flash-image') || IMAGE_MODELS[0];
    case 'general':
    default:
      return getModelById('glm-4.5-air') || FREE_MODELS[0];
  }
}
