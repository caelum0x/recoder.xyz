/**
 * Consensus Caching & Optimization System
 * 
 * Caches consensus decisions for similar tasks to improve performance and reduce costs.
 * Includes precomputation for common patterns, model performance tracking, and adaptive thresholds.
 */

import { Logger } from '@recoder/shared';
import { ConsensusRequest, ConsensusResult, ModelResponse } from './hybrid-consensus';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Cache interfaces
export interface CachedConsensus {
  id: string;
  requestHash: string;
  request: Partial<ConsensusRequest>;
  result: ConsensusResult;
  timestamp: number;
  hitCount: number;
  lastAccessed: number;
  expiresAt: number;
  cost: number;
  responseTime: number;
}

export interface ModelPerformanceMetrics {
  modelId: string;
  totalRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
  averageConfidence: number;
  averageQuality: number;
  taskTypePerformance: Record<string, TaskTypeMetrics>;
  costPerRequest: number;
  lastUpdated: number;
}

export interface TaskTypeMetrics {
  requests: number;
  averageQuality: number;
  averageConfidence: number;
  successRate: number;
  averageResponseTime: number;
}

export interface PrecomputedPattern {
  id: string;
  pattern: string;
  taskType: string;
  frequency: number;
  lastPrecomputed: number;
  consensusResult: ConsensusResult;
  variations: string[];
}

export interface AdaptiveThreshold {
  taskType: string;
  baseThreshold: number;
  currentThreshold: number;
  successRate: number;
  adjustmentHistory: ThresholdAdjustment[];
  lastAdjustment: number;
}

export interface ThresholdAdjustment {
  timestamp: number;
  oldThreshold: number;
  newThreshold: number;
  reason: string;
  resultingSuccessRate: number;
}

export interface CacheConfig {
  maxCacheSize: number;
  ttlMinutes: number;
  enablePrecomputation: boolean;
  enableAdaptiveThresholds: boolean;
  precomputationSchedule: string; // cron-like schedule
  performanceTrackingWindow: number; // days
  cacheDirectory: string;
}

export class ConsensusCache {
  private cache: Map<string, CachedConsensus> = new Map();
  private performanceMetrics: Map<string, ModelPerformanceMetrics> = new Map();
  private precomputedPatterns: Map<string, PrecomputedPattern> = new Map();
  private adaptiveThresholds: Map<string, AdaptiveThreshold> = new Map();
  private config: CacheConfig;
  private cacheFilePath: string = '';
  private metricsFilePath: string = '';
  private patternsFilePath: string = '';
  private thresholdsFilePath: string = '';

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxCacheSize: 10000,
      ttlMinutes: 60 * 24, // 24 hours
      enablePrecomputation: true,
      enableAdaptiveThresholds: true,
      precomputationSchedule: '0 2 * * *', // Daily at 2 AM
      performanceTrackingWindow: 30, // 30 days
      cacheDirectory: path.join(process.cwd(), '.recoder', 'consensus-cache'),
      ...config
    };

    this.initializeCacheDirectory();
    this.setupFilePaths();
    this.loadCacheFromDisk();
    this.startMaintenanceSchedule();
  }

  /**
   * Get cached consensus result if available
   */
  async getCachedConsensus(request: ConsensusRequest): Promise<ConsensusResult | null> {
    const requestHash = this.generateRequestHash(request);
    const cached = this.cache.get(requestHash);

    if (!cached) {
      Logger.debug('Cache miss for consensus request');
      return null;
    }

    // Check if cache entry is expired
    if (Date.now() > cached.expiresAt) {
      Logger.debug('Cache entry expired, removing');
      this.cache.delete(requestHash);
      return null;
    }

    // Update access statistics
    cached.hitCount++;
    cached.lastAccessed = Date.now();

    Logger.info(`Cache hit for consensus request (${cached.hitCount} hits)`);
    return cached.result;
  }

  /**
   * Cache a consensus result
   */
  async cacheConsensusResult(
    request: ConsensusRequest,
    result: ConsensusResult,
    cost: number,
    responseTime: number
  ): Promise<void> {
    const requestHash = this.generateRequestHash(request);
    const now = Date.now();

    const cachedEntry: CachedConsensus = {
      id: `consensus_${now}_${Math.random().toString(36).substr(2, 9)}`,
      requestHash,
      request: {
        taskType: request.taskType,
        consensusThreshold: request.consensusThreshold,
        maxModels: request.maxModels,
        privacyLevel: request.privacyLevel
      },
      result,
      timestamp: now,
      hitCount: 0,
      lastAccessed: now,
      expiresAt: now + (this.config.ttlMinutes * 60 * 1000),
      cost,
      responseTime
    };

    this.cache.set(requestHash, cachedEntry);

    // Enforce cache size limit
    if (this.cache.size > this.config.maxCacheSize) {
      this.evictOldestEntries();
    }

    // Update model performance metrics
    await this.updateModelPerformance(result.modelResponses, request.taskType, responseTime);

    // Check for precomputation opportunities
    if (this.config.enablePrecomputation) {
      await this.analyzeForPrecomputation(request, result);
    }

    Logger.debug(`Cached consensus result: ${requestHash}`);
  }

  /**
   * Get model performance metrics for optimization
   */
  getModelPerformance(modelId?: string): ModelPerformanceMetrics | Map<string, ModelPerformanceMetrics> {
    if (modelId) {
      return this.performanceMetrics.get(modelId) || this.createEmptyMetrics(modelId);
    }
    return this.performanceMetrics;
  }

  /**
   * Get adaptive threshold for a task type
   */
  getAdaptiveThreshold(taskType: string): number {
    const threshold = this.adaptiveThresholds.get(taskType);
    if (!threshold) {
      return this.getDefaultThreshold(taskType);
    }

    return threshold.currentThreshold;
  }

  /**
   * Precompute consensus for common patterns
   */
  async precomputeCommonPatterns(): Promise<void> {
    if (!this.config.enablePrecomputation) {
      Logger.debug('Precomputation disabled, skipping');
      return;
    }

    Logger.info('Starting precomputation of common consensus patterns');

    const commonPatterns = await this.identifyCommonPatterns();
    const precomputePromises = commonPatterns.map(pattern => 
      this.precomputePattern(pattern)
    );

    await Promise.all(precomputePromises);
    
    Logger.info(`Precomputed ${commonPatterns.length} consensus patterns`);
  }

  /**
   * Optimize model selection based on performance history
   */
  optimizeModelSelection(
    taskType: string,
    maxModels: number,
    privacyLevel: string
  ): string[] {
    const taskMetrics = Array.from(this.performanceMetrics.entries())
      .map(([modelId, metrics]) => ({
        modelId,
        taskPerformance: metrics.taskTypePerformance[taskType],
        overallMetrics: metrics
      }))
      .filter(item => item.taskPerformance && item.taskPerformance.requests > 5) // Minimum data points
      .sort((a, b) => {
        // Score based on quality, confidence, success rate, and response time
        const scoreA = this.calculateModelScore(a.taskPerformance, a.overallMetrics);
        const scoreB = this.calculateModelScore(b.taskPerformance, b.overallMetrics);
        return scoreB - scoreA;
      });

    const optimizedModels = taskMetrics
      .slice(0, maxModels)
      .map(item => item.modelId);

    Logger.info(`Optimized model selection for ${taskType}: ${optimizedModels.join(', ')}`);
    return optimizedModels;
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    totalEntries: number;
    hitRatio: number;
    averageResponseTime: number;
    totalCostSaved: number;
    topTaskTypes: Array<{ taskType: string; count: number }>;
  } {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, entry) => sum + entry.hitCount, 0);
    const totalRequests = entries.length + totalHits;
    const hitRatio = totalRequests > 0 ? totalHits / totalRequests : 0;

    const averageResponseTime = entries.length > 0
      ? entries.reduce((sum, entry) => sum + entry.responseTime, 0) / entries.length
      : 0;

    const totalCostSaved = entries.reduce((sum, entry) => sum + (entry.cost * entry.hitCount), 0);

    const taskTypeCounts = entries.reduce((acc, entry) => {
      const taskType = entry.request.taskType || 'unknown';
      acc[taskType] = (acc[taskType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topTaskTypes = Object.entries(taskTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([taskType, count]) => ({ taskType, count }));

    return {
      totalEntries: entries.length,
      hitRatio,
      averageResponseTime,
      totalCostSaved,
      topTaskTypes
    };
  }

  /**
   * Clear cache with optional filters
   */
  clearCache(filters?: {
    taskType?: string;
    olderThan?: number; // timestamp
    privacy?: string;
  }): number {
    let removedCount = 0;

    for (const [hash, entry] of this.cache.entries()) {
      let shouldRemove = false;

      if (filters?.taskType && entry.request.taskType !== filters.taskType) {
        continue;
      }

      if (filters?.olderThan && entry.timestamp < filters.olderThan) {
        shouldRemove = true;
      }

      if (filters?.privacy && entry.request.privacyLevel !== filters.privacy) {
        continue;
      }

      if (!filters || shouldRemove) {
        this.cache.delete(hash);
        removedCount++;
      }
    }

    Logger.info(`Cleared ${removedCount} cache entries`);
    return removedCount;
  }

  // Private methods

  private generateRequestHash(request: ConsensusRequest): string {
    // Create a hash based on key request parameters
    const hashInput = JSON.stringify({
      prompt: this.normalizePrompt(request.prompt),
      taskType: request.taskType,
      consensusThreshold: Math.round(request.consensusThreshold * 100), // Round to avoid floating point issues
      maxModels: request.maxModels,
      privacyLevel: request.privacyLevel,
      contextType: request.context.type,
      complexity: request.context.complexity
    });

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private normalizePrompt(prompt: string): string {
    // Normalize prompt to improve cache hit rate
    return prompt
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim()
      .substring(0, 1000); // Limit length for consistent hashing
  }

  private async updateModelPerformance(
    modelResponses: ModelResponse[],
    taskType: string,
    responseTime: number
  ): Promise<void> {
    for (const response of modelResponses) {
      const modelId = response.model;
      let metrics = this.performanceMetrics.get(modelId);

      if (!metrics) {
        metrics = this.createEmptyMetrics(modelId);
        this.performanceMetrics.set(modelId, metrics);
      }

      // Update overall metrics
      metrics.totalRequests++;
      metrics.successfulRequests++;
      metrics.averageResponseTime = this.updateAverage(
        metrics.averageResponseTime,
        response.executionTime,
        metrics.totalRequests
      );
      metrics.averageConfidence = this.updateAverage(
        metrics.averageConfidence,
        response.confidence,
        metrics.totalRequests
      );
      metrics.averageQuality = this.updateAverage(
        metrics.averageQuality,
        response.quality.overall,
        metrics.totalRequests
      );

      // Update task-specific metrics
      if (!metrics.taskTypePerformance[taskType]) {
        metrics.taskTypePerformance[taskType] = {
          requests: 0,
          averageQuality: 0,
          averageConfidence: 0,
          successRate: 0,
          averageResponseTime: 0
        };
      }

      const taskMetrics = metrics.taskTypePerformance[taskType];
      taskMetrics.requests++;
      taskMetrics.averageQuality = this.updateAverage(
        taskMetrics.averageQuality,
        response.quality.overall,
        taskMetrics.requests
      );
      taskMetrics.averageConfidence = this.updateAverage(
        taskMetrics.averageConfidence,
        response.confidence,
        taskMetrics.requests
      );
      taskMetrics.averageResponseTime = this.updateAverage(
        taskMetrics.averageResponseTime,
        response.executionTime,
        taskMetrics.requests
      );
      taskMetrics.successRate = 1.0; // Assume success if we got a response

      metrics.lastUpdated = Date.now();
    }

    // Update adaptive thresholds if enabled
    if (this.config.enableAdaptiveThresholds) {
      await this.updateAdaptiveThresholds(taskType, modelResponses);
    }
  }

  private updateAverage(currentAvg: number, newValue: number, count: number): number {
    return ((currentAvg * (count - 1)) + newValue) / count;
  }

  private createEmptyMetrics(modelId: string): ModelPerformanceMetrics {
    return {
      modelId,
      totalRequests: 0,
      successfulRequests: 0,
      averageResponseTime: 0,
      averageConfidence: 0,
      averageQuality: 0,
      taskTypePerformance: {},
      costPerRequest: 0,
      lastUpdated: Date.now()
    };
  }

  private async updateAdaptiveThresholds(
    taskType: string,
    modelResponses: ModelResponse[]
  ): Promise<void> {
    let threshold = this.adaptiveThresholds.get(taskType);
    
    if (!threshold) {
      threshold = {
        taskType,
        baseThreshold: this.getDefaultThreshold(taskType),
        currentThreshold: this.getDefaultThreshold(taskType),
        successRate: 1.0,
        adjustmentHistory: [],
        lastAdjustment: Date.now()
      };
      this.adaptiveThresholds.set(taskType, threshold);
    }

    // Calculate consensus quality of current responses
    const avgQuality = modelResponses.reduce((sum, r) => sum + r.quality.overall, 0) / modelResponses.length;
    const avgConfidence = modelResponses.reduce((sum, r) => sum + r.confidence, 0) / modelResponses.length;
    const combinedScore = (avgQuality + avgConfidence) / 2;

    // Adjust threshold based on performance
    const now = Date.now();
    const timeSinceLastAdjustment = now - threshold.lastAdjustment;
    const adjustmentCooldown = 24 * 60 * 60 * 1000; // 24 hours

    if (timeSinceLastAdjustment > adjustmentCooldown) {
      let newThreshold = threshold.currentThreshold;
      let reason = '';

      if (combinedScore > 0.9 && threshold.successRate > 0.95) {
        // High performance, can lower threshold slightly
        newThreshold = Math.max(0.3, threshold.currentThreshold - 0.05);
        reason = 'High performance allows lower threshold';
      } else if (combinedScore < 0.6 || threshold.successRate < 0.8) {
        // Poor performance, increase threshold
        newThreshold = Math.min(0.95, threshold.currentThreshold + 0.1);
        reason = 'Poor performance requires higher threshold';
      }

      if (Math.abs(newThreshold - threshold.currentThreshold) > 0.01) {
        threshold.adjustmentHistory.push({
          timestamp: now,
          oldThreshold: threshold.currentThreshold,
          newThreshold,
          reason,
          resultingSuccessRate: threshold.successRate
        });

        threshold.currentThreshold = newThreshold;
        threshold.lastAdjustment = now;

        Logger.info(`Adjusted threshold for ${taskType}: ${threshold.currentThreshold.toFixed(2)} (${reason})`);
      }
    }
  }

  private getDefaultThreshold(taskType: string): number {
    const defaultThresholds = {
      'security-analysis': 0.8,
      'architecture-review': 0.7,
      'code-audit': 0.75,
      'critical-decision': 0.85
    };

    return defaultThresholds[taskType as keyof typeof defaultThresholds] || 0.7;
  }

  private calculateModelScore(
    taskPerformance: TaskTypeMetrics,
    overallMetrics: ModelPerformanceMetrics
  ): number {
    // Weighted scoring based on multiple factors
    const qualityWeight = 0.4;
    const confidenceWeight = 0.3;
    const speedWeight = 0.2;
    const successWeight = 0.1;

    const qualityScore = taskPerformance.averageQuality;
    const confidenceScore = taskPerformance.averageConfidence;
    const speedScore = Math.max(0, 1 - (taskPerformance.averageResponseTime / 30000)); // Normalize to 30s max
    const successScore = taskPerformance.successRate;

    return (qualityScore * qualityWeight) +
           (confidenceScore * confidenceWeight) +
           (speedScore * speedWeight) +
           (successScore * successWeight);
  }

  private async analyzeForPrecomputation(
    request: ConsensusRequest,
    result: ConsensusResult
  ): Promise<void> {
    const patternKey = this.generatePatternKey(request);
    let pattern = this.precomputedPatterns.get(patternKey);

    if (!pattern) {
      pattern = {
        id: patternKey,
        pattern: this.extractPattern(request.prompt),
        taskType: request.taskType,
        frequency: 1,
        lastPrecomputed: Date.now(),
        consensusResult: result,
        variations: [request.prompt]
      };
      this.precomputedPatterns.set(patternKey, pattern);
    } else {
      pattern.frequency++;
      pattern.variations.push(request.prompt);
      
      // Keep only unique recent variations
      pattern.variations = [...new Set(pattern.variations)].slice(-10);
    }

    Logger.debug(`Pattern frequency updated: ${patternKey} (${pattern.frequency})`);
  }

  private generatePatternKey(request: ConsensusRequest): string {
    const pattern = this.extractPattern(request.prompt);
    return `${request.taskType}_${crypto.createHash('md5').update(pattern).digest('hex').substr(0, 8)}`;
  }

  private extractPattern(prompt: string): string {
    // Extract pattern by removing specific details and keeping structure
    return prompt
      .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL]')
      .replace(/\bhttps?:\/\/[^\s]+/g, '[URL]')
      .replace(/\b\d+\b/g, '[NUMBER]')
      .replace(/\b[A-Z][a-z]+\b/g, '[NAME]')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async identifyCommonPatterns(): Promise<PrecomputedPattern[]> {
    const minFrequency = 5; // Minimum frequency to be considered for precomputation
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();

    return Array.from(this.precomputedPatterns.values())
      .filter(pattern => 
        pattern.frequency >= minFrequency &&
        (now - pattern.lastPrecomputed) > maxAge
      )
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 50); // Top 50 patterns
  }

  private async precomputePattern(pattern: PrecomputedPattern): Promise<void> {
    // This would trigger actual precomputation in a background process
    // For now, just update the timestamp
    pattern.lastPrecomputed = Date.now();
    Logger.info(`Precomputed pattern: ${pattern.id} (frequency: ${pattern.frequency})`);
  }

  private evictOldestEntries(): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    const toRemove = Math.ceil(this.config.maxCacheSize * 0.1); // Remove 10%
    for (let i = 0; i < toRemove && entries.length > 0; i++) {
      const [hash] = entries[i];
      this.cache.delete(hash);
    }

    Logger.debug(`Evicted ${toRemove} cache entries`);
  }

  private initializeCacheDirectory(): void {
    if (!fs.existsSync(this.config.cacheDirectory)) {
      fs.mkdirSync(this.config.cacheDirectory, { recursive: true });
    }
  }

  private setupFilePaths(): void {
    this.cacheFilePath = path.join(this.config.cacheDirectory, 'consensus-cache.json');
    this.metricsFilePath = path.join(this.config.cacheDirectory, 'performance-metrics.json');
    this.patternsFilePath = path.join(this.config.cacheDirectory, 'precomputed-patterns.json');
    this.thresholdsFilePath = path.join(this.config.cacheDirectory, 'adaptive-thresholds.json');
  }

  private loadCacheFromDisk(): void {
    try {
      // Load cache
      if (fs.existsSync(this.cacheFilePath)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
        this.cache = new Map(Object.entries(cacheData));
      }

      // Load metrics
      if (fs.existsSync(this.metricsFilePath)) {
        const metricsData = JSON.parse(fs.readFileSync(this.metricsFilePath, 'utf8'));
        this.performanceMetrics = new Map(Object.entries(metricsData));
      }

      // Load patterns
      if (fs.existsSync(this.patternsFilePath)) {
        const patternsData = JSON.parse(fs.readFileSync(this.patternsFilePath, 'utf8'));
        this.precomputedPatterns = new Map(Object.entries(patternsData));
      }

      // Load thresholds
      if (fs.existsSync(this.thresholdsFilePath)) {
        const thresholdsData = JSON.parse(fs.readFileSync(this.thresholdsFilePath, 'utf8'));
        this.adaptiveThresholds = new Map(Object.entries(thresholdsData));
      }

      Logger.info('Consensus cache loaded from disk');
    } catch (error) {
      Logger.warn('Failed to load cache from disk:', error);
    }
  }

  private saveCacheToDisk(): void {
    try {
      // Save cache
      const cacheData = Object.fromEntries(this.cache);
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(cacheData, null, 2));

      // Save metrics
      const metricsData = Object.fromEntries(this.performanceMetrics);
      fs.writeFileSync(this.metricsFilePath, JSON.stringify(metricsData, null, 2));

      // Save patterns
      const patternsData = Object.fromEntries(this.precomputedPatterns);
      fs.writeFileSync(this.patternsFilePath, JSON.stringify(patternsData, null, 2));

      // Save thresholds
      const thresholdsData = Object.fromEntries(this.adaptiveThresholds);
      fs.writeFileSync(this.thresholdsFilePath, JSON.stringify(thresholdsData, null, 2));

      Logger.debug('Consensus cache saved to disk');
    } catch (error) {
      Logger.error('Failed to save cache to disk:', error);
    }
  }

  private startMaintenanceSchedule(): void {
    // Save cache periodically
    setInterval(() => {
      this.saveCacheToDisk();
    }, 5 * 60 * 1000); // Every 5 minutes

    // Cleanup expired entries
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60 * 60 * 1000); // Every hour

    // Precomputation (if enabled)
    if (this.config.enablePrecomputation) {
      setInterval(() => {
        this.precomputeCommonPatterns().catch(error => 
          Logger.error('Precomputation failed:', error)
        );
      }, 6 * 60 * 60 * 1000); // Every 6 hours
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [hash, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(hash);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      Logger.info(`Cleaned up ${removedCount} expired cache entries`);
    }
  }
}

// Export singleton instance
export const consensusCache = new ConsensusCache();