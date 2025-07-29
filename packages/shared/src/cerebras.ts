/**
 * Cerebras AI model definitions
 */

export type CerebrasModelId = 
  | "llama3.1-8b"
  | "llama3.1-70b"
  | "llama3.3-70b"

export const cerebrasDefaultModelId: CerebrasModelId = "llama3.1-8b"

export const cerebrasModels = {
  "llama3.1-8b": {
    maxTokens: 8192,
    supportsImages: false,
    description: "Llama 3.1 8B",
    contextWindow: 8192,
    supportsPromptCache: false,
  },
  "llama3.1-70b": {
    maxTokens: 8192,
    supportsImages: false,
    description: "Llama 3.1 70B",
    contextWindow: 8192,
    supportsPromptCache: false,
  },
  "llama3.3-70b": {
    maxTokens: 8192,
    supportsImages: false,
    description: "Llama 3.3 70B",
    contextWindow: 8192,
    supportsPromptCache: false,
  },
} as const