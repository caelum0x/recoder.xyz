/**
 * Browser-safe model endpoint cache implementation
 * Uses only in-memory cache without file system operations
 */

import { RouterName, ModelRecord } from "../../../shared"
import { getOpenRouterModelEndpoints } from "./openrouter"

// Browser-safe memory cache using Map
const memoryCache = new Map<string, { data: ModelRecord; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Browser-safe cache key generator (without sanitize-filename dependency)
const getCacheKey = (router: RouterName, modelId: string) => 
  `${router}_${modelId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

// Browser-safe cache operations  
async function writeModelEndpoints(key: string, data: ModelRecord): Promise<void> {
  // Browser-safe: Store in memory only
  memoryCache.set(key, { data, timestamp: Date.now() });
}

async function readModelEndpoints(key: string): Promise<ModelRecord | undefined> {
  // Browser-safe: Read from memory cache only
  const cached = memoryCache.get(key);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  return undefined;
}

export const getModelEndpoints = async ({
  router,
  modelId,
  endpoint,
}: {
  router: RouterName;
  modelId?: string;
  endpoint?: string;
}): Promise<ModelRecord> => {
  // OpenRouter is the only provider that supports model endpoints
  if (router !== "openrouter" || !modelId || !endpoint) {
    return {};
  }

  const key = getCacheKey(router, modelId);
  const cached = memoryCache.get(key);
  
  // Check memory cache first
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const modelProviders = await getOpenRouterModelEndpoints(modelId);

    if (Object.keys(modelProviders).length > 0) {
      // Cache in memory
      memoryCache.set(key, { data: modelProviders, timestamp: Date.now() });
      return modelProviders;
    }

    // Try to get from existing cache if fetch failed
    const cachedData = await readModelEndpoints(key);
    return cachedData ?? {};
    
  } catch (error) {
    console.error(`[getModelEndpoints] Failed to fetch model endpoints for ${key}:`, error);
    
    // Try to get from existing cache as fallback
    const cachedData = await readModelEndpoints(key);
    return cachedData ?? {};
  }
};

export const flushModelProviders = async (router: RouterName, modelId: string): Promise<void> => {
  const key = getCacheKey(router, modelId);
  memoryCache.delete(key);
};