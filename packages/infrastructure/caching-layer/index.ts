interface CacheConfig {
  provider: 'redis' | 'memcached' | 'in-memory' | 'hybrid';
  connection: {
    host: string;
    port: number;
    password?: string;
    database?: number;
    cluster?: Array<{ host: string; port: number }>;
  };
  defaultTTL: number; // seconds
  maxMemory: string; // e.g., "100mb", "1gb"
  evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'random' | 'ttl';
  compression: {
    enabled: boolean;
    algorithm: 'gzip' | 'lz4' | 'snappy';
    threshold: number; // bytes
  };
  serialization: {
    format: 'json' | 'msgpack' | 'protobuf';
    compress: boolean;
  };
  persistence: {
    enabled: boolean;
    strategy: 'rdb' | 'aof' | 'both';
    interval: number; // seconds
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // seconds
    slowLogThreshold: number; // ms
  };
}

interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  size: number; // bytes
  tags: string[];
  metadata: {
    version?: string;
    contentType?: string;
    compressed?: boolean;
    source?: string;
  };
}

interface CachePattern {
  name: string;
  keyPattern: string;
  ttl: number;
  tags: string[];
  warmup?: {
    enabled: boolean;
    source: () => Promise<any>;
    schedule: string; // cron expression
  };
  invalidation: {
    strategy: 'ttl' | 'tags' | 'dependency' | 'webhook';
    dependencies?: string[];
    webhookUrl?: string;
  };
  compression: boolean;
  replication: {
    enabled: boolean;
    regions: string[];
    consistency: 'eventual' | 'strong';
  };
}

interface CacheMetrics {
  timestamp: Date;
  requests: {
    total: number;
    hits: number;
    misses: number;
    hitRate: number; // percentage
  };
  performance: {
    averageGetTime: number; // ms
    averageSetTime: number; // ms
    p95GetTime: number;
    p99GetTime: number;
  };
  memory: {
    used: number; // bytes
    available: number;
    utilization: number; // percentage
    evictions: number;
  };
  operations: {
    gets: number;
    sets: number;
    deletes: number;
    flushes: number;
    failures: number;
  };
  keys: {
    total: number;
    expired: number;
    evicted: number;
    averageSize: number; // bytes
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
}

interface CacheStrategy {
  id: string;
  name: string;
  pattern: 'cache-aside' | 'write-through' | 'write-behind' | 'read-through' | 'refresh-ahead';
  description: string;
  useCases: string[];
  implementation: {
    read: (key: string) => Promise<any>;
    write: (key: string, value: any, options?: any) => Promise<void>;
    invalidate: (key: string | string[]) => Promise<void>;
    warmup?: () => Promise<void>;
  };
  consistency: 'eventual' | 'strong' | 'session';
  performance: {
    readLatency: number; // ms
    writeLatency: number; // ms
    consistency: number; // percentage
  };
}

interface CacheRule {
  id: string;
  name: string;
  priority: number;
  condition: {
    keyPattern?: RegExp;
    tags?: string[];
    size?: { min?: number; max?: number };
    age?: { min?: number; max?: number };
    accessCount?: { min?: number; max?: number };
  };
  action: {
    type: 'extend-ttl' | 'compress' | 'replicate' | 'evict' | 'promote';
    parameters?: Record<string, any>;
  };
  enabled: boolean;
}

export class CachingLayer {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private patterns: Map<string, CachePattern> = new Map();
  private strategies: Map<string, CacheStrategy> = new Map();
  private rules: Map<string, CacheRule> = new Map();
  private metrics: CacheMetrics[] = [];
  private client: any; // Redis/Memcached client
  private isConnected: boolean = false;

  constructor(config: CacheConfig) {
    this.config = config;
    this.initializeConnection();
    this.initializeStrategies();
    this.initializeMetricsCollection();
  }

  async get<T>(key: string, options?: {
    strategy?: string;
    fallback?: () => Promise<T>;
    tags?: string[];
    ttl?: number;
  }): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      // Apply cache rules
      await this.applyCacheRules(key, 'read');
      
      // Get from cache
      const entry = await this.getFromCache<T>(key);
      
      if (entry) {
        // Update access metrics
        entry.accessCount++;
        entry.lastAccessed = new Date();
        
        // Record hit
        this.recordCacheHit(key, Date.now() - startTime);
        
        return entry.value;
      }
      
      // Cache miss - try fallback
      if (options?.fallback) {
        const value = await options.fallback();
        
        // Store in cache
        await this.set(key, value, {
          ttl: options.ttl,
          tags: options.tags,
          strategy: options.strategy
        });
        
        // Record miss
        this.recordCacheMiss(key, Date.now() - startTime);
        
        return value;
      }
      
      this.recordCacheMiss(key, Date.now() - startTime);
      return null;
      
    } catch (error) {
      this.recordCacheError('get', key, error as Error);
      throw error;
    }
  }

  async set<T>(key: string, value: T, options?: {
    ttl?: number;
    tags?: string[];
    strategy?: string;
    compress?: boolean;
    replicate?: boolean;
  }): Promise<void> {
    const startTime = Date.now();
    
    try {
      const ttl = options?.ttl || this.config.defaultTTL;
      const tags = options?.tags || [];
      const compress = options?.compress ?? this.shouldCompress(value);
      
      // Create cache entry
      const entry: CacheEntry<T> = {
        key,
        value: compress ? await this.compress(value) : value,
        ttl,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttl * 1000),
        accessCount: 0,
        lastAccessed: new Date(),
        size: this.calculateSize(value),
        tags,
        metadata: {
          compressed: compress,
          contentType: typeof value,
          source: 'api'
        }
      };
      
      // Apply cache rules
      await this.applyCacheRules(key, 'write', entry);
      
      // Store in cache
      await this.setInCache(key, entry);
      
      // Handle replication
      if (options?.replicate && this.config.provider === 'redis') {
        await this.replicateToRegions(key, entry);
      }
      
      // Execute strategy-specific logic
      if (options?.strategy) {
        const strategy = this.strategies.get(options.strategy);
        if (strategy && strategy.implementation.write) {
          await strategy.implementation.write(key, value, options);
        }
      }
      
      this.recordCacheSet(key, Date.now() - startTime);
      
    } catch (error) {
      this.recordCacheError('set', key, error as Error);
      throw error;
    }
  }

  async delete(key: string | string[]): Promise<boolean> {
    const keys = Array.isArray(key) ? key : [key];
    const startTime = Date.now();
    
    try {
      let deletedCount = 0;
      
      for (const k of keys) {
        const deleted = await this.deleteFromCache(k);
        if (deleted) deletedCount++;
      }
      
      this.recordCacheDelete(keys, Date.now() - startTime);
      return deletedCount === keys.length;
      
    } catch (error) {
      this.recordCacheError('delete', keys.join(','), error as Error);
      throw error;
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        const keys = await this.getKeysByPattern(pattern);
        await this.delete(keys);
      } else {
        await this.clearAllCache();
      }
      
      this.recordCacheFlush(pattern || 'all');
      
    } catch (error) {
      this.recordCacheError('clear', pattern || 'all', error as Error);
      throw error;
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToInvalidate: string[] = [];
      
      // Find all keys with matching tags
      for (const [key, entry] of this.cache.entries()) {
        if (entry.tags.some(tag => tags.includes(tag))) {
          keysToInvalidate.push(key);
        }
      }
      
      await this.delete(keysToInvalidate);
      
    } catch (error) {
      this.recordCacheError('invalidate', tags.join(','), error as Error);
      throw error;
    }
  }

  async warmup(patterns?: string[]): Promise<void> {
    const patternsToWarm = patterns || Array.from(this.patterns.keys());
    
    const promises = patternsToWarm.map(async (patternName) => {
      const pattern = this.patterns.get(patternName);
      if (pattern && pattern.warmup?.enabled && pattern.warmup.source) {
        try {
          const data = await pattern.warmup.source();
          const key = this.generateKeyFromPattern(pattern.keyPattern, data);
          await this.set(key, data, {
            ttl: pattern.ttl,
            tags: pattern.tags
          });
        } catch (error) {
          console.error(`Failed to warm up pattern ${patternName}:`, error);
        }
      }
    });
    
    await Promise.all(promises);
  }

  async getMetrics(timeRange?: { start: Date; end: Date }): Promise<{
    current: CacheMetrics;
    historical: CacheMetrics[];
    summary: {
      totalRequests: number;
      overallHitRate: number;
      averageResponseTime: number;
      memoryEfficiency: number;
      errorRate: number;
    };
    topKeys: Array<{
      key: string;
      hits: number;
      size: number;
      lastAccessed: Date;
    }>;
  }> {
    const current = await this.getCurrentMetrics();
    
    let historical = this.metrics;
    if (timeRange) {
      historical = this.metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }
    
    const summary = {
      totalRequests: historical.reduce((sum, m) => sum + m.requests.total, 0),
      overallHitRate: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.requests.hitRate, 0) / historical.length : 0,
      averageResponseTime: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.performance.averageGetTime, 0) / historical.length : 0,
      memoryEfficiency: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.memory.utilization, 0) / historical.length : 0,
      errorRate: historical.length > 0 ?
        historical.reduce((sum, m) => sum + m.operations.failures, 0) / 
        historical.reduce((sum, m) => sum + m.requests.total, 1) * 100 : 0
    };
    
    const topKeys = Array.from(this.cache.entries())
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 10)
      .map(([key, entry]) => ({
        key,
        hits: entry.accessCount,
        size: entry.size,
        lastAccessed: entry.lastAccessed
      }));
    
    return { current, historical, summary, topKeys };
  }

  async addPattern(pattern: CachePattern): Promise<void> {
    this.patterns.set(pattern.name, pattern);
    
    // Schedule warmup if configured
    if (pattern.warmup?.enabled && pattern.warmup.schedule) {
      this.scheduleWarmup(pattern);
    }
  }

  async addStrategy(strategy: CacheStrategy): Promise<void> {
    this.strategies.set(strategy.id, strategy);
  }

  async addRule(rule: CacheRule): Promise<void> {
    this.rules.set(rule.id, rule);
  }

  async analyzePerformance(): Promise<{
    hotKeys: Array<{ key: string; accessCount: number; hitRate: number }>;
    coldKeys: Array<{ key: string; lastAccessed: Date; size: number }>;
    recommendations: Array<{
      type: 'increase-ttl' | 'decrease-ttl' | 'compress' | 'partition' | 'evict';
      target: string;
      reasoning: string;
      impact: 'high' | 'medium' | 'low';
    }>;
    efficiency: {
      memoryUsage: number;
      hitRate: number;
      evictionRate: number;
      compressionRatio: number;
    };
  }> {
    const entries = Array.from(this.cache.entries());
    
    // Identify hot keys (frequently accessed)
    const hotKeys = entries
      .filter(([_, entry]) => entry.accessCount > 100)
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 20)
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        hitRate: entry.accessCount / (entry.accessCount + 1) * 100 // Simplified calculation
      }));
    
    // Identify cold keys (rarely accessed)
    const coldKeys = entries
      .filter(([_, entry]) => {
        const daysSinceAccess = (Date.now() - entry.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceAccess > 7 && entry.accessCount < 5;
      })
      .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime())
      .slice(0, 20)
      .map(([key, entry]) => ({
        key,
        lastAccessed: entry.lastAccessed,
        size: entry.size
      }));
    
    // Generate recommendations
    type Recommendation =
      | { type: 'compress'; target: string; reasoning: string; impact: 'high' }
      | { type: 'evict'; target: string; reasoning: string; impact: 'medium' }
      | { type: 'increase-ttl' | 'decrease-ttl' | 'partition'; target: string; reasoning: string; impact: 'high' | 'medium' | 'low' };

    const recommendations: Recommendation[] = [];
    
    // Recommend compression for large values
    const largeValues = entries.filter(([_, entry]) => entry.size > 10000 && !entry.metadata.compressed);
    if (largeValues.length > 0) {
      recommendations.push({
        type: 'compress',
        target: `${largeValues.length} large values`,
        reasoning: 'Values larger than 10KB should be compressed to save memory',
        impact: 'high'
      });
    }
    
    // Recommend eviction for cold keys
    if (coldKeys.length > 0) {
      recommendations.push({
        type: 'evict',
        target: `${coldKeys.length} cold keys`,
        reasoning: 'Keys not accessed in 7+ days with low hit count should be evicted',
        impact: 'medium'
      });
    }
    
    // Calculate efficiency metrics
    const totalMemory = entries.reduce((sum, [_, entry]) => sum + entry.size, 0);
    const compressedEntries = entries.filter(([_, entry]) => entry.metadata.compressed);
    const compressionRatio = compressedEntries.length / entries.length;
    
    const efficiency = {
      memoryUsage: totalMemory,
      hitRate: await this.calculateOverallHitRate(),
      evictionRate: 0, // Would be calculated from eviction events
      compressionRatio: compressionRatio * 100
    };
    
    return { hotKeys, coldKeys, recommendations, efficiency };
  }

  private async initializeConnection(): Promise<void> {
    try {
      switch (this.config.provider) {
        case 'redis':
          // Initialize Redis client
          this.client = await this.createRedisClient();
          break;
        case 'memcached':
          // Initialize Memcached client
          this.client = await this.createMemcachedClient();
          break;
        case 'in-memory':
          // Use Map-based cache
          this.client = this.cache;
          break;
        case 'hybrid':
          // Initialize hybrid cache (L1: in-memory, L2: Redis)
          this.client = await this.createHybridClient();
          break;
      }
      
      this.isConnected = true;
      console.log(`Cache provider ${this.config.provider} initialized successfully`);
      
    } catch (error) {
      console.error('Failed to initialize cache connection:', error);
      throw error;
    }
  }

  private async createRedisClient(): Promise<any> {
    // Mock Redis client
    return {
      get: async (key: string) => {
        const entry = this.cache.get(key);
        return entry ? JSON.stringify(entry) : null;
      },
      set: async (key: string, value: string, ttl?: number) => {
        const entry = JSON.parse(value);
        this.cache.set(key, entry);
        if (ttl) {
          setTimeout(() => this.cache.delete(key), ttl * 1000);
        }
      },
      del: async (key: string) => {
        return this.cache.delete(key) ? 1 : 0;
      },
      keys: async (pattern: string) => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.cache.keys()).filter(key => regex.test(key));
      }
    };
  }

  private async createMemcachedClient(): Promise<any> {
    // Mock Memcached client
    return this.createRedisClient(); // Similar interface
  }

  private async createHybridClient(): Promise<any> {
    // Mock hybrid client (L1: memory, L2: Redis)
    const redisClient = await this.createRedisClient();
    
    return {
      get: async (key: string) => {
        // Try L1 cache first
        if (this.cache.has(key)) {
          return JSON.stringify(this.cache.get(key));
        }
        // Fallback to L2 cache
        return await redisClient.get(key);
      },
      set: async (key: string, value: string, ttl?: number) => {
        const entry = JSON.parse(value);
        // Store in both L1 and L2
        this.cache.set(key, entry);
        await redisClient.set(key, value, ttl);
      },
      del: async (key: string) => {
        this.cache.delete(key);
        return await redisClient.del(key);
      }
    };
  }

  private async getFromCache<T>(key: string): Promise<CacheEntry<T> | null> {
    switch (this.config.provider) {
      case 'in-memory':
        const entry = this.cache.get(key) as CacheEntry<T>;
        if (entry && entry.expiresAt > new Date()) {
          return entry;
        }
        if (entry) {
          this.cache.delete(key); // Remove expired entry
        }
        return null;
        
      default:
        const value = await this.client.get(key);
        if (value) {
          const entry = JSON.parse(value) as CacheEntry<T>;
          if (entry.expiresAt && new Date(entry.expiresAt) > new Date()) {
            return entry;
          }
          await this.client.del(key); // Remove expired entry
        }
        return null;
    }
  }

  private async setInCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    switch (this.config.provider) {
      case 'in-memory':
        this.cache.set(key, entry);
        // Set expiration timer
        setTimeout(() => {
          this.cache.delete(key);
        }, entry.ttl * 1000);
        break;
        
      default:
        await this.client.set(key, JSON.stringify(entry), entry.ttl);
    }
  }

  private async deleteFromCache(key: string): Promise<boolean> {
    switch (this.config.provider) {
      case 'in-memory':
        return this.cache.delete(key);
        
      default:
        const result = await this.client.del(key);
        return result > 0;
    }
  }

  private async clearAllCache(): Promise<void> {
    switch (this.config.provider) {
      case 'in-memory':
        this.cache.clear();
        break;
        
      default:
        const keys = await this.client.keys('*');
        if (keys.length > 0) {
          await Promise.all(keys.map((key: string) => this.client.del(key)));
        }
    }
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    switch (this.config.provider) {
      case 'in-memory':
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.cache.keys()).filter(key => regex.test(key));
        
      default:
        return await this.client.keys(pattern);
    }
  }

  private shouldCompress(value: any): boolean {
    if (!this.config.compression.enabled) return false;
    
    const size = this.calculateSize(value);
    return size >= this.config.compression.threshold;
  }

  private async compress(value: any): Promise<any> {
    // Mock compression implementation
    if (typeof value === 'string') {
      return `compressed:${value}`;
    }
    return `compressed:${JSON.stringify(value)}`;
  }

  private async decompress(value: any): Promise<any> {
    // Mock decompression implementation
    if (typeof value === 'string' && value.startsWith('compressed:')) {
      const original = value.replace('compressed:', '');
      try {
        return JSON.parse(original);
      } catch {
        return original;
      }
    }
    return value;
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length * 2; // Approximate bytes (UTF-16)
  }

  private async applyCacheRules(key: string, operation: 'read' | 'write', entry?: CacheEntry): Promise<void> {
    const applicableRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .filter(rule => this.evaluateRuleCondition(rule.condition, key, entry))
      .sort((a, b) => a.priority - b.priority);

    for (const rule of applicableRules) {
      await this.executeRuleAction(rule.action, key, entry);
    }
  }

  private evaluateRuleCondition(condition: CacheRule['condition'], key: string, entry?: CacheEntry): boolean {
    if (condition.keyPattern && !condition.keyPattern.test(key)) {
      return false;
    }
    
    if (!entry) return true;
    
    if (condition.tags && !condition.tags.every(tag => entry.tags.includes(tag))) {
      return false;
    }
    
    if (condition.size) {
      if (condition.size.min && entry.size < condition.size.min) return false;
      if (condition.size.max && entry.size > condition.size.max) return false;
    }
    
    if (condition.accessCount) {
      if (condition.accessCount.min && entry.accessCount < condition.accessCount.min) return false;
      if (condition.accessCount.max && entry.accessCount > condition.accessCount.max) return false;
    }
    
    return true;
  }

  private async executeRuleAction(action: CacheRule['action'], key: string, entry?: CacheEntry): Promise<void> {
    switch (action.type) {
      case 'extend-ttl':
        if (entry) {
          const extensionSeconds = action.parameters?.seconds || 3600;
          entry.ttl += extensionSeconds;
          entry.expiresAt = new Date(entry.expiresAt.getTime() + extensionSeconds * 1000);
        }
        break;
        
      case 'compress':
        if (entry && !entry.metadata.compressed) {
          entry.value = await this.compress(entry.value);
          entry.metadata.compressed = true;
        }
        break;
        
      case 'evict':
        await this.delete(key);
        break;
    }
  }

  private async replicateToRegions(key: string, entry: CacheEntry): Promise<void> {
    // Mock replication implementation
    console.log(`Replicating ${key} to configured regions`);
  }

  private generateKeyFromPattern(pattern: string, data: any): string {
    // Simple pattern replacement
    return pattern.replace(/\{(\w+)\}/g, (match, prop) => data[prop] || match);
  }

  private scheduleWarmup(pattern: CachePattern): void {
    // Mock cron scheduling
    console.log(`Scheduling warmup for pattern ${pattern.name} with schedule ${pattern.warmup?.schedule}`);
  }

  private async getCurrentMetrics(): Promise<CacheMetrics> {
    const entries = Array.from(this.cache.entries());
    const totalMemory = entries.reduce((sum, [_, entry]) => sum + entry.size, 0);
    const totalHits = entries.reduce((sum, [_, entry]) => sum + entry.accessCount, 0);
    
    return {
      timestamp: new Date(),
      requests: {
        total: totalHits,
        hits: Math.floor(totalHits * 0.85), // Mock 85% hit rate
        misses: Math.floor(totalHits * 0.15),
        hitRate: 85
      },
      performance: {
        averageGetTime: 2.5,
        averageSetTime: 1.8,
        p95GetTime: 5.0,
        p99GetTime: 10.0
      },
      memory: {
        used: totalMemory,
        available: parseInt(this.config.maxMemory) * 1024 * 1024, // Convert to bytes
        utilization: (totalMemory / (parseInt(this.config.maxMemory) * 1024 * 1024)) * 100,
        evictions: 0
      },
      operations: {
        gets: totalHits,
        sets: entries.length,
        deletes: 0,
        flushes: 0,
        failures: 0
      },
      keys: {
        total: entries.length,
        expired: 0,
        evicted: 0,
        averageSize: entries.length > 0 ? totalMemory / entries.length : 0
      },
      network: {
        bytesIn: totalMemory,
        bytesOut: totalMemory,
        connections: 1
      }
    };
  }

  private async calculateOverallHitRate(): Promise<number> {
    if (this.metrics.length === 0) return 0;
    
    const recentMetrics = this.metrics.slice(-10); // Last 10 metrics
    return recentMetrics.reduce((sum, m) => sum + m.requests.hitRate, 0) / recentMetrics.length;
  }

  private recordCacheHit(key: string, duration: number): void {
    // Record cache hit metrics
  }

  private recordCacheMiss(key: string, duration: number): void {
    // Record cache miss metrics
  }

  private recordCacheSet(key: string, duration: number): void {
    // Record cache set metrics
  }

  private recordCacheDelete(keys: string[], duration: number): void {
    // Record cache delete metrics
  }

  private recordCacheFlush(pattern: string): void {
    // Record cache flush metrics
  }

  private recordCacheError(operation: string, key: string, error: Error): void {
    console.error(`Cache ${operation} error for key ${key}:`, error);
  }

  private initializeStrategies(): void {
    // Initialize default caching strategies
    const cacheAside: CacheStrategy = {
      id: 'cache-aside',
      name: 'Cache Aside',
      pattern: 'cache-aside',
      description: 'Application manages both cache and database',
      useCases: ['Read-heavy workloads', 'Data consistency requirements'],
      implementation: {
        read: async (key: string) => {
          return await this.get(key);
        },
        write: async (key: string, value: any) => {
          await this.set(key, value);
        },
        invalidate: async (key: string | string[]) => {
          await this.delete(key);
        }
      },
      consistency: 'eventual',
      performance: {
        readLatency: 2,
        writeLatency: 1,
        consistency: 95
      }
    };
    
    this.strategies.set(cacheAside.id, cacheAside);
  }

  private initializeMetricsCollection(): void {
    setInterval(async () => {
      const metrics = await this.getCurrentMetrics();
      this.metrics.push(metrics);
      
      // Keep only last 1000 metrics
      if (this.metrics.length > 1000) {
        this.metrics.splice(0, this.metrics.length - 1000);
      }
    }, this.config.monitoring.metricsInterval * 1000);
  }
}

export {
  type CacheConfig,
  type CacheEntry,
  type CachePattern,
  type CacheMetrics,
  type CacheStrategy,
  type CacheRule
};