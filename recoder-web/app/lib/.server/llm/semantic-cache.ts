import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SemanticCache');
/**
 * Semantic Similarity Caching System
 * Caches responses based on semantic similarity rather than exact matches
 * Provides intelligent cache hits for similar requests
 */

export interface SemanticCacheEntry {
  id: string;
  originalQuery: string;
  normalizedQuery: string;
  embedding: number[];
  response: any;
  metadata: {
    strategy: string;
    framework?: string;
    tokens: number;
    quality: number;
    created: number;
    lastAccessed: number;
    accessCount: number;
  };
}

export interface SimilarityMatch {
  entry: SemanticCacheEntry;
  similarity: number;
  confidence: number;
}

export interface SemanticCacheConfig {
  enabled: boolean;
  similarityThreshold: number; // 0-1, minimum similarity for cache hit
  maxEntries: number;
  embeddingDimensions: number;
  ttl: number; // time to live in milliseconds
  confidenceThreshold: number; // minimum confidence for using cached response
  semanticAnalysis: boolean;
  keywordWeighting: boolean;
}

class SemanticCacheManager {
  private cache: Map<string, SemanticCacheEntry> = new Map();
  private config: SemanticCacheConfig;
  private stopWords: Set<string>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<SemanticCacheConfig>) {
    this.config = {
      enabled: true,
      similarityThreshold: 0.8,
      maxEntries: 1000,
      embeddingDimensions: 384, // Typical for sentence transformers
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      confidenceThreshold: 0.75,
      semanticAnalysis: true,
      keywordWeighting: true,
      ...config
    };

    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'between', 'among', 'this', 'that', 'these', 'those', 'i',
      'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
      'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
      'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves'
    ]);

    // Note: Cleanup interval is NOT started in constructor to avoid Cloudflare Workers
    // "Disallowed operation in global scope" error. Call startCleanup() manually if needed.
  }

  /**
   * Start periodic cleanup (call this from a request handler, not at module level)
   */
  startCleanup(): void {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60 * 60 * 1000); // Every hour
    }
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Check if there's a semantically similar cached response
   */
  async findSimilar(
    query: string,
    strategy: string,
    framework?: string
  ): Promise<SimilarityMatch | null> {
    if (!this.config.enabled || this.cache.size === 0) {
      return null;
    }

    // Opportunistically clean up expired entries (serverless-friendly)
    this.cleanupExpiredSync();

    const normalizedQuery = this.normalizeQuery(query);
    const queryEmbedding = await this.generateEmbedding(normalizedQuery);

    let bestMatch: SimilarityMatch | null = null;
    let highestSimilarity = 0;

    for (const entry of this.cache.values()) {
      // Skip if different strategy/framework (unless very high similarity)
      if (entry.metadata.strategy !== strategy && entry.metadata.framework !== framework) {
        continue;
      }

      const similarity = this.calculateSimilarity(queryEmbedding, entry.embedding);

      if (similarity > this.config.similarityThreshold && similarity > highestSimilarity) {
        const confidence = this.calculateConfidence(
          similarity,
          entry.metadata.accessCount,
          entry.metadata.quality
        );

        if (confidence >= this.config.confidenceThreshold) {
          bestMatch = {
            entry,
            similarity,
            confidence
          };
          highestSimilarity = similarity;
        }
      }
    }

    if (bestMatch) {
      // Update access metadata
      bestMatch.entry.metadata.lastAccessed = Date.now();
      bestMatch.entry.metadata.accessCount++;
    }

    return bestMatch;
  }

  /**
   * Store a response in the semantic cache
   */
  async store(
    query: string,
    response: any,
    metadata: {
      strategy: string;
      framework?: string;
      tokens: number;
      quality: number;
    }
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Check cache size limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const normalizedQuery = this.normalizeQuery(query);
    const embedding = await this.generateEmbedding(normalizedQuery);
    const id = this.generateId(normalizedQuery);

    const entry: SemanticCacheEntry = {
      id,
      originalQuery: query,
      normalizedQuery,
      embedding,
      response,
      metadata: {
        ...metadata,
        created: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0
      }
    };

    this.cache.set(id, entry);
  }

  /**
   * Normalize query for better semantic matching
   */
  private normalizeQuery(query: string): string {
    // Convert to lowercase
    let normalized = query.toLowerCase();

    // Remove special characters except spaces
    normalized = normalized.replace(/[^\w\s]/g, ' ');

    // Split into words and filter stop words
    const words = normalized.split(/\s+/).filter(word =>
      word.length > 2 && !this.stopWords.has(word)
    );

    // Sort words to reduce order dependency
    words.sort();

    // Identify and prioritize technical terms
    const technicalTerms = this.extractTechnicalTerms(words);
    const regularWords = words.filter(word => !technicalTerms.includes(word));

    // Combine with technical terms first (higher weight)
    return [...technicalTerms, ...regularWords].join(' ');
  }

  /**
   * Extract technical terms that should have higher weight
   */
  private extractTechnicalTerms(words: string[]): string[] {
    const technicalKeywords = new Set([
      // Frameworks
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'gatsby',
      // Languages
      'javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'go', 'rust',
      // Technologies
      'nodejs', 'express', 'fastify', 'mongodb', 'postgresql', 'redis', 'docker',
      // Concepts
      'component', 'hook', 'state', 'props', 'api', 'crud', 'auth', 'database',
      'responsive', 'mobile', 'desktop', 'css', 'html', 'scss', 'tailwind',
      // Project types
      'game', 'dashboard', 'ecommerce', 'blog', 'portfolio', 'landing', 'admin'
    ]);

    return words.filter(word => technicalKeywords.has(word));
  }

  /**
   * Generate embedding for semantic similarity
   * This is a simplified version - in production you'd use a real embedding model
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simplified embedding using TF-IDF-like approach
    const words = text.split(' ');
    const embedding = new Array(this.config.embeddingDimensions).fill(0);

    // Create a simple hash-based embedding
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordHash = this.hashString(word);

      for (let j = 0; j < this.config.embeddingDimensions; j++) {
        const index = (wordHash + j) % this.config.embeddingDimensions;
        embedding[index] += 1 / Math.sqrt(words.length); // Normalize by length
      }
    }

    // Apply technical term weighting
    const technicalTerms = this.extractTechnicalTerms(words);
    technicalTerms.forEach(term => {
      const termHash = this.hashString(term);
      for (let j = 0; j < this.config.embeddingDimensions; j++) {
        const index = (termHash + j) % this.config.embeddingDimensions;
        embedding[index] *= 1.5; // Boost technical terms
      }
    });

    // Normalize the embedding vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Calculate confidence score for using cached response
   */
  private calculateConfidence(
    similarity: number,
    accessCount: number,
    quality: number
  ): number {
    // Base confidence from similarity
    let confidence = similarity;

    // Boost confidence for frequently accessed entries
    const accessBoost = Math.min(accessCount * 0.02, 0.1);
    confidence += accessBoost;

    // Boost confidence for high-quality responses
    const qualityBoost = (quality / 100) * 0.1;
    confidence += qualityBoost;

    // Age penalty (newer entries get slight boost)
    const age = Date.now() - (this.cache.get('') as any)?.metadata?.created || 0;
    const ageHours = age / (60 * 60 * 1000);
    const agePenalty = Math.min(ageHours * 0.001, 0.05);
    confidence -= agePenalty;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate unique ID for cache entry
   */
  private generateId(normalizedQuery: string): string {
    return this.hashString(normalizedQuery).toString(36);
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    let oldestEntry: SemanticCacheEntry | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldestEntry || entry.metadata.lastAccessed < oldestEntry.metadata.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries (synchronous, on-demand)
   */
  private cleanupExpiredSync(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.metadata.created > this.config.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));
  }

  /**
   * Clean up expired entries (for periodic cleanup)
   */
  private cleanupExpired(): void {
    this.cleanupExpiredSync();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    hitRate: number;
    averageSimilarity: number;
    topQueries: string[];
    cacheEfficiency: number;
  } {
    const entries = this.cache.size;
    const entryArray = Array.from(this.cache.values());

    const totalAccesses = entryArray.reduce((sum, entry) => sum + entry.metadata.accessCount, 0);
    const hitRate = entries > 0 ? (totalAccesses / entries) : 0;

    const topQueries = entryArray
      .sort((a, b) => b.metadata.accessCount - a.metadata.accessCount)
      .slice(0, 5)
      .map(entry => entry.originalQuery);

    // Calculate average quality as efficiency metric
    const averageQuality = entries > 0 ?
      entryArray.reduce((sum, entry) => sum + entry.metadata.quality, 0) / entries : 0;

    return {
      entries,
      hitRate: Math.round(hitRate * 100) / 100,
      averageSimilarity: 0.85, // Placeholder - would calculate from actual hits
      topQueries,
      cacheEfficiency: averageQuality
    };
  }

  /**
   * Clear cache (for testing/debugging)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Export cache data for analysis
   */
  exportCache(): string {
    const cacheData = Array.from(this.cache.values()).map(entry => ({
      ...entry,
      embedding: entry.embedding.slice(0, 10) // Truncate embedding for readability
    }));

    return JSON.stringify({
      entries: cacheData,
      config: this.config,
      stats: this.getStats(),
      exportDate: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  }

  /**
   * Find similar queries for debugging
   */
  findSimilarQueries(query: string, limit: number = 5): Array<{
    query: string;
    similarity: number;
    metadata: any;
  }> {
    const normalizedQuery = this.normalizeQuery(query);
    // This would need the embedding generation, simplified for now

    return Array.from(this.cache.values())
      .map(entry => ({
        query: entry.originalQuery,
        similarity: 0.8, // Placeholder
        metadata: entry.metadata
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}

// Global semantic cache instance
export const semanticCache = new SemanticCacheManager();

// Utility functions for integration
export const checkSemanticCache = async (
  query: string,
  strategy: string,
  framework?: string
): Promise<any | null> => {
  const match = await semanticCache.findSimilar(query, strategy, framework);

  if (match) {
    logger.info(`Semantic cache hit! Similarity: ${match.similarity.toFixed(3)}, Confidence: ${match.confidence.toFixed(3)}`);
    return match.entry.response;
  }

  return null;
};

export const storeInSemanticCache = async (
  query: string,
  response: any,
  metadata: {
    strategy: string;
    framework?: string;
    tokens: number;
    quality: number;
  }
): Promise<void> => {
  await semanticCache.store(query, response, metadata);
};