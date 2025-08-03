/**
 * Performance Optimizer
 * Optimizes AI assistant performance and caching
 */

export class PerformanceOptimizer {
  private requestQueue: Map<string, any> = new Map();
  private responseCache: Map<string, any> = new Map();
  private metricsCollector: any;

  constructor(private config: any) {
    this.setupMetricsCollection();
  }

  private setupMetricsCollection(): void {
    this.metricsCollector = {
      requestCount: 0,
      cacheHits: 0,
      averageResponseTime: 0,
      errorRate: 0
    };
  }

  async optimizeRequest(requestId: string, request: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cached = this.responseCache.get(cacheKey);
      
      if (cached && !this.isCacheExpired(cached)) {
        this.metricsCollector.cacheHits++;
        return cached.data;
      }
      
      // Add to request queue
      this.requestQueue.set(requestId, {
        request,
        timestamp: startTime,
        status: 'pending'
      });
      
      // Process request (placeholder)
      const response = await this.processRequest(request);
      
      // Cache response
      this.cacheResponse(cacheKey, response);
      
      // Update metrics
      this.updateMetrics(startTime, true);
      
      return response;
      
    } catch (error) {
      this.updateMetrics(startTime, false);
      throw error;
    } finally {
      this.requestQueue.delete(requestId);
    }
  }

  private async processRequest(request: any): Promise<any> {
    // Placeholder implementation
    await new Promise(resolve => setTimeout(resolve, 100));
    return { result: 'processed', timestamp: Date.now() };
  }

  private generateCacheKey(request: any): string {
    const serialized = JSON.stringify(request) || 'empty-request';
    return serialized.slice(0, 100);
  }

  private isCacheExpired(cached: any): boolean {
    const expireTime = cached.timestamp + (this.config.cacheTimeout || 300000);
    return Date.now() > expireTime;
  }

  private cacheResponse(key: string, response: any): void {
    this.responseCache.set(key, {
      data: response,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.responseCache.size > 1000) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.responseCache.delete(oldestKey);
      }
    }
  }

  private updateMetrics(startTime: number, success: boolean): void {
    this.metricsCollector.requestCount++;
    
    const responseTime = Date.now() - startTime;
    this.metricsCollector.averageResponseTime = 
      (this.metricsCollector.averageResponseTime + responseTime) / 2;
    
    if (!success) {
      this.metricsCollector.errorRate = 
        (this.metricsCollector.errorRate + 1) / this.metricsCollector.requestCount;
    }
  }

  getMetrics(): any {
    return {
      ...this.metricsCollector,
      cacheSize: this.responseCache.size,
      queueSize: this.requestQueue.size,
      cacheHitRate: this.metricsCollector.cacheHits / this.metricsCollector.requestCount
    };
  }

  clearCache(): void {
    this.responseCache.clear();
  }

  optimizeCacheSize(): void {
    // Remove least recently used items
    const sortedEntries = Array.from(this.responseCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const keepCount = Math.floor(this.responseCache.size * 0.7);
    const toKeep = sortedEntries.slice(-keepCount);
    
    this.responseCache.clear();
    toKeep.forEach(([key, value]) => {
      if (key && value) {
        this.responseCache.set(key, value);
      }
    });
  }
}