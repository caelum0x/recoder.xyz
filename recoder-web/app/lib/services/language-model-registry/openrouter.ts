import { z } from "zod";
import {
  type AnyLanguageModel,
  defineLanguageModel,
  definePricing,
  type LanguageModelProviderDefinition,
} from "./language-model";

const openrouterProvider = {
  id: "openrouter",
  title: "OpenRouter",
  metadata: {
    website: "https://openrouter.ai",
    documentationUrl: "https://openrouter.ai/docs",
  },
} as const satisfies LanguageModelProviderDefinition<"openrouter">;

/**
 * OpenRouter models - provides unified access to multiple AI providers
 * Pricing may vary based on provider routing
 */
export const openrouter = {
  // Anthropic models via OpenRouter
  "openrouter/anthropic/claude-opus-4.5": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5 (OpenRouter)",
    description:
      "Anthropic's Claude Opus 4.5 accessed via OpenRouter for unified billing and fallback routing.",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    knowledgeCutoff: new Date(2025, 2, 31).getTime(),
    pricing: {
      input: definePricing(5.0),
      output: definePricing(25.0),
    },
    requiredTier: "pro",
    configurationOptions: {
      temperature: {
        description: "Amount of randomness injected into the response.",
        schema: z.number().min(0).max(1),
        ui: {
          min: 0.0,
          max: 1.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 1.0,
    },
    url: "https://openrouter.ai/models/anthropic/claude-opus-4.5",
  }),

  "openrouter/anthropic/claude-sonnet-4": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4 (OpenRouter)",
    description:
      "Anthropic's Claude Sonnet 4 accessed via OpenRouter for unified billing and fallback routing.",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    knowledgeCutoff: new Date(2025, 0, 31).getTime(),
    pricing: {
      input: definePricing(3.0),
      output: definePricing(15.0),
    },
    requiredTier: "pro",
    configurationOptions: {
      temperature: {
        description: "Amount of randomness injected into the response.",
        schema: z.number().min(0).max(1),
        ui: {
          min: 0.0,
          max: 1.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 1.0,
    },
    url: "https://openrouter.ai/models/anthropic/claude-sonnet-4",
  }),

  // OpenAI models via OpenRouter
  "openrouter/openai/gpt-4o": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/openai/gpt-4o",
    name: "GPT-4o (OpenRouter)",
    description:
      "OpenAI's GPT-4o accessed via OpenRouter for unified billing and fallback routing.",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    knowledgeCutoff: new Date(2024, 9, 1).getTime(),
    pricing: {
      input: definePricing(2.5),
      output: definePricing(10.0),
    },
    requiredTier: "pro",
    configurationOptions: {
      temperature: {
        description: "Controls randomness in the model's output.",
        schema: z.number().min(0).max(2),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 1.0,
    },
    url: "https://openrouter.ai/models/openai/gpt-4o",
  }),

  "openrouter/openai/o1": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/openai/o1",
    name: "o1 (OpenRouter)",
    description:
      "OpenAI's o1 reasoning model accessed via OpenRouter for unified billing and fallback routing.",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    knowledgeCutoff: new Date(2024, 9, 1).getTime(),
    pricing: {
      input: definePricing(15.0),
      output: definePricing(60.0),
    },
    requiredTier: "pro",
    configurationOptions: {
      reasoningEffort: {
        description:
          "Constrains effort on reasoning. Reducing reasoning effort can result in faster responses.",
        schema: z.enum(["low", "medium", "high"]),
      },
    },
    defaultConfiguration: {
      reasoningEffort: "medium",
    },
    url: "https://openrouter.ai/models/openai/o1",
  }),

  // Google models via OpenRouter
  "openrouter/google/gemini-2.5-pro": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro (OpenRouter)",
    description:
      "Google's Gemini 2.5 Pro accessed via OpenRouter for unified billing and fallback routing.",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    knowledgeCutoff: new Date(2025, 0, 31).getTime(),
    pricing: {
      input: definePricing(1.25),
      output: definePricing(10.0),
    },
    requiredTier: "pro",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 1.0,
    },
    url: "https://openrouter.ai/models/google/gemini-2.5-pro",
  }),

  "openrouter/google/gemini-2.0-flash": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash (OpenRouter)",
    description:
      "Google's Gemini 2.0 Flash accessed via OpenRouter for unified billing and fallback routing.",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 7, 1).getTime(),
    pricing: {
      input: definePricing(0.075),
      output: definePricing(0.3),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 1.0,
    },
    url: "https://openrouter.ai/models/google/gemini-2.0-flash",
  }),

  // Meta Llama models via OpenRouter
  "openrouter/meta-llama/llama-3.3-70b": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/meta-llama/llama-3.3-70b",
    name: "Llama 3.3 70B (OpenRouter)",
    description:
      "Meta's Llama 3.3 70B accessed via OpenRouter, excellent for general-purpose tasks.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 11, 1).getTime(),
    pricing: {
      input: definePricing(0.35),
      output: definePricing(0.4),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
    },
    url: "https://openrouter.ai/models/meta-llama/llama-3.3-70b",
  }),

  // Mistral models via OpenRouter
  "openrouter/mistralai/mistral-large": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/mistralai/mistral-large",
    name: "Mistral Large (OpenRouter)",
    description:
      "Mistral's flagship model accessed via OpenRouter, excellent for coding and reasoning.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 8, 1).getTime(),
    pricing: {
      input: definePricing(2.0),
      output: definePricing(6.0),
    },
    requiredTier: "pro",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
    },
    url: "https://openrouter.ai/models/mistralai/mistral-large",
  }),

  "openrouter/mistralai/codestral": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/mistralai/codestral",
    name: "Codestral (OpenRouter)",
    description:
      "Mistral's coding-specialized model accessed via OpenRouter, optimized for code generation.",
    contextWindow: 32_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 5, 1).getTime(),
    pricing: {
      input: definePricing(0.3),
      output: definePricing(0.9),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.3,
    },
    url: "https://openrouter.ai/models/mistralai/codestral",
  }),

  // DeepSeek models via OpenRouter
  "openrouter/deepseek/deepseek-chat": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/deepseek/deepseek-chat",
    name: "DeepSeek Chat (OpenRouter)",
    description:
      "DeepSeek's chat model accessed via OpenRouter, excellent balance of capability and cost.",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 6, 1).getTime(),
    pricing: {
      input: definePricing(0.14),
      output: definePricing(0.28),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
    },
    url: "https://openrouter.ai/models/deepseek/deepseek-chat",
  }),

  "openrouter/deepseek/deepseek-coder": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/deepseek/deepseek-coder",
    name: "DeepSeek Coder (OpenRouter)",
    description:
      "DeepSeek's coding-specialized model accessed via OpenRouter, optimized for code tasks.",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 6, 1).getTime(),
    pricing: {
      input: definePricing(0.14),
      output: definePricing(0.28),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.3,
    },
    url: "https://openrouter.ai/models/deepseek/deepseek-coder",
  }),

  // Qwen models via OpenRouter
  "openrouter/qwen/qwen-2.5-72b": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/qwen/qwen-2.5-72b",
    name: "Qwen 2.5 72B (OpenRouter)",
    description:
      "Alibaba's Qwen 2.5 72B accessed via OpenRouter, strong at coding and multilingual tasks.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 8, 1).getTime(),
    pricing: {
      input: definePricing(0.35),
      output: definePricing(0.4),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
    },
    url: "https://openrouter.ai/models/qwen/qwen-2.5-72b",
  }),

  "openrouter/qwen/qwen-2.5-coder-32b": defineLanguageModel({
    provider: openrouterProvider,
    id: "openrouter/qwen/qwen-2.5-coder-32b",
    name: "Qwen 2.5 Coder 32B (OpenRouter)",
    description:
      "Alibaba's Qwen 2.5 Coder 32B accessed via OpenRouter, specialized for code generation.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 8, 1).getTime(),
    pricing: {
      input: definePricing(0.18),
      output: definePricing(0.18),
    },
    requiredTier: "free",
    configurationOptions: {
      temperature: {
        description: "Controls the randomness of the output.",
        schema: z.number().min(0.0).max(2.0),
        ui: {
          min: 0.0,
          max: 2.0,
          step: 0.1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.3,
    },
    url: "https://openrouter.ai/models/qwen/qwen-2.5-coder-32b",
  }),
} as const satisfies Record<string, AnyLanguageModel>;

export type OpenRouterModelId = keyof typeof openrouter;
