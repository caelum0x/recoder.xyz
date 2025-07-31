/**
 * Other provider types and constants for recoder.xyz
 */

import type { ModelInfo } from './api';

// Chutes types
export type ChutesModelId = 
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-haiku-20241022";

export const chutesDefaultModelId: ChutesModelId = "gpt-4o";
export const DEEP_SEEK_DEFAULT_TEMPERATURE = 0.7;

export const chutesModels: Record<ChutesModelId, ModelInfo> = {
  "gpt-4o": {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 15.00,
    description: "GPT-4o via Chutes"
  },
  "gpt-4o-mini": {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    description: "GPT-4o Mini via Chutes"
  },
  "gpt-4-turbo": {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00,
    description: "GPT-4 Turbo via Chutes"
  },
  "claude-3-5-sonnet-20241022": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.5 Sonnet via Chutes"
  },
  "claude-3-5-haiku-20241022": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    description: "Claude 3.5 Haiku via Chutes"
  }
};

// Claude Code types
export type ClaudeCodeModelId = "claude-3-5-sonnet-20241022" | "claude-3-5-haiku-20241022";
export const claudeCodeDefaultModelId = "claude-3-5-sonnet-20241022";

export const claudeCodeModels: Record<ClaudeCodeModelId, ModelInfo> = {
  "claude-3-5-sonnet-20241022": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    description: "Claude 3.5 Sonnet via Claude Code"
  },
  "claude-3-5-haiku-20241022": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: true,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.25,
    outputPricePerMillion: 1.25,
    description: "Claude 3.5 Haiku via Claude Code"
  }
};

export function getClaudeCodeModelId(modelId?: string): ClaudeCodeModelId {
  if (modelId && modelId in claudeCodeModels) {
    return modelId as ClaudeCodeModelId;
  }
  return claudeCodeDefaultModelId;
}

// DeepSeek types
export type DeepSeekModelId = "deepseek-v3" | "deepseek-reasoner" | "deepseek-chat";
export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-v3";

export const deepSeekModels: Record<DeepSeekModelId, ModelInfo> = {
  "deepseek-v3": {
    maxTokens: 8192,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.28,
    description: "DeepSeek V3 - Latest model"
  },
  "deepseek-reasoner": {
    maxTokens: 8192,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: true,
    inputPricePerMillion: 0.55,
    outputPricePerMillion: 2.19,
    description: "DeepSeek Reasoner - With reasoning capabilities"
  },
  "deepseek-chat": {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: false,
    supportsTools: false,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.28,
    description: "DeepSeek Chat - Standard chat model"
  }
};

// LiteLLM constants
export const LITELLM_COMPUTER_USE_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022"
];

// LM Studio default model info
export const lMStudioDefaultModelInfo: ModelInfo = {
  maxTokens: 4096,
  contextWindow: 32000,
  supportsImages: false,
  supportsTools: false,
  supportsPromptCache: false,
  supportsComputerUse: false,
  supportsReasoningBudget: false,
  inputPricePerMillion: 0,
  outputPricePerMillion: 0,
  description: "Local model via LM Studio"
};

// Ollama default model info
export const ollamaDefaultModelInfo: ModelInfo = {
  maxTokens: 4096,
  contextWindow: 8192,
  supportsImages: false,
  supportsTools: false,
  supportsPromptCache: false,
  supportsComputerUse: false,
  supportsReasoningBudget: false,
  inputPricePerMillion: 0,
  outputPricePerMillion: 0,
  description: "Local model via Ollama"
};

// OpenRouter constants
export const OPEN_ROUTER_COMPUTER_USE_MODELS = [
  "anthropic/claude-3-5-sonnet-20241022",
  "anthropic/claude-3-5-haiku-20241022"
];

export const OPEN_ROUTER_REASONING_BUDGET_MODELS = [
  "o1-preview",
  "o1-mini",
  "openai/o1-preview",
  "openai/o1-mini"
];

export const OPEN_ROUTER_REQUIRED_REASONING_BUDGET_MODELS = [
  "o1-preview",
  "o1-mini",
  "openai/o1-preview", 
  "openai/o1-mini"
];

// Utility function for model parameters
export function isModelParameter(key: string): boolean {
  const modelParams = [
    'temperature', 'max_tokens', 'top_p', 'top_k', 'frequency_penalty', 
    'presence_penalty', 'stop', 'stream', 'logprobs', 'seed'
  ];
  return modelParams.includes(key);
}

// Glama types
export const GLAMA_DEFAULT_TEMPERATURE = 0.7;

export type GlamaModelId = "glama" | "glama-default";

export const glamaDefaultModelId: GlamaModelId = "glama-default";

export const glamaDefaultModelInfo = {
  maxTokens: 8192,
  contextWindow: 8192,
  supportsImages: false,
  supportsPromptCache: false,
  description: "Glama default model"
};

export const glamaModels = {
  [glamaDefaultModelId]: glamaDefaultModelInfo
};

// Groq types
export type GroqModelId = 
  | "llama-3.1-70b-versatile"
  | "llama-3.1-8b-instant"
  | "llama-3.2-90b-text-preview"
  | "mixtral-8x7b-32768"
  | "gemma2-9b-it";

export const groqDefaultModelId: GroqModelId = "llama-3.1-70b-versatile";

export const groqModels: Record<GroqModelId, ModelInfo> = {
  "llama-3.1-70b-versatile": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Llama 3.1 70B Versatile"
  },
  "llama-3.1-8b-instant": {
    maxTokens: 8192,
    contextWindow: 131072, 
    supportsImages: false,
    supportsPromptCache: false,
    description: "Llama 3.1 8B Instant"
  },
  "llama-3.2-90b-text-preview": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Llama 3.2 90B Text Preview"
  },
  "mixtral-8x7b-32768": {
    maxTokens: 32768,
    contextWindow: 32768,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Mixtral 8x7B 32K"
  },
  "gemma2-9b-it": {
    maxTokens: 8192,
    contextWindow: 8192,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Google Gemma 2 9B IT"
  }
};

// Mistral types
export const MISTRAL_DEFAULT_TEMPERATURE = 0.7;

export type MistralModelId = 
  | "mistral-large-latest"
  | "mistral-medium"
  | "mistral-small"
  | "codestral-latest";

export const mistralDefaultModelId: MistralModelId = "mistral-large-latest";

export const mistralModels: Record<MistralModelId, ModelInfo> = {
  "mistral-large-latest": {
    maxTokens: 8192,
    contextWindow: 128000,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Mistral Large Latest"
  },
  "mistral-medium": {
    maxTokens: 8192,
    contextWindow: 32000,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Mistral Medium"
  },
  "mistral-small": {
    maxTokens: 8192,
    contextWindow: 32000,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Mistral Small"
  },
  "codestral-latest": {
    maxTokens: 8192,
    contextWindow: 32000,
    supportsImages: false,
    supportsPromptCache: false,
    description: "Codestral Latest"
  }
};

// LiteLL/LiteLLM types  
export const litellmDefaultModelId = "gpt-3.5-turbo";

export const litellmDefaultModelInfo = {
  maxTokens: 4096,
  contextWindow: 16385,
  supportsImages: false,
  supportsPromptCache: false,
  description: "LiteLLM default model"
};

// LM Studio types
export const LMSTUDIO_DEFAULT_TEMPERATURE = 0.7;

export const openAiModelInfoSaneDefaults = {
  maxTokens: 4096,
  contextWindow: 8192,
  supportsImages: false,
  supportsPromptCache: false,
  description: "Default OpenAI-compatible model"
};

// Kilocode types
export const kilocodeDefaultModelId = "gpt-4";

// Note: getKiloBaseUriFromToken is exported from file-utils.ts

// OpenAI Native types
export const OPENAI_NATIVE_DEFAULT_TEMPERATURE = 0.7;

export type OpenAiNativeModelId = 
  | "gpt-4"
  | "gpt-4-turbo"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-3.5-turbo";

export const openAiNativeDefaultModelId: OpenAiNativeModelId = "gpt-4o";

export const openAiNativeModels: Record<OpenAiNativeModelId, ModelInfo> = {
  "gpt-4": {
    maxTokens: 8192,
    contextWindow: 8192,
    supportsImages: false,
    supportsPromptCache: false,
    description: "GPT-4"
  },
  "gpt-4-turbo": {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: true,
    supportsPromptCache: false,
    description: "GPT-4 Turbo"
  },
  "gpt-4o": {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsImages: true,
    supportsPromptCache: false,
    description: "GPT-4o"
  },
  "gpt-4o-mini": {
    maxTokens: 16384,
    contextWindow: 128000,
    supportsImages: true,
    supportsPromptCache: false,
    description: "GPT-4o Mini"
  },
  "gpt-3.5-turbo": {
    maxTokens: 4096,
    contextWindow: 16385,
    supportsImages: false,
    supportsPromptCache: false,
    description: "GPT-3.5 Turbo"
  }
};

// Azure OpenAI constants
export const azureOpenAiDefaultApiVersion = "2024-02-15-preview";
export const OPENAI_AZURE_AI_INFERENCE_PATH = "/v1/chat/completions";

// OpenRouter constants
export const openRouterDefaultModelId = "openai/gpt-4o";
export const openRouterDefaultModelInfo = {
  maxTokens: 4096,
  contextWindow: 128000,
  supportsImages: true,
  supportsPromptCache: false,
  description: "OpenRouter GPT-4o"
};
export const OPENROUTER_DEFAULT_PROVIDER_NAME = "OpenRouter";
export const OPEN_ROUTER_PROMPT_CACHING_MODELS = [
  "anthropic/claude-3-5-sonnet-20241022",
  "anthropic/claude-3-5-haiku-20241022"
];

// Requesty constants
export const requestyDefaultModelId = "claude-3-5-sonnet-20241022";
export const requestyDefaultModelInfo = {
  maxTokens: 8192,
  contextWindow: 200000,
  supportsImages: true,
  supportsPromptCache: true,
  description: "Requesty Claude 3.5 Sonnet"
};

// Unbound constants
export const unboundDefaultModelId = "gpt-4o";
export const unboundDefaultModelInfo = {
  maxTokens: 4096,
  contextWindow: 128000,
  supportsImages: true,
  supportsPromptCache: false,
  description: "Unbound GPT-4o"
};

// XAI types
export type XAIModelId = 
  | "grok-4"
  | "grok-3"
  | "grok-3-fast"
  | "grok-3-mini"
  | "grok-3-mini-fast"
  | "grok-2-1212"
  | "grok-2-vision-1212";

export const xaiDefaultModelId: XAIModelId = "grok-4";

export const xaiModels: Record<XAIModelId, ModelInfo> = {
  "grok-4": {
    maxTokens: 8192,
    contextWindow: 256000,
    supportsImages: true,
    supportsPromptCache: true,
    description: "xAI's Grok-4 model with 256K context window"
  },
  "grok-3": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: true,
    description: "xAI's Grok-3 model with 128K context window"
  },
  "grok-3-fast": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: true,
    description: "xAI's Grok-3 fast model with 128K context window"
  },
  "grok-3-mini": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: true,
    description: "xAI's Grok-3 mini model with 128K context window"
  },
  "grok-3-mini-fast": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: true,
    description: "xAI's Grok-3 mini fast model with 128K context window"
  },
  "grok-2-1212": {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsImages: false,
    supportsPromptCache: false,
    description: "xAI's Grok-2 model (version 1212) with 128K context window"
  },
  "grok-2-vision-1212": {
    maxTokens: 8192,
    contextWindow: 32768,
    supportsImages: true,
    supportsPromptCache: false,
    description: "xAI's Grok-2 Vision model (version 1212) with image support and 32K context window"
  }
};

// Gemini CLI types
export type GeminiCliModelId = "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest";
export const geminiCliDefaultModelId: GeminiCliModelId = "gemini-1.5-pro-latest";

export const geminiCliModels: Record<GeminiCliModelId, ModelInfo> = {
  "gemini-1.5-pro-latest": {
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 7.00,
    outputPricePerMillion: 21.00,
    description: "Gemini 1.5 Pro (Latest)"
  },
  "gemini-1.5-flash-latest": {
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.35,
    outputPricePerMillion: 1.40,
    description: "Gemini 1.5 Flash (Latest)"
  }
};

// Gemini types (regular)
export type GeminiModelId = "gemini-1.5-pro" | "gemini-1.5-flash";
export const geminiDefaultModelId: GeminiModelId = "gemini-1.5-pro";

export const geminiModels: Record<GeminiModelId, ModelInfo> = {
  "gemini-1.5-pro": {
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 7.00,
    outputPricePerMillion: 21.00,
    description: "Gemini 1.5 Pro"
  },
  "gemini-1.5-flash": {
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsImages: true,
    supportsTools: true,
    supportsPromptCache: false,
    supportsComputerUse: false,
    supportsReasoningBudget: false,
    inputPricePerMillion: 0.35,
    outputPricePerMillion: 1.40,
    description: "Gemini 1.5 Flash"
  }
};

// Other constants that might be needed
export const GEMINI_DEFAULT_TEMPERATURE = 0.7;
export const GEMINI_DEFAULT_MAX_TOKENS = 4096;
export const FIREWORKS_DEFAULT_TEMPERATURE = 0.7;
export const FIREWORKS_DEFAULT_MAX_TOKENS = 4096;
export const HUMAN_RELAY_DEFAULT_TEMPERATURE = 0.7;
export const VSCODE_LM_DEFAULT_TEMPERATURE = 0.7;
export const LITELLM_DEFAULT_TEMPERATURE = 0.7;
// GLAMA_DEFAULT_TEMPERATURE already defined above