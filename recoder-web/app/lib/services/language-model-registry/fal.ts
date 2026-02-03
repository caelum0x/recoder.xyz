import { z } from "zod";
import {
  type AnyLanguageModel,
  defineLanguageModel,
  definePricing,
  type LanguageModelProviderDefinition,
} from "./language-model";

const falProvider = {
  id: "fal",
  title: "FAL",
  metadata: {
    website: "https://fal.ai",
    documentationUrl: "https://fal.ai/docs",
  },
} as const satisfies LanguageModelProviderDefinition<"fal">;

/**
 * FAL models - primarily focused on image generation and multimodal AI
 * FAL provides fast inference for various AI models including LLMs
 */
export const fal = {
  "fal/llama-3.3-70b": defineLanguageModel({
    provider: falProvider,
    id: "fal/llama-3.3-70b",
    name: "Llama 3.3 70B",
    description:
      "Meta's Llama 3.3 70B model hosted on FAL's fast inference infrastructure, excellent for general-purpose tasks.",
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
      maxTokens: {
        description: "Maximum number of tokens to generate.",
        schema: z.number().min(1).max(8192),
        ui: {
          min: 1,
          max: 8192,
          step: 1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    url: "https://fal.ai/models/llama-3.3-70b",
  }),

  "fal/llama-3.2-90b-vision": defineLanguageModel({
    provider: falProvider,
    id: "fal/llama-3.2-90b-vision",
    name: "Llama 3.2 90B Vision",
    description:
      "Meta's Llama 3.2 90B vision model with image understanding capabilities, hosted on FAL.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 8, 1).getTime(),
    pricing: {
      input: definePricing(0.4),
      output: definePricing(0.4),
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
      maxTokens: {
        description: "Maximum number of tokens to generate.",
        schema: z.number().min(1).max(8192),
        ui: {
          min: 1,
          max: 8192,
          step: 1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    url: "https://fal.ai/models/llama-3.2-90b-vision",
  }),

  "fal/llama-3.1-8b": defineLanguageModel({
    provider: falProvider,
    id: "fal/llama-3.1-8b",
    name: "Llama 3.1 8B",
    description:
      "Meta's lightweight Llama 3.1 8B model for fast inference on simpler tasks.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 6, 1).getTime(),
    pricing: {
      input: definePricing(0.05),
      output: definePricing(0.08),
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
      maxTokens: {
        description: "Maximum number of tokens to generate.",
        schema: z.number().min(1).max(8192),
        ui: {
          min: 1,
          max: 8192,
          step: 1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    url: "https://fal.ai/models/llama-3.1-8b",
  }),

  "fal/mistral-large": defineLanguageModel({
    provider: falProvider,
    id: "fal/mistral-large",
    name: "Mistral Large",
    description:
      "Mistral's flagship model hosted on FAL, excellent for coding, reasoning, and multilingual tasks.",
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
      maxTokens: {
        description: "Maximum number of tokens to generate.",
        schema: z.number().min(1).max(8192),
        ui: {
          min: 1,
          max: 8192,
          step: 1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    url: "https://fal.ai/models/mistral-large",
  }),

  "fal/qwen-2.5-72b": defineLanguageModel({
    provider: falProvider,
    id: "fal/qwen-2.5-72b",
    name: "Qwen 2.5 72B",
    description:
      "Alibaba's Qwen 2.5 72B model hosted on FAL, strong at coding and multilingual tasks.",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    knowledgeCutoff: new Date(2024, 8, 1).getTime(),
    pricing: {
      input: definePricing(0.4),
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
      maxTokens: {
        description: "Maximum number of tokens to generate.",
        schema: z.number().min(1).max(8192),
        ui: {
          min: 1,
          max: 8192,
          step: 1,
        },
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    url: "https://fal.ai/models/qwen-2.5-72b",
  }),
} as const satisfies Record<string, AnyLanguageModel>;

export type FalModelId = keyof typeof fal;
