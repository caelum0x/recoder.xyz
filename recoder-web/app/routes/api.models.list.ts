/**
 * Model List API with Server-Side Redis Cache
 * Caches OpenRouter model list in Redis with 1-hour TTL
 * Falls back to direct API fetch if Redis is unavailable
 */

import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getCacheManager, CacheKeys, CacheTTL } from '~/lib/.server/cache/redis';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModelsList');

interface OpenRouterApiModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number };
  architecture?: { modality?: string };
}

interface CachedModel {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsVision: boolean;
  costPer1MInput?: number;
  costPer1MOutput?: number;
}

function mapModel(m: OpenRouterApiModel): CachedModel {
  const promptCost = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : undefined;
  const completionCost = m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : undefined;
  const modality = m.architecture?.modality || '';

  return {
    id: m.id,
    name: m.name || m.id,
    description: m.description,
    contextWindow: m.context_length,
    maxTokens: m.top_provider?.max_completion_tokens,
    supportsVision: modality.includes('image') || modality.includes('multimodal'),
    costPer1MInput: promptCost,
    costPer1MOutput: completionCost,
  };
}

export async function loader({ context }: LoaderFunctionArgs) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env as unknown as Env;
    const cacheManager = getCacheManager(env);

    // Try Redis cache first
    if (cacheManager) {
      const cached = await cacheManager.get<CachedModel[]>(CacheKeys.modelList());
      if (cached) {
        return json({ models: cached, cached: true });
      }
    }

    // Fetch from OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`OpenRouter API returned ${response.status}`);
    }

    const data = await response.json() as { data: OpenRouterApiModel[] };
    const models = (data.data || []).map(mapModel);

    // Store in Redis cache (1 hour TTL)
    if (cacheManager) {
      await cacheManager.set(CacheKeys.modelList(), models, CacheTTL.HOUR);
    }

    return json({ models, cached: false });
  } catch (error) {
    logger.error('Model list fetch error:', error);
    return json({ models: [], cached: false, error: 'Failed to fetch models' }, { status: 500 });
  }
}
