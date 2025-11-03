import type { CoreMessage } from 'ai';

export interface CacheConfig {
  systemPromptTTL: number; // 1 hour cache for system prompts
  templateDataTTL: number; // 5 minute cache for template data
  conversationTTL: number; // 5 minute cache for conversation context
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  systemPromptTTL: 3600, // 1 hour in seconds
  templateDataTTL: 300,   // 5 minutes in seconds
  conversationTTL: 300,   // 5 minutes in seconds
};

export interface CacheableContent {
  content: string;
  type: 'system' | 'template' | 'conversation';
  hash: string;
  timestamp: number;
  ttl: number;
}

export class PromptCacheManager {
  private cache = new Map<string, CacheableContent>();
  private config: CacheConfig;

  constructor(config: CacheConfig = DEFAULT_CACHE_CONFIG) {
    this.config = config;
  }

  /**
   * Create a cacheable message with proper cache control headers
   */
  createCacheableMessage(
    content: string,
    type: 'system' | 'template' | 'conversation',
    role: 'system' | 'user' | 'assistant' = 'system'
  ): CoreMessage & { experimental_providerMetadata?: any } {
    const hash = this.generateHash(content);
    const now = Date.now();

    let ttl: number;
    switch (type) {
      case 'system':
        ttl = this.config.systemPromptTTL;
        break;
      case 'template':
        ttl = this.config.templateDataTTL;
        break;
      case 'conversation':
        ttl = this.config.conversationTTL;
        break;
    }

    // Store in local cache
    this.cache.set(hash, {
      content,
      type,
      hash,
      timestamp: now,
      ttl: ttl * 1000 // Convert to milliseconds
    });

    // Return message with Anthropic cache control
    return {
      role,
      content,
      experimental_providerMetadata: {
        anthropic: {
          cacheControl: {
            type: 'ephemeral',
            // Use appropriate TTL based on content type
            ttl: ttl
          }
        }
      }
    };
  }

  /**
   * Check if content is cached and still valid
   */
  isCached(content: string): boolean {
    const hash = this.generateHash(content);
    const cached = this.cache.get(hash);

    if (!cached) return false;

    const now = Date.now();
    const isExpired = (now - cached.timestamp) > cached.ttl;

    if (isExpired) {
      this.cache.delete(hash);
      return false;
    }

    return true;
  }

  /**
   * Get cached content
   */
  getCached(content: string): CacheableContent | null {
    const hash = this.generateHash(content);
    return this.cache.get(hash) || null;
  }

  /**
   * Clear expired cache entries
   */
  cleanupExpiredEntries(): void {
    const now = Date.now();

    for (const [hash, cached] of this.cache.entries()) {
      const isExpired = (now - cached.timestamp) > cached.ttl;
      if (isExpired) {
        this.cache.delete(hash);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const stats = {
      totalEntries: this.cache.size,
      systemPrompts: 0,
      templateData: 0,
      conversations: 0,
      estimatedSavings: 0
    };

    for (const cached of this.cache.values()) {
      switch (cached.type) {
        case 'system':
          stats.systemPrompts++;
          break;
        case 'template':
          stats.templateData++;
          break;
        case 'conversation':
          stats.conversations++;
          break;
      }

      // Estimate token savings (assuming ~4 chars per token)
      const estimatedTokens = cached.content.length / 4;
      // Cache hit saves 90% of cost ($3 -> $0.30 per MTok)
      stats.estimatedSavings += estimatedTokens * 0.0027; // $2.70 per MTok savings
    }

    return stats;
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Generate a hash for cache key
   */
  private generateHash(content: string): string {
    // Simple hash function - in production you might want crypto.createHash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Global cache instance
export const promptCache = new PromptCacheManager();

// Cleanup expired entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    promptCache.cleanupExpiredEntries();
  }, 10 * 60 * 1000);
}