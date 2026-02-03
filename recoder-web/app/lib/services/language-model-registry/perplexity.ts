import { z } from "zod";
import {
  type AnyLanguageModel,
  defineLanguageModel,
  definePricing,
  type LanguageModelProviderDefinition,
} from "./language-model";

const perplexityProvider = {
  id: "perplexity",
  title: "Perplexity",
  metadata: {
    website: "https://www.perplexity.ai",
    documentationUrl: "https://docs.perplexity.ai",
  },
} as const satisfies LanguageModelProviderDefinition<"perplexity">;

export const perplexity = {
  "perplexity/sonar-pro": defineLanguageModel({
    provider: perplexityProvider,
    id: "perplexity/sonar-pro",
    name: "Sonar Pro",
    description:
      "Perplexity's most advanced search model with real-time web access and advanced reasoning capabilities for complex research tasks.",
    contextWindow: 200_000,
    maxOutputTokens: 8_000,
    knowledgeCutoff: Date.now(), // Real-time web access
    pricing: {
      input: definePricing(3.0),
      output: definePricing(15.0),
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
      searchRecency: {
        description:
          "Filter search results by recency. 'day' for last 24 hours, 'week' for last 7 days, 'month' for last 30 days, 'year' for last 365 days.",
        schema: z.enum(["day", "week", "month", "year"]).optional(),
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      searchRecency: undefined,
    },
    url: "https://docs.perplexity.ai/models/sonar",
  }),

  "perplexity/sonar": defineLanguageModel({
    provider: perplexityProvider,
    id: "perplexity/sonar",
    name: "Sonar",
    description:
      "Perplexity's lightweight search model with real-time web access for quick research tasks and fact-checking.",
    contextWindow: 128_000,
    maxOutputTokens: 4_000,
    knowledgeCutoff: Date.now(), // Real-time web access
    pricing: {
      input: definePricing(1.0),
      output: definePricing(1.0),
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
      searchRecency: {
        description:
          "Filter search results by recency. 'day' for last 24 hours, 'week' for last 7 days, 'month' for last 30 days, 'year' for last 365 days.",
        schema: z.enum(["day", "week", "month", "year"]).optional(),
      },
    },
    defaultConfiguration: {
      temperature: 0.7,
      searchRecency: undefined,
    },
    url: "https://docs.perplexity.ai/models/sonar",
  }),

  "perplexity/sonar-reasoning-pro": defineLanguageModel({
    provider: perplexityProvider,
    id: "perplexity/sonar-reasoning-pro",
    name: "Sonar Reasoning Pro",
    description:
      "Perplexity's advanced reasoning model with extended thinking capabilities and real-time web search for complex analytical tasks.",
    contextWindow: 128_000,
    maxOutputTokens: 16_000,
    knowledgeCutoff: Date.now(), // Real-time web access
    pricing: {
      input: definePricing(2.0),
      output: definePricing(8.0),
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
    url: "https://docs.perplexity.ai/models/sonar-reasoning",
  }),

  "perplexity/sonar-reasoning": defineLanguageModel({
    provider: perplexityProvider,
    id: "perplexity/sonar-reasoning",
    name: "Sonar Reasoning",
    description:
      "Perplexity's reasoning model with extended thinking capabilities and real-time web search.",
    contextWindow: 128_000,
    maxOutputTokens: 8_000,
    knowledgeCutoff: Date.now(), // Real-time web access
    pricing: {
      input: definePricing(1.0),
      output: definePricing(5.0),
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
    url: "https://docs.perplexity.ai/models/sonar-reasoning",
  }),
} as const satisfies Record<string, AnyLanguageModel>;

export type PerplexityModelId = keyof typeof perplexity;
