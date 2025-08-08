/**
 * Shared types for AI providers across the recoder ecosystem
 */

export type ApiProvider = 
  | "anthropic" 
  | "openai" 
  | "gemini" 
  | "openrouter" 
  | "claude-code" 
  | "glama" 
  | "bedrock" 
  | "vertex" 
  | "ollama" 
  | "vscode-lm" 
  | "lmstudio"
  | "gemini-cli" 
  | "openai-native" 
  | "mistral" 
  | "deepseek" 
  | "xai" 
  | "cerebras" 
  | "fireworks" 
  | "together" 
  | "groq" 
  | "chutes" 
  | "requesty" 
  | "unbound" 
  | "litellm" 
  | "fake-ai" 
  | "human-relay" 
  | "anthropic-vertex"
  | "kilocode";

export interface ProviderSettings {
  apiProvider: ApiProvider;
  
  // Generic API settings
  apiKey?: string;
  apiModelId?: string;
  
  // OpenRouter specific
  openRouterApiKey?: string;
  openRouterModelId?: string;
  openRouterBaseUrl?: string;
  openRouterUseMiddleOutTransform?: boolean;
  openRouterSpecificProvider?: string;
  
  // Anthropic specific
  anthropicApiKey?: string;
  anthropicModelId?: string;
  
  // Google/Gemini specific
  googleApiKey?: string;
  geminiApiKey?: string;
  geminiModelId?: string;
  
  // Groq specific
  groqApiKey?: string;
  groqModelId?: string;
  
  // DeepSeek specific
  deepSeekApiKey?: string;
  deepSeekModelId?: string;
  
  // Ollama specific
  ollamaBaseUrl?: string;
  ollamaModelId?: string;
  
  // OpenAI specific
  openAiApiKey?: string;
  openAiModelId?: string;
  openAiHeaders?: Record<string, string>;
  
  // Additional settings
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface ModelInfo {
  maxTokens?: number | null;
  contextWindow?: number | null;
  supportsImages?: boolean;
  supportsPromptCache?: boolean;
  inputPrice?: number | null;
  outputPrice?: number | null;
  cacheWritesPrice?: number | null;
  cacheReadsPrice?: number | null;
  description?: string;
  supportsReasoningEffort?: boolean;
  supportedParameters?: string[];
  preferredIndex?: number | null;
  supportsComputerUse?: boolean;
  supportsReasoningBudget?: boolean;
  requiredReasoningBudget?: boolean;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokens?: {
    input: number;
    output: number;
  };
  finishReason?: string;
  cost?: number;
}

export interface TaskContext {
  type: 'blockchain' | 'web' | 'mobile' | 'backend' | 'security' | 'devops' | 'general';
  complexity: 'simple' | 'medium' | 'complex';
  priority: 'speed' | 'quality' | 'cost';
  requirements?: string[];
  tokenEstimate?: number;
}