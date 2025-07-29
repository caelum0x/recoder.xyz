/**
 * AI Response Cache System
 * Caches AI responses to reduce API calls and improve performance
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CacheEntry {
  key: string;
  provider: string;
  model: string;
  response: string;
  tokens: {
    input: number;
    output: number;
  };
  timestamp: number;
  expiresAt: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size in MB
  enableDisk?: boolean; // Enable disk-based caching
}

export class AIResponseCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private cacheDir: string;
  private options: Required<CacheOptions>;
  private cacheStats = {
    hits: 0,
    misses: 0,
    totalSaved: 0, // tokens saved
    totalRequests: 0
  };

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 24 * 60 * 60 * 1000, // 24 hours default
      maxSize: options.maxSize || 100, // 100MB default
      enableDisk: options.enableDisk ?? true
    };

    this.cacheDir = path.join(os.homedir(), '.recoder', 'cache');
    
    if (this.options.enableDisk) {
      this.ensureCacheDir();
      this.loadDiskCache();
    }
  }

  /**
   * Generate cache key from prompt and options
   */
  private generateCacheKey(prompt: string, provider: string, model: string, options: any = {}): string {
    const data = {
      prompt: prompt.trim(),
      provider,
      model,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 4000
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get cached response if available and not expired
   */
  async get(prompt: string, provider: string, model: string, options: any = {}): Promise<string | null> {
    const key = this.generateCacheKey(prompt, provider, model, options);
    this.cacheStats.totalRequests++;

    // Check memory cache first
    let entry = this.memoryCache.get(key);
    
    // If not in memory, check disk cache
    if (!entry && this.options.enableDisk) {
      entry = await this.loadFromDisk(key);
      if (entry) {
        this.memoryCache.set(key, entry);
      }
    }

    if (entry) {
      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.delete(key);
        this.cacheStats.misses++;
        return null;
      }

      this.cacheStats.hits++;
      this.cacheStats.totalSaved += entry.tokens.output;
      
      console.log(`🎯 Cache HIT for ${provider}/${model} (${entry.tokens.output} tokens saved)`);
      return entry.response;
    }

    this.cacheStats.misses++;
    return null;
  }

  /**
   * Cache a response
   */
  async set(
    prompt: string, 
    provider: string, 
    model: string, 
    response: string,
    tokens: { input: number; output: number },
    options: any = {}
  ): Promise<void> {
    const key = this.generateCacheKey(prompt, provider, model, options);
    const entry: CacheEntry = {
      key,
      provider,
      model,
      response,
      tokens,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.options.ttl
    };

    // Store in memory
    this.memoryCache.set(key, entry);

    // Store on disk if enabled
    if (this.options.enableDisk) {
      await this.saveToDisk(entry);
    }

    // Clean up old entries if cache is getting too large
    this.cleanup();

    console.log(`💾 Cached response for ${provider}/${model} (${tokens.output} tokens)`);
  }

  /**
   * Delete a cache entry
   */
  private delete(key: string): void {
    this.memoryCache.delete(key);
    
    if (this.options.enableDisk) {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        // Ignore file not found errors
      }
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    
    if (this.options.enableDisk) {
      try {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }

    console.log('🗑️ Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): typeof this.cacheStats & { hitRate: number; cacheSize: number } {
    const hitRate = this.cacheStats.totalRequests > 0 
      ? (this.cacheStats.hits / this.cacheStats.totalRequests) * 100 
      : 0;

    return {
      ...this.cacheStats,
      hitRate: Math.round(hitRate * 100) / 100,
      cacheSize: this.memoryCache.size
    };
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch (error) {
      console.warn('Could not create cache directory:', error);
    }
  }

  /**
   * Load cache entry from disk
   */
  private async loadFromDisk(key: string): Promise<CacheEntry | null> {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const entry: CacheEntry = JSON.parse(data);
      
      // Check if expired
      if (Date.now() > entry.expiresAt) {
        fs.unlinkSync(filePath);
        return null;
      }
      
      return entry;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save cache entry to disk
   */
  private async saveToDisk(entry: CacheEntry): Promise<void> {
    const filePath = path.join(this.cacheDir, `${entry.key}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn('Could not save cache entry to disk:', error);
    }
  }

  /**
   * Load existing cache entries from disk on startup
   */
  private loadDiskCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let loaded = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const key = file.replace('.json', '');
          const entry = this.loadFromDisk(key);
          
          if (entry) {
            this.memoryCache.set(key, entry as CacheEntry);
            loaded++;
          }
        }
      }
      
      if (loaded > 0) {
        console.log(`📁 Loaded ${loaded} cache entries from disk`);
      }
    } catch (error) {
      // Cache directory doesn't exist or is empty
    }
  }

  /**
   * Clean up expired entries and manage cache size
   */
  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.memoryCache.entries());
    
    // Remove expired entries
    for (const [key, entry] of entries) {
      if (now > entry.expiresAt) {
        this.delete(key);
      }
    }

    // If cache is still too large, remove oldest entries
    const maxEntries = Math.floor((this.options.maxSize * 1024 * 1024) / 10000); // Rough estimate
    if (this.memoryCache.size > maxEntries) {
      const sortedEntries = entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.memoryCache.size - maxEntries);
      
      for (const [key] of sortedEntries) {
        this.delete(key);
      }
      
      console.log(`🧹 Cleaned up ${sortedEntries.length} old cache entries`);
    }
  }

  /**
   * Check if a response is likely to be cacheable
   */
  static isCacheable(prompt: string, response: string): boolean {
    // Don't cache very short prompts or responses
    if (prompt.length < 10 || response.length < 50) {
      return false;
    }

    // Don't cache responses that look like errors
    const errorIndicators = ['error', 'failed', 'sorry', 'cannot', 'unable'];
    const lowerResponse = response.toLowerCase();
    
    if (errorIndicators.some(indicator => lowerResponse.includes(indicator))) {
      return false;
    }

    // Don't cache responses with current timestamps or random data
    const hasTimestamp = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(response);
    const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(response);
    
    if (hasTimestamp || hasUuid) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export const aiCache = new AIResponseCache({
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  maxSize: 50, // 50MB
  enableDisk: true
});

export default aiCache;