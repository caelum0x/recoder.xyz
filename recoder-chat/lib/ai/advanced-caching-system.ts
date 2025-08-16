/**
 * Advanced AI Model Caching & Optimization System
 * Implements intelligent caching, model warming, and performance optimization
 */

import { createHash } from 'crypto';
import { localAI } from './local-first-providers';

interface CacheEntry {
  response: string;
  model: string;
  provider: string;
  timestamp: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  metadata: {
    temperature: number;
    maxTokens: number;
    fingerprint: string;
  };
}

interface ModelPerformance {
  provider: string;
  model: string;
  avgResponseTime: number;
  successRate: number;
  costPerToken: number;
  lastUsed: number;
  totalUsage: number;
}

/**
 * Advanced AI Cache with Intelligence
 */
export class IntelligentAICache {
  private cache = new Map<string, CacheEntry>();
  private performance = new Map<string, ModelPerformance>();
  private readonly maxCacheSize = 1000;
  private readonly cacheExpiryMs = 1000 * 60 * 60 * 24; // 24 hours
  
  /**
   * Generate cache key with semantic hashing
   */
  private generateCacheKey(
    messages: any[],
    options: { temperature?: number; maxTokens?: number; model?: string }
  ): string {
    const content = messages.map(m => m.content).join('\n');
    const normalizedTemp = Math.round((options.temperature || 0.7) * 10) / 10;
    const tokens = options.maxTokens || 2000;
    const model = options.model || 'default';
    
    const input = `${content}|${normalizedTemp}|${tokens}|${model}`;
    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Semantic similarity check for fuzzy matching
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity (can be enhanced with embeddings)
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  /**
   * Find similar cached responses
   */
  private findSimilarCache(
    messages: any[],
    options: any,
    similarityThreshold = 0.8
  ): CacheEntry | null {
    const content = messages.map(m => m.content).join('\n');
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) continue;
      
      const similarity = this.calculateSimilarity(content, key);
      if (similarity >= similarityThreshold) {
        console.log(`🎯 Found similar cache entry (${(similarity * 100).toFixed(1)}% match)`);
        return entry;
      }
    }
    
    return null;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.cacheExpiryMs;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheExpiryMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cached response with intelligence
   */
  async getCached(
    messages: any[],
    options: { temperature?: number; maxTokens?: number; model?: string }
  ): Promise<CacheEntry | null> {
    this.cleanup();
    
    const cacheKey = this.generateCacheKey(messages, options);
    const exactMatch = this.cache.get(cacheKey);
    
    if (exactMatch && !this.isExpired(exactMatch)) {
      console.log('🎯 Cache HIT (exact match)');
      return exactMatch;
    }
    
    // Try fuzzy matching for similar requests
    const similarMatch = this.findSimilarCache(messages, options);
    if (similarMatch) {
      console.log('🎯 Cache HIT (similar match)');
      return similarMatch;
    }
    
    console.log('💾 Cache MISS');
    return null;
  }

  /**
   * Store response in cache
   */
  async setCached(
    messages: any[],
    options: any,
    response: any
  ): Promise<void> {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entries
      const oldestKey = Array.from(this.cache.entries())
        .sort(([,a], [,b]) => a.timestamp - b.timestamp)[0]?.[0];
      if (oldestKey) this.cache.delete(oldestKey);
    }
    
    const cacheKey = this.generateCacheKey(messages, options);
    const entry: CacheEntry = {
      response: response.content,
      model: response.model || 'unknown',
      provider: response.provider || 'unknown',
      timestamp: Date.now(),
      usage: {
        inputTokens: 0,
        outputTokens: response.content.split(' ').length,
        totalTokens: response.content.split(' ').length
      },
      metadata: {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2000,
        fingerprint: cacheKey
      }
    };
    
    this.cache.set(cacheKey, entry);
    console.log(`💾 Cached response for key: ${cacheKey}`);
  }

  /**
   * Update model performance metrics
   */
  updatePerformance(
    provider: string,
    model: string,
    responseTime: number,
    success: boolean,
    tokens: number
  ): void {
    const key = `${provider}:${model}`;
    const existing = this.performance.get(key);
    
    if (existing) {
      existing.avgResponseTime = (existing.avgResponseTime + responseTime) / 2;
      existing.successRate = (existing.successRate + (success ? 1 : 0)) / 2;
      existing.totalUsage += tokens;
      existing.lastUsed = Date.now();
    } else {
      this.performance.set(key, {
        provider,
        model,
        avgResponseTime: responseTime,
        successRate: success ? 1 : 0,
        costPerToken: this.estimateCost(provider),
        lastUsed: Date.now(),
        totalUsage: tokens
      });
    }
  }

  /**
   * Estimate cost per token for different providers
   */
  private estimateCost(provider: string): number {
    const costs = {
      'ollama': 0,           // Free local
      'lm-studio': 0,        // Free local
      'together-ai': 0.0002, // ~$0.2 per 1M tokens
      'anthropic': 0.003,    // ~$3 per 1M tokens
      'openai': 0.002,       // ~$2 per 1M tokens
      'groq': 0.0001         // ~$0.1 per 1M tokens
    };
    return costs[provider] || 0.001;
  }

  /**
   * Get best performing model recommendation
   */
  getBestModel(): ModelPerformance | null {
    if (this.performance.size === 0) return null;
    
    const models = Array.from(this.performance.values());
    
    // Score based on: speed, success rate, cost (lower is better)
    const scored = models.map(model => ({
      ...model,
      score: (
        (1 / model.avgResponseTime) * 0.4 +  // Speed (40%)
        model.successRate * 0.4 +             // Reliability (40%)
        (1 / (model.costPerToken + 0.0001)) * 0.2  // Cost efficiency (20%)
      )
    }));
    
    return scored.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.cache.size;
    const expired = Array.from(this.cache.values())
      .filter(entry => this.isExpired(entry)).length;
    
    return {
      total,
      active: total - expired,
      expired,
      hitRate: 0, // Would need to track hits/misses
      modelPerformance: Array.from(this.performance.values())
    };
  }

  /**
   * Warm up models for better performance
   */
  async warmupModels(): Promise<void> {
    console.log('🔥 Warming up AI models...');
    
    const warmupPrompts = [
      { role: 'user', content: 'Hello, test warmup prompt' },
      { role: 'user', content: 'Generate a simple function' },
      { role: 'user', content: 'Explain this code snippet' }
    ];
    
    try {
      // Warm up local models first
      for (const prompt of warmupPrompts) {
        await localAI.smartGenerate([prompt], { maxTokens: 50 });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log('✅ Model warmup completed');
    } catch (error) {
      console.log('⚠️ Model warmup partially completed:', error.message);
    }
  }
}

// Singleton instance
export const aiCache = new IntelligentAICache();

// Auto-warmup on import (non-blocking)
setTimeout(() => {
  aiCache.warmupModels().catch(console.warn);
}, 1000);

export default aiCache;