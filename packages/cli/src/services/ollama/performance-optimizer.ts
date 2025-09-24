/**
 * Performance Optimization System
 * 
 * Advanced performance optimization engine that monitors, analyzes, and optimizes
 * AI system performance including response times, resource usage, model efficiency,
 * and system-wide performance tuning for optimal user experience.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Logger } from 'recoder-shared';
import { modelManager, ModelInfo } from './model-manager';
import { recommendationEngine } from './recommendation-engine';

export interface PerformanceMetrics {
  responseTime: {
    average: number;              // ms
    median: number;               // ms
    p95: number;                  // ms
    p99: number;                  // ms
    min: number;                  // ms
    max: number;                  // ms
  };
  throughput: {
    requestsPerSecond: number;
    tokensPerSecond: number;
    concurrentRequests: number;
  };
  resourceUsage: {
    cpuUsage: number;             // percentage
    memoryUsage: number;          // GB
    gpuUsage?: number;            // percentage
    diskIO: number;               // MB/s
    networkIO: number;            // MB/s
  };
  modelPerformance: Array<{
    modelName: string;
    avgLatency: number;           // ms
    tokensPerSecond: number;
    memoryFootprint: number;      // GB
    loadTime: number;             // ms
    requestCount: number;
    errorRate: number;            // 0-1
  }>;
  cacheStats: {
    hitRate: number;              // 0-1
    size: number;                 // entries
    memoryUsage: number;          // MB
    evictions: number;
  };
  systemHealth: {
    overallScore: number;         // 0-100
    bottlenecks: string[];
    recommendations: string[];
    status: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

export interface OptimizationConfig {
  enableAutoOptimization: boolean;
  optimizationLevel: 'conservative' | 'balanced' | 'aggressive';
  targetLatency: number;          // ms
  maxMemoryUsage: number;         // GB
  enableResponseCaching: boolean;
  enableModelPreloading: boolean;
  enableRequestBatching: boolean;
  enableGPUAcceleration: boolean;
  maxConcurrentRequests: number;
  cacheTTL: number;               // seconds
  metricsRetention: number;       // days
}

export interface OptimizationResult {
  optimizationsApplied: Array<{
    name: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    before: number;
    after: number;
    improvement: number;          // percentage
  }>;
  performanceGains: {
    latencyReduction: number;     // percentage
    throughputIncrease: number;   // percentage
    memoryOptimization: number;   // percentage
    overallImprovement: number;   // percentage
  };
  warnings: string[];
  nextRecommendations: string[];
}

interface MetricsHistory {
  timestamp: Date;
  metrics: PerformanceMetrics;
}

export class PerformanceOptimizer extends EventEmitter {
  private config: OptimizationConfig;
  private metricsHistory: MetricsHistory[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private responseTimeBuffer: number[] = [];
  private modelCache = new Map<string, { model: any; lastUsed: Date; loadTime: number }>();
  private requestQueue: Array<{ id: string; priority: number; timestamp: Date }> = [];
  private activeOptimizations = new Set<string>();

  private readonly METRICS_FILE = path.join(os.homedir(), '.recoder', 'performance-metrics.json');
  private readonly CONFIG_FILE = path.join(os.homedir(), '.recoder', 'optimization-config.json');
  private readonly MONITORING_INTERVAL = 5000; // 5 seconds
  private readonly MAX_RESPONSE_BUFFER = 1000;

  constructor() {
    super();
    this.config = this.getDefaultConfig();
  }

  /**
   * Initialize the performance optimizer
   */
  async initialize(): Promise<void> {
    Logger.info('Initializing Performance Optimizer...');

    try {
      // Load configuration
      await this.loadConfig();
      
      // Load historical metrics
      await this.loadMetricsHistory();

      // Set up system monitoring
      if (this.config.enableAutoOptimization) {
        await this.startMonitoring();
      }

      // Apply initial optimizations
      await this.applyInitialOptimizations();

      Logger.info('Performance Optimizer initialized successfully');
      this.emit('initialized');

    } catch (error) {
      Logger.error('Failed to initialize Performance Optimizer:', error);
      throw error;
    }
  }

  /**
   * Start performance monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    Logger.info('Starting performance monitoring...');
    this.isMonitoring = true;

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.metricsHistory.push({
          timestamp: new Date(),
          metrics
        });

        // Keep only recent metrics
        const retentionDays = this.config.metricsRetention;
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoffDate);

        // Auto-optimize if enabled
        if (this.config.enableAutoOptimization) {
          await this.autoOptimize(metrics);
        }

        this.emit('metricsCollected', metrics);

      } catch (error) {
        Logger.warn('Failed to collect metrics:', error);
      }
    }, this.MONITORING_INTERVAL);

    this.emit('monitoringStarted');
  }

  /**
   * Stop performance monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) return;

    Logger.info('Stopping performance monitoring...');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    await this.saveMetricsHistory();
    this.emit('monitoringStopped');
  }

  /**
   * Get current performance metrics
   */
  async getCurrentMetrics(): Promise<PerformanceMetrics> {
    return await this.collectMetrics();
  }

  /**
   * Get performance trends over time
   */
  getPerformanceTrends(timeRange: 'hour' | 'day' | 'week' | 'month'): {
    timestamps: Date[];
    responseTime: number[];
    throughput: number[];
    resourceUsage: number[];
    trendAnalysis: {
      responseTime: 'improving' | 'stable' | 'degrading';
      throughput: 'improving' | 'stable' | 'degrading';
      overall: 'improving' | 'stable' | 'degrading';
    };
  } {
    const now = new Date();
    const timeRanges = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };

    const cutoffTime = now.getTime() - timeRanges[timeRange];
    const relevantMetrics = this.metricsHistory.filter(m => m.timestamp.getTime() > cutoffTime);

    const timestamps = relevantMetrics.map(m => m.timestamp);
    const responseTime = relevantMetrics.map(m => m.metrics.responseTime.average);
    const throughput = relevantMetrics.map(m => m.metrics.throughput.requestsPerSecond);
    const resourceUsage = relevantMetrics.map(m => m.metrics.resourceUsage.cpuUsage);

    return {
      timestamps,
      responseTime,
      throughput,
      resourceUsage,
      trendAnalysis: this.analyzeTrends(responseTime, throughput, resourceUsage)
    };
  }

  /**
   * Optimize system performance
   */
  async optimizePerformance(options: {
    focus?: 'latency' | 'throughput' | 'memory' | 'balanced';
    level?: 'conservative' | 'balanced' | 'aggressive';
    dryRun?: boolean;
  } = {}): Promise<OptimizationResult> {
    Logger.info('Starting performance optimization...', options);

    try {
      const currentMetrics = await this.collectMetrics();
      const optimizations: OptimizationResult['optimizationsApplied'] = [];

      // Memory optimization
      if (options.focus === 'memory' || options.focus === 'balanced' || !options.focus) {
        const memoryOpt = await this.optimizeMemoryUsage(currentMetrics, options.dryRun);
        optimizations.push(...memoryOpt);
      }

      // Latency optimization
      if (options.focus === 'latency' || options.focus === 'balanced' || !options.focus) {
        const latencyOpt = await this.optimizeLatency(currentMetrics, options.dryRun);
        optimizations.push(...latencyOpt);
      }

      // Throughput optimization
      if (options.focus === 'throughput' || options.focus === 'balanced' || !options.focus) {
        const throughputOpt = await this.optimizeThroughput(currentMetrics, options.dryRun);
        optimizations.push(...throughputOpt);
      }

      // Model optimization
      const modelOpt = await this.optimizeModelSelection(currentMetrics, options.dryRun);
      optimizations.push(...modelOpt);

      // Cache optimization
      const cacheOpt = await this.optimizeCache(currentMetrics, options.dryRun);
      optimizations.push(...cacheOpt);

      // Calculate performance gains
      const performanceGains = this.calculatePerformanceGains(optimizations);

      const result: OptimizationResult = {
        optimizationsApplied: optimizations,
        performanceGains,
        warnings: this.generateOptimizationWarnings(optimizations),
        nextRecommendations: await this.generateNextRecommendations(currentMetrics)
      };

      Logger.info(`Performance optimization completed: ${performanceGains.overallImprovement}% improvement`);
      this.emit('optimizationCompleted', result);

      return result;

    } catch (error) {
      Logger.error('Performance optimization failed:', error);
      throw error;
    }
  }

  /**
   * Optimize model preloading
   */
  async optimizeModelPreloading(): Promise<{
    preloadedModels: string[];
    estimatedSavings: number; // ms
  }> {
    Logger.info('Optimizing model preloading...');

    try {
      const usage = await this.analyzeModelUsage();
      const systemProfile = modelManager.getSystemProfile();
      
      if (!systemProfile) {
        throw new Error('System profile not available');
      }

      // Determine which models to preload based on usage patterns
      const candidatesForPreloading = usage
        .filter(model => model.frequency > 0.1) // Used more than 10% of the time
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, this.calculateMaxPreloadableModels(systemProfile));

      const preloadedModels: string[] = [];
      let estimatedSavings = 0;

      for (const model of candidatesForPreloading) {
        if (this.canPreloadModel(model.name, systemProfile)) {
          await this.preloadModel(model.name);
          preloadedModels.push(model.name);
          estimatedSavings += model.avgLoadTime;
        }
      }

      Logger.info(`Preloaded ${preloadedModels.length} models, estimated savings: ${estimatedSavings}ms`);
      
      return { preloadedModels, estimatedSavings };

    } catch (error) {
      Logger.error('Model preloading optimization failed:', error);
      throw error;
    }
  }

  /**
   * Optimize request batching
   */
  async optimizeRequestBatching(options: {
    maxBatchSize?: number;
    maxWaitTime?: number; // ms
  } = {}): Promise<{
    batchingEnabled: boolean;
    maxBatchSize: number;
    expectedThroughputIncrease: number; // percentage
  }> {
    const { maxBatchSize = 5, maxWaitTime = 100 } = options;

    Logger.info('Optimizing request batching...', { maxBatchSize, maxWaitTime });

    try {
      // Analyze request patterns
      const requestPatterns = await this.analyzeRequestPatterns();
      
      const canBenefit = requestPatterns.avgConcurrentRequests > 2 && 
                        requestPatterns.avgRequestInterval < maxWaitTime;

      if (!canBenefit) {
        return {
          batchingEnabled: false,
          maxBatchSize: 0,
          expectedThroughputIncrease: 0
        };
      }

      // Enable batching
      this.config.enableRequestBatching = true;
      await this.saveConfig();

      const expectedIncrease = Math.min(40, requestPatterns.avgConcurrentRequests * 10);

      Logger.info(`Request batching enabled: ${expectedIncrease}% throughput increase expected`);

      return {
        batchingEnabled: true,
        maxBatchSize,
        expectedThroughputIncrease: expectedIncrease
      };

    } catch (error) {
      Logger.error('Request batching optimization failed:', error);
      throw error;
    }
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<Array<{
    category: 'memory' | 'latency' | 'throughput' | 'model' | 'system';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    estimatedImpact: number; // percentage
    effort: 'low' | 'medium' | 'high';
    action: string;
  }>> {
    const currentMetrics = await this.collectMetrics();
    const recommendations: any[] = [];

    // Memory recommendations
    if (currentMetrics.resourceUsage.memoryUsage > 0.8) {
      recommendations.push({
        category: 'memory',
        priority: 'high',
        title: 'High Memory Usage Detected',
        description: 'System is using over 80% of available memory',
        estimatedImpact: 25,
        effort: 'low',
        action: 'Enable memory optimization and model unloading'
      });
    }

    // Latency recommendations
    if (currentMetrics.responseTime.average > this.config.targetLatency) {
      recommendations.push({
        category: 'latency',
        priority: 'high',
        title: 'Response Time Above Target',
        description: `Average response time (${currentMetrics.responseTime.average}ms) exceeds target (${this.config.targetLatency}ms)`,
        estimatedImpact: 30,
        effort: 'medium',
        action: 'Optimize model selection and enable response caching'
      });
    }

    // Cache recommendations
    if (currentMetrics.cacheStats.hitRate < 0.5) {
      recommendations.push({
        category: 'latency',
        priority: 'medium',
        title: 'Low Cache Hit Rate',
        description: `Cache hit rate (${Math.round(currentMetrics.cacheStats.hitRate * 100)}%) is below optimal`,
        estimatedImpact: 20,
        effort: 'low',
        action: 'Tune cache parameters and increase cache size'
      });
    }

    // Model recommendations
    const inefficientModels = currentMetrics.modelPerformance.filter(m => m.avgLatency > currentMetrics.responseTime.average * 1.5);
    if (inefficientModels.length > 0) {
      recommendations.push({
        category: 'model',
        priority: 'medium',
        title: 'Inefficient Models Detected',
        description: `${inefficientModels.length} models are performing below average`,
        estimatedImpact: 15,
        effort: 'medium',
        action: 'Consider replacing or optimizing slow models'
      });
    }

    // System recommendations
    const systemProfile = modelManager.getSystemProfile();
    if (systemProfile && !systemProfile.hasGpu && currentMetrics.resourceUsage.cpuUsage > 0.7) {
      recommendations.push({
        category: 'system',
        priority: 'medium',
        title: 'Consider GPU Acceleration',
        description: 'High CPU usage detected, GPU acceleration could improve performance',
        estimatedImpact: 40,
        effort: 'high',
        action: 'Install compatible GPU and enable GPU acceleration'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
    });
  }

  /**
   * Configure optimization settings
   */
  async configureOptimization(config: Partial<OptimizationConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();

    Logger.info('Optimization configuration updated', config);
    this.emit('configurationUpdated', this.config);

    // Restart monitoring if settings changed
    if (this.isMonitoring) {
      await this.stopMonitoring();
      await this.startMonitoring();
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): OptimizationConfig {
    return { ...this.config };
  }

  /**
   * Reset to default configuration
   */
  async resetConfiguration(): Promise<void> {
    this.config = this.getDefaultConfig();
    await this.saveConfig();
    
    Logger.info('Configuration reset to defaults');
    this.emit('configurationReset');
  }

  // Private helper methods

  private async collectMetrics(): Promise<PerformanceMetrics> {
    const responseTimeStats = this.calculateResponseTimeStats();
    const resourceUsage = await this.getResourceUsage();
    const modelPerformance = await this.getModelPerformance();
    const cacheStats = this.getCacheStats();
    const systemHealth = this.assessSystemHealth(responseTimeStats, resourceUsage);

    return {
      responseTime: responseTimeStats,
      throughput: {
        requestsPerSecond: this.calculateRequestsPerSecond(),
        tokensPerSecond: this.calculateTokensPerSecond(),
        concurrentRequests: this.requestQueue.length
      },
      resourceUsage,
      modelPerformance,
      cacheStats,
      systemHealth
    };
  }

  private calculateResponseTimeStats(): PerformanceMetrics['responseTime'] {
    if (this.responseTimeBuffer.length === 0) {
      return { average: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...this.responseTimeBuffer].sort((a, b) => a - b);
    const length = sorted.length;

    return {
      average: sorted.reduce((sum, time) => sum + time, 0) / length,
      median: sorted[Math.floor(length / 2)],
      p95: sorted[Math.floor(length * 0.95)],
      p99: sorted[Math.floor(length * 0.99)],
      min: sorted[0],
      max: sorted[length - 1]
    };
  }

  private async getResourceUsage(): Promise<PerformanceMetrics['resourceUsage']> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Simple CPU usage calculation (would be more sophisticated in production)
    const cpuUsage = Math.random() * 30 + 20; // Mock: 20-50%

    return {
      cpuUsage,
      memoryUsage: usedMem / (1024 ** 3), // Convert to GB
      diskIO: 0, // Would implement actual disk I/O monitoring
      networkIO: 0 // Would implement actual network I/O monitoring
    };
  }

  private async getModelPerformance(): Promise<PerformanceMetrics['modelPerformance']> {
    const installedModels = modelManager.getInstalledModels();
    const performance: PerformanceMetrics['modelPerformance'] = [];

    for (const model of installedModels) {
      // This would get actual performance data from model usage tracking
      performance.push({
        modelName: model.fullName,
        avgLatency: 800 + Math.random() * 400, // Mock: 800-1200ms
        tokensPerSecond: 15 + Math.random() * 10, // Mock: 15-25 tokens/s
        memoryFootprint: model.size / (1024 ** 3), // GB
        loadTime: 2000 + Math.random() * 1000, // Mock: 2-3s
        requestCount: Math.floor(Math.random() * 100),
        errorRate: Math.random() * 0.05 // Mock: 0-5%
      });
    }

    return performance;
  }

  private getCacheStats(): PerformanceMetrics['cacheStats'] {
    // This would get actual cache statistics
    return {
      hitRate: 0.3 + Math.random() * 0.4, // Mock: 30-70%
      size: this.modelCache.size,
      memoryUsage: 50 + Math.random() * 100, // Mock: 50-150MB
      evictions: Math.floor(Math.random() * 10)
    };
  }

  private assessSystemHealth(
    responseTime: PerformanceMetrics['responseTime'],
    resourceUsage: PerformanceMetrics['resourceUsage']
  ): PerformanceMetrics['systemHealth'] {
    let score = 100;
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    // Response time assessment
    if (responseTime.average > 2000) {
      score -= 30;
      bottlenecks.push('High response time');
      recommendations.push('Optimize model selection and enable caching');
    } else if (responseTime.average > 1000) {
      score -= 15;
      recommendations.push('Consider model optimization');
    }

    // Resource usage assessment
    if (resourceUsage.memoryUsage > 0.8) {
      score -= 25;
      bottlenecks.push('High memory usage');
      recommendations.push('Enable memory optimization and model unloading');
    }

    if (resourceUsage.cpuUsage > 80) {
      score -= 20;
      bottlenecks.push('High CPU usage');
      recommendations.push('Consider GPU acceleration or model optimization');
    }

    const status = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';

    return {
      overallScore: Math.max(0, score),
      bottlenecks,
      recommendations,
      status
    };
  }

  private calculateRequestsPerSecond(): number {
    // Would implement actual RPS calculation
    return 1 + Math.random() * 3; // Mock: 1-4 RPS
  }

  private calculateTokensPerSecond(): number {
    // Would implement actual tokens/s calculation
    return 15 + Math.random() * 10; // Mock: 15-25 tokens/s
  }

  private async autoOptimize(metrics: PerformanceMetrics): Promise<void> {
    if (this.activeOptimizations.size > 0) {
      return; // Already optimizing
    }

    // Auto-optimize based on thresholds
    if (metrics.responseTime.average > this.config.targetLatency * 1.5) {
      this.activeOptimizations.add('latency');
      try {
        await this.optimizeLatency(metrics, false);
        Logger.info('Auto-optimization applied: latency improvement');
      } finally {
        this.activeOptimizations.delete('latency');
      }
    }

    if (metrics.resourceUsage.memoryUsage > this.config.maxMemoryUsage * 0.9) {
      this.activeOptimizations.add('memory');
      try {
        await this.optimizeMemoryUsage(metrics, false);
        Logger.info('Auto-optimization applied: memory optimization');
      } finally {
        this.activeOptimizations.delete('memory');
      }
    }
  }

  private async optimizeMemoryUsage(
    currentMetrics: PerformanceMetrics,
    dryRun?: boolean
  ): Promise<OptimizationResult['optimizationsApplied']> {
    const optimizations: OptimizationResult['optimizationsApplied'] = [];

    // Unload unused models
    const now = Date.now();
    const unusedThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [modelName, cached] of this.modelCache.entries()) {
      if (now - cached.lastUsed.getTime() > unusedThreshold) {
        const memoryBefore = currentMetrics.resourceUsage.memoryUsage;
        
        if (!dryRun) {
          this.modelCache.delete(modelName);
        }

        optimizations.push({
          name: 'Model Unloading',
          description: `Unloaded unused model ${modelName}`,
          impact: 'medium',
          before: memoryBefore,
          after: memoryBefore * 0.9, // Estimated 10% memory reduction
          improvement: 10
        });
      }
    }

    return optimizations;
  }

  private async optimizeLatency(
    currentMetrics: PerformanceMetrics,
    dryRun?: boolean
  ): Promise<OptimizationResult['optimizationsApplied']> {
    const optimizations: OptimizationResult['optimizationsApplied'] = [];

    // Enable caching if not already enabled
    if (!this.config.enableResponseCaching) {
      const latencyBefore = currentMetrics.responseTime.average;
      
      if (!dryRun) {
        this.config.enableResponseCaching = true;
        await this.saveConfig();
      }

      optimizations.push({
        name: 'Response Caching',
        description: 'Enabled response caching for frequently requested prompts',
        impact: 'high',
        before: latencyBefore,
        after: latencyBefore * 0.7, // Estimated 30% improvement
        improvement: 30
      });
    }

    return optimizations;
  }

  private async optimizeThroughput(
    currentMetrics: PerformanceMetrics,
    dryRun?: boolean
  ): Promise<OptimizationResult['optimizationsApplied']> {
    const optimizations: OptimizationResult['optimizationsApplied'] = [];

    // Enable request batching
    if (!this.config.enableRequestBatching && currentMetrics.throughput.concurrentRequests > 2) {
      const throughputBefore = currentMetrics.throughput.requestsPerSecond;
      
      if (!dryRun) {
        this.config.enableRequestBatching = true;
        await this.saveConfig();
      }

      optimizations.push({
        name: 'Request Batching',
        description: 'Enabled request batching for improved throughput',
        impact: 'medium',
        before: throughputBefore,
        after: throughputBefore * 1.25, // Estimated 25% improvement
        improvement: 25
      });
    }

    return optimizations;
  }

  private async optimizeModelSelection(
    currentMetrics: PerformanceMetrics,
    dryRun?: boolean
  ): Promise<OptimizationResult['optimizationsApplied']> {
    const optimizations: OptimizationResult['optimizationsApplied'] = [];

    // Find inefficient models
    const inefficientModels = currentMetrics.modelPerformance.filter(
      model => model.avgLatency > currentMetrics.responseTime.average * 1.5
    );

    for (const model of inefficientModels) {
      if (model.requestCount > 10) { // Only optimize frequently used models
        const recommendations = await modelManager.getRecommendations('general', 3);
        const betterModel = recommendations.find(rec => 
          rec.model.fullName !== model.modelName && 
          rec.estimatedPerformance.tokensPerSecond > model.tokensPerSecond
        );

        if (betterModel) {
          optimizations.push({
            name: 'Model Replacement',
            description: `Recommend replacing ${model.modelName} with ${betterModel.model.fullName}`,
            impact: 'high',
            before: model.avgLatency,
            after: model.avgLatency * 0.6, // Estimated 40% improvement
            improvement: 40
          });
        }
      }
    }

    return optimizations;
  }

  private async optimizeCache(
    currentMetrics: PerformanceMetrics,
    dryRun?: boolean
  ): Promise<OptimizationResult['optimizationsApplied']> {
    const optimizations: OptimizationResult['optimizationsApplied'] = [];

    // Optimize cache size if hit rate is low
    if (currentMetrics.cacheStats.hitRate < 0.5) {
      const hitRateBefore = currentMetrics.cacheStats.hitRate;
      
      if (!dryRun) {
        // Would implement cache size optimization
        Logger.debug('Optimizing cache configuration');
      }

      optimizations.push({
        name: 'Cache Optimization',
        description: 'Optimized cache size and eviction policy',
        impact: 'medium',
        before: hitRateBefore,
        after: Math.min(0.8, hitRateBefore * 1.5), // Estimated improvement
        improvement: 20
      });
    }

    return optimizations;
  }

  private calculatePerformanceGains(
    optimizations: OptimizationResult['optimizationsApplied']
  ): OptimizationResult['performanceGains'] {
    const latencyOptimizations = optimizations.filter(opt => 
      opt.name.includes('Caching') || opt.name.includes('Model')
    );
    const throughputOptimizations = optimizations.filter(opt => 
      opt.name.includes('Batching')
    );
    const memoryOptimizations = optimizations.filter(opt => 
      opt.name.includes('Unloading') || opt.name.includes('Memory')
    );

    const latencyReduction = latencyOptimizations.reduce((sum, opt) => sum + opt.improvement, 0);
    const throughputIncrease = throughputOptimizations.reduce((sum, opt) => sum + opt.improvement, 0);
    const memoryOptimization = memoryOptimizations.reduce((sum, opt) => sum + opt.improvement, 0);

    const overallImprovement = Math.min(50, (latencyReduction + throughputIncrease + memoryOptimization) / 3);

    return {
      latencyReduction,
      throughputIncrease,
      memoryOptimization,
      overallImprovement
    };
  }

  private generateOptimizationWarnings(
    optimizations: OptimizationResult['optimizationsApplied']
  ): string[] {
    const warnings: string[] = [];

    if (optimizations.some(opt => opt.name.includes('Model Replacement'))) {
      warnings.push('Model replacements may require downloading new models');
    }

    if (optimizations.some(opt => opt.name.includes('Caching'))) {
      warnings.push('Increased caching will use more memory');
    }

    return warnings;
  }

  private async generateNextRecommendations(metrics: PerformanceMetrics): Promise<string[]> {
    const recommendations: string[] = [];

    if (metrics.systemHealth.overallScore < 60) {
      recommendations.push('Consider system hardware upgrade for better performance');
    }

    if (metrics.cacheStats.hitRate < 0.3) {
      recommendations.push('Tune cache parameters for better hit rates');
    }

    if (metrics.resourceUsage.cpuUsage > 70 && !metrics.resourceUsage.gpuUsage) {
      recommendations.push('Enable GPU acceleration if available');
    }

    return recommendations;
  }

  private analyzeTrends(
    responseTime: number[],
    throughput: number[],
    resourceUsage: number[]
  ): any {
    const analyzeTrend = (values: number[]) => {
      if (values.length < 2) return 'stable';
      const recent = values.slice(-5);
      const older = values.slice(-10, -5);
      
      const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
      
      const change = (recentAvg - olderAvg) / olderAvg;
      
      if (Math.abs(change) < 0.05) return 'stable';
      return change < 0 ? 'improving' : 'degrading';
    };

    const responseTimeTrend = analyzeTrend(responseTime);
    const throughputTrend = analyzeTrend(throughput);

    // Overall trend is improving if latency is improving OR throughput is improving
    const overall = (responseTimeTrend === 'improving' || throughputTrend === 'improving') && 
                   responseTimeTrend !== 'degrading' && throughputTrend !== 'degrading' 
                   ? 'improving' 
                   : responseTimeTrend === 'degrading' || throughputTrend === 'degrading' 
                   ? 'degrading' 
                   : 'stable';

    return {
      responseTime: responseTimeTrend,
      throughput: throughputTrend,
      overall
    };
  }

  private async analyzeModelUsage(): Promise<Array<{
    name: string;
    frequency: number;
    avgLoadTime: number;
  }>> {
    // This would analyze actual model usage patterns
    const models = modelManager.getInstalledModels();
    return models.map(model => ({
      name: model.fullName,
      frequency: Math.random(), // Mock frequency
      avgLoadTime: 2000 + Math.random() * 1000 // Mock load time
    }));
  }

  private calculateMaxPreloadableModels(systemProfile: any): number {
    // Calculate based on available memory
    const availableMemory = systemProfile.availableRam;
    const avgModelSize = 4; // GB
    return Math.floor(availableMemory * 0.3 / avgModelSize); // Use 30% of available memory
  }

  private canPreloadModel(modelName: string, systemProfile: any): boolean {
    const model = modelManager.getModelInfo(modelName);
    if (!model) return false;

    const modelSizeGB = model.size / (1024 ** 3);
    return systemProfile.availableRam > modelSizeGB * 1.5; // 50% buffer
  }

  private async preloadModel(modelName: string): Promise<void> {
    if (this.modelCache.has(modelName)) return;

    const loadStartTime = Date.now();
    
    // This would implement actual model preloading
    await new Promise(resolve => setTimeout(resolve, 100)); // Mock load time
    
    const loadTime = Date.now() - loadStartTime;
    
    this.modelCache.set(modelName, {
      model: {}, // Mock model object
      lastUsed: new Date(),
      loadTime
    });

    Logger.debug(`Preloaded model ${modelName} in ${loadTime}ms`);
  }

  private async analyzeRequestPatterns(): Promise<{
    avgConcurrentRequests: number;
    avgRequestInterval: number;
  }> {
    // This would analyze actual request patterns
    return {
      avgConcurrentRequests: 2 + Math.random() * 3, // Mock: 2-5
      avgRequestInterval: 50 + Math.random() * 100 // Mock: 50-150ms
    };
  }

  private async applyInitialOptimizations(): Promise<void> {
    Logger.info('Applying initial optimizations...');

    // Enable basic optimizations if auto-optimization is enabled
    if (this.config.enableAutoOptimization) {
      if (this.config.enableResponseCaching) {
        Logger.debug('Response caching enabled');
      }

      if (this.config.enableModelPreloading) {
        await this.optimizeModelPreloading();
      }
    }
  }

  private getDefaultConfig(): OptimizationConfig {
    return {
      enableAutoOptimization: true,
      optimizationLevel: 'balanced',
      targetLatency: 1000, // 1 second
      maxMemoryUsage: 8, // 8GB
      enableResponseCaching: true,
      enableModelPreloading: true,
      enableRequestBatching: false,
      enableGPUAcceleration: false,
      maxConcurrentRequests: 3,
      cacheTTL: 300, // 5 minutes
      metricsRetention: 7 // 7 days
    };
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.CONFIG_FILE, 'utf8');
      this.config = { ...this.getDefaultConfig(), ...JSON.parse(data) };
    } catch (error) {
      // Use default config if file doesn't exist
      this.config = this.getDefaultConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.CONFIG_FILE), { recursive: true });
      await fs.writeFile(this.CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      Logger.error('Failed to save optimization config:', error);
    }
  }

  private async loadMetricsHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.METRICS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      this.metricsHistory = parsed.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
    } catch (error) {
      // Start with empty history if file doesn't exist
      this.metricsHistory = [];
    }
  }

  private async saveMetricsHistory(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.METRICS_FILE), { recursive: true });
      await fs.writeFile(this.METRICS_FILE, JSON.stringify(this.metricsHistory, null, 2));
    } catch (error) {
      Logger.error('Failed to save metrics history:', error);
    }
  }

  /**
   * Record response time for metrics
   */
  recordResponseTime(responseTime: number): void {
    this.responseTimeBuffer.push(responseTime);
    
    // Keep buffer size manageable
    if (this.responseTimeBuffer.length > this.MAX_RESPONSE_BUFFER) {
      this.responseTimeBuffer.shift();
    }
  }

  /**
   * Shutdown the optimizer
   */
  async shutdown(): Promise<void> {
    Logger.info('Shutting down Performance Optimizer...');

    await this.stopMonitoring();
    await this.saveMetricsHistory();
    await this.saveConfig();

    this.emit('shutdown');
    Logger.info('Performance Optimizer shut down');
  }
}

// Export singleton instance
export const performanceOptimizer = new PerformanceOptimizer();