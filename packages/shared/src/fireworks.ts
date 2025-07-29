/**
 * Fireworks AI model definitions
 */

export type FireworksModelId = 
  | "accounts/fireworks/models/llama-v3p1-70b-instruct"
  | "accounts/fireworks/models/llama-v3p1-8b-instruct"
  | "accounts/fireworks/models/mixtral-8x7b-instruct"
  | "accounts/fireworks/models/mythomax-l2-13b"

export const fireworksDefaultModelId: FireworksModelId = "accounts/fireworks/models/llama-v3p1-8b-instruct"

export const fireworksModels = {
  "accounts/fireworks/models/llama-v3p1-70b-instruct": {
    maxTokens: 4096,
    supportsImages: false,
    description: "Llama 3.1 70B Instruct",
    contextWindow: 4096,
    supportsPromptCache: false,
    inputPrice: 0.9,
    outputPrice: 0.9,
  },
  "accounts/fireworks/models/llama-v3p1-8b-instruct": {
    maxTokens: 4096,
    supportsImages: false,
    description: "Llama 3.1 8B Instruct",
    contextWindow: 4096,
    supportsPromptCache: false,
    inputPrice: 0.2,
    outputPrice: 0.2,
  },
  "accounts/fireworks/models/mixtral-8x7b-instruct": {
    maxTokens: 4096,
    supportsImages: false,
    description: "Mixtral 8x7B Instruct",
    contextWindow: 4096,
    supportsPromptCache: false,
    inputPrice: 0.5,
    outputPrice: 0.5,
  },
  "accounts/fireworks/models/mythomax-l2-13b": {
    maxTokens: 4096,
    supportsImages: false,
    description: "MythoMax L2 13B",
    contextWindow: 4096,
    supportsPromptCache: false,
    inputPrice: 0.2,
    outputPrice: 0.2,
  },
} as const