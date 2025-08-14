/**
 * @recoder/performance - High-performance monitoring, caching, and optimization utilities
 * 
 * This package provides production-ready performance optimization tools for the Recoder.xyz platform.
 */

export { PerformanceMonitor, PerformanceMetrics, SystemMetrics } from './monitoring';
export { RedisCache, CacheOptions, CacheStats } from './caching';
export { PerformanceMiddleware, RateLimitOptions, HealthCheckOptions } from './middleware';
export { CDNManager, CDNConfig, CDNStats } from './cdn';

// Main performance manager that coordinates all components
export class PerformanceManager {
  private monitor: PerformanceMonitor;
  private cache: RedisCache;
  private cdn: CDNManager;
  private isInitialized = false;

  constructor(config: {
    redis?: { url: string; options?: any };
    cdn?: CDNConfig;
    monitoring?: { interval?: number; enableAlerts?: boolean };
  } = {}) {
    // Initialize components
    this.monitor = new PerformanceMonitor(config.monitoring);
    this.cache = new RedisCache(config.redis?.url, config.redis?.options);
    this.cdn = new CDNManager(config.cdn);
  }

  /**
   * Initialize all performance components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🚀 Initializing Recoder Performance Manager...');

    try {
      // Initialize components in parallel
      await Promise.all([
        this.monitor.start(),
        this.cache.connect(),
        this.cdn.initialize()
      ]);

      this.isInitialized = true;
      console.log('✅ Performance Manager initialized successfully');

      // Start monitoring
      this.monitor.on('alert', (alert) => {
        console.warn('⚠️ Performance Alert:', alert);
      });

    } catch (error) {
      console.error('❌ Failed to initialize Performance Manager:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system health status
   */
  async getHealthStatus() {
    if (!this.isInitialized) {
      throw new Error('Performance Manager not initialized');
    }

    const [monitoringHealth, cacheHealth, cdnHealth] = await Promise.all([
      this.monitor.getHealth(),
      this.cache.getHealthStatus(),
      this.cdn.getHealth()
    ]);

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        monitoring: monitoringHealth,
        cache: cacheHealth,
        cdn: cdnHealth
      },
      summary: this.monitor.getPerformanceSummary()
    };
  }

  /**
   * Gracefully shutdown all components
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    console.log('🛑 Shutting down Performance Manager...');

    try {
      await Promise.all([
        this.monitor.stop(),
        this.cache.disconnect(),
        this.cdn.shutdown()
      ]);

      this.isInitialized = false;
      console.log('✅ Performance Manager shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  // Getters for individual components
  get monitoring() { return this.monitor; }
  get caching() { return this.cache; }
  get cdnManagement() { return this.cdn; }
}

// Re-export classes for direct use
import { PerformanceMonitor } from './monitoring';
import { RedisCache } from './caching';
import { PerformanceMiddleware } from './middleware';
import { CDNManager, CDNConfig } from './cdn';

// Default export
export default PerformanceManager;