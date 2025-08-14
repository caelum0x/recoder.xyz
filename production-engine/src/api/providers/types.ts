/**
 * Provider types for production engine API
 */

export interface ProviderSettings {
  apiProvider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiModelId?: string;
  maxTokens?: number;
  temperature?: number;
  
  // Anthropic specific
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  anthropicUseAuthToken?: boolean;
  
  // OpenAI specific
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  
  // Other provider options
  [key: string]: any;
}

export interface ModelInfo {
  maxTokens?: number;
  contextWindow?: number;
  supportsImages?: boolean;
  supportsPromptCache?: boolean;
  inputPrice?: number;
  outputPrice?: number;
  cacheWritesPrice?: number;
  cacheReadsPrice?: number;
  supportsReasoningBudget?: boolean;
  supportsReasoningEffort?: boolean;
}

export interface ApiProvider {
  name: string;
  baseUrl?: string;
  models: Record<string, ModelInfo>;
}

export type ApiProviderName = 
  | 'anthropic'
  | 'openai' 
  | 'openrouter'
  | 'gemini'
  | 'ollama'
  | 'groq'
  | 'cerebras'
  | 'mistral'
  | 'bedrock'
  | 'vertex';