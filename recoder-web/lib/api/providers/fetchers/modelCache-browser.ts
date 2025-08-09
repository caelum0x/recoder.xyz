/**
 * Browser-safe model cache implementation
 * Uses only in-memory cache without file system operations
 */

import { RouterName, ModelRecord, cerebrasModels } from "../../../shared"
import { GetModelsOptions } from "../../../shared"

import { getOpenRouterModels } from "./openrouter"
import { getRequestyModels } from "./requesty"
import { getGlamaModels } from "./glama"
import { getUnboundModels } from "./unbound"
import { getLiteLLMModels } from "./litellm"
import { getOllamaModels } from "./ollama"
import { getLMStudioModels } from "./lmstudio"

// Browser-safe memory cache using Map
const memoryCache = new Map<string, { data: ModelRecord; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Browser-safe cache operations (stubs for compatibility)
export async function writeModels(router: RouterName, data: ModelRecord): Promise<void> {
  // Browser-safe: Store in memory only
  const cacheKey = `${router}_models`;
  memoryCache.set(cacheKey, { data, timestamp: Date.now() });
}

export async function readModels(router: RouterName): Promise<ModelRecord | undefined> {
  // Browser-safe: Read from memory cache only
  const cacheKey = `${router}_models`;
  const cached = memoryCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  return undefined;
}

/**
 * Get models from the cache or fetch them from the provider and cache them.
 * Browser-safe version using only in-memory cache.
 */
export const getModels = async (options: GetModelsOptions): Promise<ModelRecord> => {
  const provider = options.provider as RouterName

  // Provider is required for model fetching
  if (!provider) {
    throw new Error("Provider is required to fetch models")
  }

  const cacheKey = JSON.stringify(options);
  const cached = memoryCache.get(cacheKey);
  
  // Check memory cache first
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  let models: ModelRecord = {};

  try {
    switch (provider) {
      case "openrouter":
        models = await getOpenRouterModels({
          openRouterBaseUrl: options.baseUrl,
          headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined,
        });
        break;
      case "requesty":
        models = await getRequestyModels(options.apiKey);
        break;
      case "glama":
        models = await getGlamaModels();
        break;
      case "unbound":
        models = await getUnboundModels(options.apiKey);
        break;
      case "litellm":
        models = await getLiteLLMModels(options.apiKey || "", options.baseUrl || "");
        break;
      case "ollama":
        models = await getOllamaModels(options.baseUrl);
        break;
      case "lmstudio":
        models = await getLMStudioModels(options.baseUrl);
        break;
      default: {
        const exhaustiveCheck: never = provider;
        throw new Error(`Unknown provider: ${exhaustiveCheck}`);
      }
    }

    // Cache the fetched models in memory
    memoryCache.set(cacheKey, { data: models, timestamp: Date.now() });

    return models || {};
  } catch (error) {
    console.error(`[getModels] Failed to fetch models in modelCache for ${provider}:`, error);
    throw error;
  }
};

/**
 * Flush models memory cache for a specific router
 */
export const flushModels = async (router: RouterName): Promise<void> => {
  const cacheKey = `${router}_models`;
  memoryCache.delete(cacheKey);
};
