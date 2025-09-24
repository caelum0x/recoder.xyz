/**
 * Prompt Caching Service for 90% Cost Reduction
 * Intelligent caching system for repeated AI patterns and responses
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

interface CacheEntry {
  id: string;
  promptHash: string;
  prompt: string;
  response: any;
  model: string;
  provider: string;
  parameters: any;
  hitCount: number;
  cost: number;
  tokens: number;
  quality: number; // Quality score 0-1
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt?: Date;
  tags: string[];
  context: any;
}

interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  costSavings: number;
  tokensSaved: number;
  averageResponseTime: number;
}

interface PromptPattern {
  id: string;
  pattern: string;
  frequency: number;
  avgCost: number;
  avgTokens: number;
  variations: string[];
  template: string;
}

export class PromptCacheService extends EventEmitter {
  private static instance: PromptCacheService;
  private redis: Redis;
  private cacheStats: CacheMetrics;
  private patternAnalyzer: Map<string, PromptPattern> = new Map();
  
  // Cache configuration
  private readonly DEFAULT_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly MAX_CACHE_SIZE = 10000; // Maximum cached entries
  private readonly SIMILARITY_THRESHOLD = 0.85; // Similarity threshold for cache hits
  private readonly QUALITY_THRESHOLD = 0.7; // Minimum quality for caching
  private readonly PATTERN_MIN_FREQUENCY = 3; // Minimum frequency to identify patterns

  constructor(redisClient?: Redis) {
    super();
    this.redis = redisClient || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.cacheStats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      costSavings: 0,
      tokensSaved: 0,
      averageResponseTime: 0
    };
    
    this.initializeCache();
  }

  public static getInstance(redisClient?: Redis): PromptCacheService {
    if (!PromptCacheService.instance) {
      PromptCacheService.instance = new PromptCacheService(redisClient);
    }
    return PromptCacheService.instance;
  }

  /**
   * Initialize cache system
   */
  private async initializeCache(): Promise<void> {
    try {
      // Load existing cache statistics
      await this.loadCacheStats();
      
      // Load common patterns from database
      await this.loadCommonPatterns();
      
      // Start pattern analysis background job
      this.startPatternAnalysis();
      
      logger.info('Prompt cache initialized', {
        maxSize: this.MAX_CACHE_SIZE,
        ttl: this.DEFAULT_TTL,
        similarityThreshold: this.SIMILARITY_THRESHOLD
      });
    } catch (error) {
      logger.error('Failed to initialize prompt cache:', error);
    }
  }

  /**
   * Get cached response for a prompt
   */
  async get(
    prompt: string,
    model: string,
    provider: string,
    parameters: any = {},
    context: any = {}
  ): Promise<CacheEntry | null> {
    const startTime = Date.now();
    
    try {
      this.cacheStats.totalRequests++;
      
      // Generate cache key
      const cacheKey = this.generateCacheKey(prompt, model, provider, parameters);
      
      // Check Redis cache first (fastest)
      const redisResult = await this.getFromRedis(cacheKey);
      if (redisResult) {
        await this.updateHitStats(redisResult, startTime);
        this.cacheStats.cacheHits++;
        return redisResult;
      }
      
      // Check database cache with similarity search
      const dbResult = await this.getFromDatabase(prompt, model, provider, parameters);
      if (dbResult) {
        // Store in Redis for faster future access
        await this.storeInRedis(cacheKey, dbResult);
        await this.updateHitStats(dbResult, startTime);
        this.cacheStats.cacheHits++;
        return dbResult;
      }
      
      // Check for similar prompts using pattern matching
      const similarResult = await this.findSimilarCachedPrompt(prompt, model, provider);
      if (similarResult) {
        await this.updateHitStats(similarResult, startTime);
        this.cacheStats.cacheHits++;
        return similarResult;
      }
      
      this.cacheStats.cacheMisses++;
      return null;
      
    } catch (error) {
      logger.error('Cache get error:', error);
      this.cacheStats.cacheMisses++;
      return null;
    } finally {
      this.updateCacheMetrics();
    }
  }

  /**
   * Store response in cache
   */
  async set(
    prompt: string,
    response: any,
    model: string,
    provider: string,
    parameters: any = {},
    cost: number = 0,
    tokens: number = 0,
    quality: number = 1,
    ttl?: number,
    tags: string[] = [],
    context: any = {}
  ): Promise<void> {
    try {
      // Skip caching if quality is too low
      if (quality < this.QUALITY_THRESHOLD) {
        logger.debug('Skipping cache due to low quality', { quality, threshold: this.QUALITY_THRESHOLD });
        return;
      }
      
      // Generate cache key and hash
      const cacheKey = this.generateCacheKey(prompt, model, provider, parameters);
      const promptHash = this.generatePromptHash(prompt);
      
      const cacheEntry: CacheEntry = {
        id: cacheKey,
        promptHash,
        prompt: prompt.length > 1000 ? prompt.substring(0, 1000) + '...' : prompt, // Truncate for storage
        response,
        model,
        provider,
        parameters,
        hitCount: 0,
        cost,
        tokens,
        quality,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: ttl ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + this.DEFAULT_TTL * 1000),
        tags,
        context
      };
      
      // Store in Redis
      await this.storeInRedis(cacheKey, cacheEntry, ttl);
      
      // Store in database for persistence and similarity search
      await this.storeInDatabase(cacheEntry);
      
      // Update pattern analysis
      await this.updatePatternAnalysis(prompt, cost, tokens);
      
      logger.debug('Cached prompt response', {
        promptLength: prompt.length,
        model,
        provider,
        cost,
        tokens,
        quality
      });
      
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Generate cache key from prompt and parameters
   */
  private generateCacheKey(prompt: string, model: string, provider: string, parameters: any): string {
    const normalizedPrompt = this.normalizePrompt(prompt);
    const paramStr = JSON.stringify(this.normalizeParameters(parameters));
    const keyString = `${provider}:${model}:${normalizedPrompt}:${paramStr}`;
    return this.generateHash(keyString);
  }

  /**
   * Generate hash for prompt content
   */
  private generatePromptHash(prompt: string): string {
    return this.generateHash(this.normalizePrompt(prompt));
  }

  /**
   * Generate SHA-256 hash
   */
  private generateHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Normalize prompt for consistent caching
   */
  private normalizePrompt(prompt: string): string {
    return prompt
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s]/g, '') // Remove special characters for similarity matching
      .substring(0, 2000); // Limit length
  }

  /**
   * Normalize parameters for consistent caching
   */
  private normalizeParameters(parameters: any): any {
    // Remove non-deterministic parameters
    const { timestamp, requestId, userId, ...deterministicParams } = parameters;
    
    // Sort keys for consistent stringification
    const sorted = Object.keys(deterministicParams)
      .sort()
      .reduce((result, key) => {
        result[key] = deterministicParams[key];
        return result;
      }, {} as any);
    
    return sorted;
  }

  /**
   * Get entry from Redis cache
   */
  private async getFromRedis(cacheKey: string): Promise<CacheEntry | null> {
    try {
      const cached = await this.redis.get(`prompt_cache:${cacheKey}`);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry;
        
        // Check if expired
        if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) {
          await this.redis.del(`prompt_cache:${cacheKey}`);
          return null;
        }
        
        return entry;
      }
      return null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  }

  /**
   * Store entry in Redis cache
   */
  private async storeInRedis(cacheKey: string, entry: CacheEntry, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(entry);
      const cacheTTL = ttl || this.DEFAULT_TTL;
      
      await this.redis.setex(`prompt_cache:${cacheKey}`, cacheTTL, serialized);
    } catch (error) {
      logger.error('Redis set error:', error);
    }
  }

  /**
   * Get entry from database
   */
  private async getFromDatabase(
    prompt: string,
    model: string,
    provider: string,
    parameters: any
  ): Promise<CacheEntry | null> {
    try {
      const promptHash = this.generatePromptHash(prompt);
      
      const cached = await prisma.promptCache.findFirst({
        where: {
          promptHash,
          model,
          provider,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: {
          lastUsedAt: 'desc'
        }
      });
      
      if (cached) {
        // Convert database record to CacheEntry
        const entry: CacheEntry = {
          id: cached.id,
          promptHash: cached.promptHash,
          prompt: cached.prompt,
          response: cached.response as any,
          model: cached.model,
          provider: cached.provider,
          parameters: cached.parameters as any,
          hitCount: cached.hitCount,
          cost: cached.cost,
          tokens: cached.tokens,
          quality: cached.quality,
          createdAt: cached.createdAt,
          lastUsedAt: cached.lastUsedAt,
          expiresAt: cached.expiresAt,
          tags: cached.tags,
          context: cached.context as any
        };
        
        return entry;
      }
      
      return null;
    } catch (error) {
      logger.error('Database get error:', error);
      return null;
    }
  }

  /**
   * Store entry in database
   */
  private async storeInDatabase(entry: CacheEntry): Promise<void> {
    try {
      await prisma.promptCache.upsert({
        where: {
          id: entry.id
        },
        update: {
          hitCount: { increment: 1 },
          lastUsedAt: new Date()
        },
        create: {
          id: entry.id,
          promptHash: entry.promptHash,
          prompt: entry.prompt,
          response: entry.response,
          model: entry.model,
          provider: entry.provider,
          parameters: entry.parameters,
          hitCount: entry.hitCount,
          cost: entry.cost,
          tokens: entry.tokens,
          quality: entry.quality,
          createdAt: entry.createdAt,
          lastUsedAt: entry.lastUsedAt,
          expiresAt: entry.expiresAt,
          tags: entry.tags,
          context: entry.context
        }
      });
    } catch (error) {
      logger.error('Database set error:', error);
    }
  }

  /**
   * Find similar cached prompt using text similarity
   */
  private async findSimilarCachedPrompt(
    prompt: string,
    model: string,
    provider: string
  ): Promise<CacheEntry | null> {
    try {
      // Get recent cached prompts for the same model/provider
      const recentCache = await prisma.promptCache.findMany({
        where: {
          model,
          provider,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: {
          hitCount: 'desc'
        },
        take: 50 // Check top 50 most used entries
      });
      
      const normalizedPrompt = this.normalizePrompt(prompt);
      
      for (const cached of recentCache) {
        const cachedPromptNormalized = this.normalizePrompt(cached.prompt);
        const similarity = this.calculateTextSimilarity(normalizedPrompt, cachedPromptNormalized);
        
        if (similarity >= this.SIMILARITY_THRESHOLD) {
          logger.debug('Found similar cached prompt', {
            similarity,
            originalLength: prompt.length,
            cachedLength: cached.prompt.length
          });
          
          // Convert to CacheEntry
          return {
            id: cached.id,
            promptHash: cached.promptHash,
            prompt: cached.prompt,
            response: cached.response as any,
            model: cached.model,
            provider: cached.provider,
            parameters: cached.parameters as any,
            hitCount: cached.hitCount,
            cost: cached.cost,
            tokens: cached.tokens,
            quality: cached.quality,
            createdAt: cached.createdAt,
            lastUsedAt: cached.lastUsedAt,
            expiresAt: cached.expiresAt,
            tags: cached.tags,
            context: cached.context as any
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Similarity search error:', error);
      return null;
    }
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Update hit statistics
   */
  private async updateHitStats(entry: CacheEntry, startTime: number): Promise<void> {
    const responseTime = Date.now() - startTime;
    
    // Update database hit count
    try {
      await prisma.promptCache.update({
        where: { id: entry.id },
        data: {
          hitCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to update hit stats:', error);
    }
    
    // Update cache statistics
    this.cacheStats.costSavings += entry.cost;
    this.cacheStats.tokensSaved += entry.tokens;
    this.cacheStats.averageResponseTime = 
      (this.cacheStats.averageResponseTime + responseTime) / 2;
  }

  /**
   * Update cache metrics
   */
  private updateCacheMetrics(): void {
    const totalRequests = this.cacheStats.cacheHits + this.cacheStats.cacheMisses;
    this.cacheStats.hitRate = totalRequests > 0 ? this.cacheStats.cacheHits / totalRequests : 0;
  }

  /**
   * Load cache statistics from database
   */
  private async loadCacheStats(): Promise<void> {
    try {
      const stats = await prisma.promptCache.aggregate({
        _count: { id: true },
        _sum: { hitCount: true, cost: true, tokens: true }
      });
      
      this.cacheStats.cacheHits = stats._sum.hitCount || 0;
      this.cacheStats.costSavings = stats._sum.cost || 0;
      this.cacheStats.tokensSaved = stats._sum.tokens || 0;
    } catch (error) {
      logger.error('Failed to load cache stats:', error);
    }
  }

  /**
   * Load common patterns from database
   */
  private async loadCommonPatterns(): Promise<void> {
    try {
      // Find most frequently used prompts
      const commonPrompts = await prisma.promptCache.findMany({
        where: {
          hitCount: {
            gte: this.PATTERN_MIN_FREQUENCY
          }
        },
        orderBy: {
          hitCount: 'desc'
        },
        take: 100
      });
      
      for (const cached of commonPrompts) {
        const pattern = this.extractPattern(cached.prompt);
        this.patternAnalyzer.set(pattern, {
          id: pattern,
          pattern,
          frequency: cached.hitCount,
          avgCost: cached.cost,
          avgTokens: cached.tokens,
          variations: [cached.prompt],
          template: this.generateTemplate(cached.prompt)
        });
      }
      
      logger.info(`Loaded ${this.patternAnalyzer.size} common patterns`);
    } catch (error) {
      logger.error('Failed to load patterns:', error);
    }
  }

  /**
   * Extract pattern from prompt
   */
  private extractPattern(prompt: string): string {
    // Simple pattern extraction - can be enhanced with ML
    return prompt
      .replace(/\b\d+\b/g, '[NUMBER]')
      .replace(/\b[A-Z][a-z]+\b/g, '[WORD]')
      .replace(/["'].*?["']/g, '[STRING]')
      .substring(0, 100);
  }

  /**
   * Generate template from prompt
   */
  private generateTemplate(prompt: string): string {
    return prompt
      .replace(/\b\d+\b/g, '{{number}}')
      .replace(/\b[A-Z][a-z]+\b/g, '{{word}}')
      .replace(/["'].*?["']/g, '{{string}}');
  }

  /**
   * Update pattern analysis
   */
  private async updatePatternAnalysis(prompt: string, cost: number, tokens: number): Promise<void> {
    const pattern = this.extractPattern(prompt);
    
    if (this.patternAnalyzer.has(pattern)) {
      const existing = this.patternAnalyzer.get(pattern)!;
      existing.frequency++;
      existing.avgCost = (existing.avgCost + cost) / 2;
      existing.avgTokens = (existing.avgTokens + tokens) / 2;
      existing.variations.push(prompt);
    } else {
      this.patternAnalyzer.set(pattern, {
        id: pattern,
        pattern,
        frequency: 1,
        avgCost: cost,
        avgTokens: tokens,
        variations: [prompt],
        template: this.generateTemplate(prompt)
      });
    }
  }

  /**
   * Start pattern analysis background job
   */
  private startPatternAnalysis(): void {
    setInterval(async () => {
      try {
        await this.analyzePatterns();
      } catch (error) {
        logger.error('Pattern analysis error:', error);
      }
    }, 60000); // Run every minute
  }

  /**
   * Analyze patterns for optimization opportunities
   */
  private async analyzePatterns(): Promise<void> {
    const highFrequencyPatterns = Array.from(this.patternAnalyzer.values())
      .filter(pattern => pattern.frequency >= this.PATTERN_MIN_FREQUENCY)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
    
    if (highFrequencyPatterns.length > 0) {
      this.emit('patternsIdentified', {
        patterns: highFrequencyPatterns,
        totalSavingsOpportunity: highFrequencyPatterns.reduce(
          (sum, pattern) => sum + (pattern.avgCost * pattern.frequency), 0
        )
      });
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpired(): Promise<number> {
    try {
      const deleted = await prisma.promptCache.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      
      logger.info(`Cleared ${deleted.count} expired cache entries`);
      return deleted.count;
    } catch (error) {
      logger.error('Failed to clear expired cache:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheMetrics {
    return { ...this.cacheStats };
  }

  /**
   * Get identified patterns
   */
  getPatterns(): PromptPattern[] {
    return Array.from(this.patternAnalyzer.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const deleted = await prisma.promptCache.deleteMany({
        where: {
          prompt: {
            contains: pattern
          }
        }
      });
      
      // Also clear from Redis
      const keys = await this.redis.keys(`prompt_cache:*`);
      for (const key of keys) {
        const entry = await this.redis.get(key);
        if (entry && JSON.parse(entry).prompt.includes(pattern)) {
          await this.redis.del(key);
        }
      }
      
      logger.info(`Invalidated ${deleted.count} cache entries matching pattern: ${pattern}`);
      return deleted.count;
    } catch (error) {
      logger.error('Failed to invalidate cache by pattern:', error);
      return 0;
    }
  }

  /**
   * Get cache size and cleanup if needed
   */
  async maintainCache(): Promise<void> {
    try {
      const count = await prisma.promptCache.count();
      
      if (count > this.MAX_CACHE_SIZE) {
        // Remove least recently used entries
        const toDelete = count - this.MAX_CACHE_SIZE;
        
        const oldEntries = await prisma.promptCache.findMany({
          orderBy: {
            lastUsedAt: 'asc'
          },
          take: toDelete,
          select: { id: true }
        });
        
        const idsToDelete = oldEntries.map(entry => entry.id);
        
        await prisma.promptCache.deleteMany({
          where: {
            id: {
              in: idsToDelete
            }
          }
        });
        
        logger.info(`Cache maintenance: removed ${toDelete} LRU entries`);
      }
    } catch (error) {
      logger.error('Cache maintenance error:', error);
    }
  }
}

// Export singleton instance
export const promptCache = PromptCacheService.getInstance();