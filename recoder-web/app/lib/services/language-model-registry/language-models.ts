import { anthropic } from "./anthropic";
import { fal } from "./fal";
import { google } from "./google";
import { openai } from "./openai";
import { openrouter } from "./openrouter";
import { perplexity } from "./perplexity";

export const languageModels = [
  ...Object.values(anthropic),
  ...Object.values(openai),
  ...Object.values(google),
  ...Object.values(perplexity),
  ...Object.values(fal),
  ...Object.values(openrouter),
];

export const languageModelIds = languageModels.map((model) => model.id);
export type LanguageModelId = (typeof languageModelIds)[number];

export function isLanguageModelId(id: unknown): id is LanguageModelId {
  return languageModelIds.includes(id as LanguageModelId);
}

export const languageModelProviderDefinitions = languageModels.map(
  (model) => model.provider,
);

export const languageModelProviders = Array.from(
  new Set(languageModelProviderDefinitions.map((provider) => provider.id)),
);

export function isLanguageModelProvider(
  provider: unknown,
): provider is LanguageModelProvider {
  return languageModelProviders.includes(provider as LanguageModelProvider);
}

export type LanguageModelProvider = (typeof languageModelProviders)[number];
export type LanguageModelProviderInfo =
  (typeof languageModelProviderDefinitions)[number];

export function getEntry(languageModelId: LanguageModelId) {
  const languageModel = languageModels.find(
    (model) => model.id === languageModelId,
  );

  if (!languageModel) {
    throw new Error(`Language model with ID ${languageModelId} not found`);
  }

  return languageModel;
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(providerId: LanguageModelProvider) {
  return languageModels.filter((model) => model.providerId === providerId);
}

/**
 * Get all free tier models
 */
export function getFreeTierModels() {
  return languageModels.filter((model) => model.requiredTier === "free");
}

/**
 * Get all pro tier models
 */
export function getProTierModels() {
  return languageModels.filter((model) => model.requiredTier === "pro");
}

/**
 * Get models sorted by price (cheapest first)
 */
export function getModelsByPrice(direction: "asc" | "desc" = "asc") {
  return [...languageModels].sort((a, b) => {
    const aPrice = a.pricing.input.perM + a.pricing.output.perM;
    const bPrice = b.pricing.input.perM + b.pricing.output.perM;
    return direction === "asc" ? aPrice - bPrice : bPrice - aPrice;
  });
}

/**
 * Get models sorted by context window size
 */
export function getModelsByContextWindow(direction: "asc" | "desc" = "desc") {
  return [...languageModels].sort((a, b) => {
    return direction === "asc"
      ? a.contextWindow - b.contextWindow
      : b.contextWindow - a.contextWindow;
  });
}

/**
 * Find a model by partial name match (case-insensitive)
 */
export function findModelsByName(searchTerm: string) {
  const term = searchTerm.toLowerCase();
  return languageModels.filter(
    (model) =>
      model.name.toLowerCase().includes(term) ||
      model.id.toLowerCase().includes(term),
  );
}
