/**
 * Model Selection Store
 *
 * Manages AI model selection state with persistence to localStorage.
 * Provides model metadata including speed, cost, and capability information.
 */

import { atom, map, computed } from 'nanostores';

// Storage key
const MODEL_SELECTION_KEY = 'recoder_model_selection';
const RECENT_MODELS_KEY = 'recoder_recent_models';
const MAX_RECENT_MODELS = 5;

// Speed tier for models
export type SpeedTier = 'fast' | 'balanced' | 'powerful';

// Cost tier (1 = $, 2 = $$, 3 = $$$)
export type CostTier = 1 | 2 | 3;

// Provider identifiers
export type Provider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'meta'
  | 'groq'
  | 'mistral'
  | 'xai';

// Extended model information
export interface ModelMetadata {
  id: string; // OpenRouter model ID
  name: string;
  provider: Provider;
  contextWindow: number;
  speed: SpeedTier;
  costTier: CostTier;
  description: string;
  recommended?: boolean;
  supportsVision?: boolean;
  supportsTools?: boolean;
  new?: boolean; // Mark new models
}

// Provider information
export interface ProviderInfo {
  id: Provider;
  name: string;
  icon: string;
  color: string;
}

// Provider metadata
export const PROVIDERS: Record<Provider, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'i-simple-icons:anthropic',
    color: '#D4A574',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: 'i-simple-icons:openai',
    color: '#00A67E',
  },
  google: {
    id: 'google',
    name: 'Google',
    icon: 'i-simple-icons:google',
    color: '#4285F4',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'i-ph:code-bold',
    color: '#6366F1',
  },
  meta: {
    id: 'meta',
    name: 'Meta',
    icon: 'i-simple-icons:meta',
    color: '#0668E1',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: 'i-ph:lightning-bold',
    color: '#F55036',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    icon: 'i-ph:wind-bold',
    color: '#FF7000',
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    icon: 'i-ph:x-bold',
    color: '#FFFFFF',
  },
};

// Available models with full metadata (all functional with OpenRouter)
export const AVAILABLE_MODELS: ModelMetadata[] = [
  // Anthropic Models
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    speed: 'balanced',
    costTier: 2,
    description: 'Best balance of intelligence, speed and cost for most tasks',
    recommended: true,
    supportsVision: true,
    supportsTools: true,
    new: true,
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    speed: 'balanced',
    costTier: 2,
    description: 'Latest Sonnet with improved reasoning and coding abilities',
    recommended: true,
    supportsVision: true,
    supportsTools: true,
    new: true,
  },
  {
    id: 'anthropic/claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200000,
    speed: 'powerful',
    costTier: 3,
    description: 'Most capable Claude model for complex reasoning and analysis',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200000,
    speed: 'fast',
    costTier: 1,
    description: 'Fast and affordable for simple tasks and high-volume use',
    supportsVision: true,
    supportsTools: true,
  },

  // OpenAI Models
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    speed: 'balanced',
    costTier: 2,
    description: 'Advanced multimodal model with excellent reasoning',
    recommended: true,
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    speed: 'fast',
    costTier: 1,
    description: 'Fast and affordable for everyday tasks',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'openai/gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    contextWindow: 1000000,
    speed: 'balanced',
    costTier: 2,
    description: 'Latest GPT-4 with 1M context window',
    supportsVision: true,
    supportsTools: true,
    new: true,
  },
  {
    id: 'openai/o1',
    name: 'o1',
    provider: 'openai',
    contextWindow: 200000,
    speed: 'powerful',
    costTier: 3,
    description: 'Advanced reasoning model for complex problems',
    supportsVision: true,
    supportsTools: true,
  },
  {
    id: 'openai/o3-mini',
    name: 'o3 Mini',
    provider: 'openai',
    contextWindow: 200000,
    speed: 'balanced',
    costTier: 2,
    description: 'Efficient reasoning model with good performance',
    supportsVision: true,
    supportsTools: true,
    new: true,
  },

  // Google Models
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 2000000,
    speed: 'balanced',
    costTier: 2,
    description: 'Massive 2M context window for large codebases',
    supportsVision: true,
    supportsTools: true,
    new: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1000000,
    speed: 'fast',
    costTier: 1,
    description: 'Fast and efficient with 1M context window',
    supportsVision: true,
    supportsTools: true,
    new: true,
  },
  {
    id: 'google/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    speed: 'fast',
    costTier: 1,
    description: 'Previous generation flash model',
    supportsVision: true,
    supportsTools: true,
  },

  // DeepSeek Models
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 64000,
    speed: 'balanced',
    costTier: 1,
    description: 'Powerful reasoning model at affordable price',
    recommended: true,
    supportsVision: false,
    supportsTools: true,
    new: true,
  },
  {
    id: 'deepseek/deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    contextWindow: 64000,
    speed: 'fast',
    costTier: 1,
    description: 'Fast and affordable general-purpose model',
    supportsVision: false,
    supportsTools: true,
  },
  {
    id: 'deepseek/deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    contextWindow: 64000,
    speed: 'fast',
    costTier: 1,
    description: 'Specialized for code generation and understanding',
    supportsVision: false,
    supportsTools: true,
  },

  // Meta/Groq Models (Llama via Groq)
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'meta',
    contextWindow: 128000,
    speed: 'fast',
    costTier: 1,
    description: 'Open-source powerhouse with excellent performance',
    supportsVision: false,
    supportsTools: true,
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B',
    provider: 'meta',
    contextWindow: 128000,
    speed: 'fast',
    costTier: 1,
    description: 'Latest Llama 4 model optimized for speed',
    supportsVision: false,
    supportsTools: true,
    new: true,
  },

  // xAI Models
  {
    id: 'x-ai/grok-4',
    name: 'Grok 4',
    provider: 'xai',
    contextWindow: 128000,
    speed: 'powerful',
    costTier: 3,
    description: 'Most capable Grok model for complex tasks',
    supportsVision: false,
    supportsTools: true,
    new: true,
  },
  {
    id: 'x-ai/grok-code-fast-1',
    name: 'Grok Code Fast',
    provider: 'xai',
    contextWindow: 128000,
    speed: 'fast',
    costTier: 1,
    description: 'Optimized for fast code generation',
    recommended: true,
    supportsVision: false,
    supportsTools: true,
  },

  // Mistral Models
  {
    id: 'mistralai/mistral-large-2411',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 128000,
    speed: 'balanced',
    costTier: 2,
    description: 'Flagship Mistral model with strong reasoning',
    supportsVision: true,
    supportsTools: true,
  },

  // Qwen Models (via OpenRouter)
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'deepseek', // Grouping with coding-focused models
    contextWindow: 128000,
    speed: 'balanced',
    costTier: 1,
    description: 'Excellent coding model from Alibaba',
    supportsVision: false,
    supportsTools: true,
  },
];

// Group models by provider
export function getModelsByProvider(): Map<Provider, ModelMetadata[]> {
  const grouped = new Map<Provider, ModelMetadata[]>();

  for (const model of AVAILABLE_MODELS) {
    const existing = grouped.get(model.provider) || [];
    existing.push(model);
    grouped.set(model.provider, existing);
  }

  return grouped;
}

// Get model by ID
export function getModelById(id: string): ModelMetadata | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

// Get recommended models
export function getRecommendedModels(): ModelMetadata[] {
  return AVAILABLE_MODELS.filter((m) => m.recommended);
}

// Get models by speed tier
export function getModelsBySpeed(speed: SpeedTier): ModelMetadata[] {
  return AVAILABLE_MODELS.filter((m) => m.speed === speed);
}

// Get models by cost tier
export function getModelsByCost(cost: CostTier): ModelMetadata[] {
  return AVAILABLE_MODELS.filter((m) => m.costTier === cost);
}

// Selection state interface
interface ModelSelectionState {
  selectedModelId: string;
  recentModelIds: string[];
}

// Default state
const DEFAULT_STATE: ModelSelectionState = {
  selectedModelId: 'x-ai/grok-code-fast-1', // Default to Grok Code Fast
  recentModelIds: [],
};

// Load state from localStorage
function loadState(): ModelSelectionState {
  if (typeof window === 'undefined') return DEFAULT_STATE;

  try {
    const stored = localStorage.getItem(MODEL_SELECTION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        selectedModelId: parsed.selectedModelId || DEFAULT_STATE.selectedModelId,
        recentModelIds: parsed.recentModelIds || [],
      };
    }
  } catch (e) {
    console.error('[ModelSelection] Failed to load state:', e);
  }

  return DEFAULT_STATE;
}

// Save state to localStorage
function saveState(state: ModelSelectionState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[ModelSelection] Failed to save state:', e);
  }
}

// Create stores
const initialState = loadState();

export const selectedModelIdStore = atom<string>(initialState.selectedModelId);
export const recentModelIdsStore = atom<string[]>(initialState.recentModelIds);

// Computed store for selected model metadata
export const selectedModelStore = computed(selectedModelIdStore, (id) => {
  return getModelById(id) || AVAILABLE_MODELS[0];
});

// Computed store for recent models with metadata
export const recentModelsStore = computed(recentModelIdsStore, (ids) => {
  return ids.map((id) => getModelById(id)).filter(Boolean) as ModelMetadata[];
});

// Actions
export function selectModel(modelId: string): void {
  const model = getModelById(modelId);
  if (!model) {
    console.warn(`[ModelSelection] Model not found: ${modelId}`);
    return;
  }

  const currentId = selectedModelIdStore.get();
  if (currentId === modelId) return;

  // Update selected model
  selectedModelIdStore.set(modelId);

  // Update recent models (add current to recent, limit to MAX)
  const recentIds = recentModelIdsStore.get();
  const newRecent = [modelId, ...recentIds.filter((id) => id !== modelId)].slice(
    0,
    MAX_RECENT_MODELS
  );
  recentModelIdsStore.set(newRecent);

  // Persist state
  saveState({
    selectedModelId: modelId,
    recentModelIds: newRecent,
  });

  // Also update the legacy localStorage values for backward compatibility
  if (typeof window !== 'undefined') {
    localStorage.setItem('selectedModel', modelId);
    // Extract provider from model ID (e.g., "anthropic/claude-sonnet-4" -> "openrouter")
    // Since all these models go through OpenRouter
    localStorage.setItem('selectedProvider', 'openrouter');
  }
}

// Subscribe to changes and persist
selectedModelIdStore.subscribe((modelId) => {
  const recentIds = recentModelIdsStore.get();
  saveState({
    selectedModelId: modelId,
    recentModelIds: recentIds,
  });
});

// Search/filter models
export function searchModels(query: string): ModelMetadata[] {
  const lowerQuery = query.toLowerCase();
  return AVAILABLE_MODELS.filter(
    (model) =>
      model.name.toLowerCase().includes(lowerQuery) ||
      model.provider.toLowerCase().includes(lowerQuery) ||
      model.description.toLowerCase().includes(lowerQuery)
  );
}

// Filter models by criteria
export interface ModelFilter {
  providers?: Provider[];
  speedTiers?: SpeedTier[];
  costTiers?: CostTier[];
  supportsVision?: boolean;
  supportsTools?: boolean;
  recommended?: boolean;
}

export function filterModels(filter: ModelFilter): ModelMetadata[] {
  return AVAILABLE_MODELS.filter((model) => {
    if (filter.providers && !filter.providers.includes(model.provider)) {
      return false;
    }
    if (filter.speedTiers && !filter.speedTiers.includes(model.speed)) {
      return false;
    }
    if (filter.costTiers && !filter.costTiers.includes(model.costTier)) {
      return false;
    }
    if (filter.supportsVision !== undefined && model.supportsVision !== filter.supportsVision) {
      return false;
    }
    if (filter.supportsTools !== undefined && model.supportsTools !== filter.supportsTools) {
      return false;
    }
    if (filter.recommended !== undefined && model.recommended !== filter.recommended) {
      return false;
    }
    return true;
  });
}

// Get speed tier display info
export function getSpeedInfo(speed: SpeedTier): { label: string; color: string; icon: string } {
  switch (speed) {
    case 'fast':
      return { label: 'Fast', color: 'text-green-400', icon: 'i-ph:lightning-bold' };
    case 'balanced':
      return { label: 'Balanced', color: 'text-blue-400', icon: 'i-ph:scales-bold' };
    case 'powerful':
      return { label: 'Powerful', color: 'text-purple-400', icon: 'i-ph:brain-bold' };
  }
}

// Get cost tier display info
export function getCostInfo(cost: CostTier): { label: string; color: string; icon: string } {
  switch (cost) {
    case 1:
      return { label: '$', color: 'text-green-400', icon: 'i-ph:currency-dollar' };
    case 2:
      return { label: '$$', color: 'text-yellow-400', icon: 'i-ph:currency-dollar' };
    case 3:
      return { label: '$$$', color: 'text-orange-400', icon: 'i-ph:currency-dollar' };
  }
}

// Format context window for display
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}
