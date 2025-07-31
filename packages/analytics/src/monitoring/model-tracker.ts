/**
 * Individual Model Health Tracking
 * 
 * Tracks detailed health metrics for individual AI models including quality scoring,
 * performance trends, and reliability indicators.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface ModelHealthMetrics { 
  modelName: string;
  provider: string;
  availability: number;        // % uptime (last 24h)
  avgLatency: number;         // ms average response time
  errorRate: number;          // % of failed requests
  costPerToken: number;       // Current pricing
  qualityScore: number;       // Output quality (0-1)
  throughput: number;         // tokens per second
  lastUpdated: Date;
  trends: {
    latency: 'improving' | 'degrading' | 'stable';
    cost: 'improving' | 'degrading' | 'stable';
    quality: 'improving' | 'degrading' | 'stable';
  };
}

export interface QualityMetrics {
  coherence: number;          // Text coherence score (0-1)
  relevance: number;          // Response relevance (0-1)
  accuracy: number;           // Factual accuracy (0-1)
  completeness: number;       // Answer completeness (0-1)
  creativity: number;         // Creative quality (0-1)
  codeQuality?: number;       // Code-specific quality (0-1)
  overall: number;            // Overall quality score (0-1)
}

export interface PerformanceTrend {
  metric: string;
  direction: 'improving' | 'degrading' | 'stable';
  magnitude: number;          // How much change (0-1)
  confidence: number;         // Confidence in trend (0-1)
  timeframe: string;          // Time period analyzed
  dataPoints: number;         // Number of samples
}

export interface ModelReliability {
  modelName: string;
  uptimePercentage: number;   // Overall uptime
  mtbf: number;               // Mean time between failures (hours)
  mttr: number;               // Mean time to recovery (minutes)
  failurePattern: {
    timeOfDay: Record<string, number>; // Failure rates by hour
    dayOfWeek: Record<string, number>; // Failure rates by day
    loadBased: boolean;        // Whether failures correlate with load
  };
  slaCompliance: number;      // SLA compliance percentage
}

export interface ModelBenchmark {
  modelName: string;
  taskType: string;
  score: number;              // Benchmark score (0-100)
  timestamp: Date;
  details: {
    latency: number;
    accuracy: number;
    cost: number;
    throughput: number;
  };
  comparisonRank: number;     // Rank among all models
}

export class ModelTracker extends EventEmitter {
  private modelMetrics: Map<string, ModelHealthMetrics> = new Map();
  private qualityHistory: Map<string, QualityMetrics[]> = new Map();
  private reliabilityData: Map<string, ModelReliability> = new Map();
  private benchmarks: Map<string, ModelBenchmark[]> = new Map();
  private performanceWindow = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    super();
    this.initializeTracking();
  }

  private initializeTracking(): void {
    // Initialize tracking for known models
    const knownModels = [
      { name: 'claude-sonnet-4', provider: 'anthropic' },
      { name: 'claude-haiku-3', provider: 'anthropic' },
      { name: 'gpt-4-turbo', provider: 'openai' },
      { name: 'gpt-4o', provider: 'openai' },
      { name: 'gemini-2.5-pro', provider: 'google' },
      { name: 'mistral-large-2407', provider: 'mistral' },
      { name: 'deepseek-v3', provider: 'deepseek' },
      { name: 'llama-3.3-70b', provider: 'ollama' }
    ];

    knownModels.forEach(model => {
      this.initializeModelMetrics(model.name, model.provider);
    });

    Logger.info(`Initialized tracking for ${knownModels.length} models`);
  }

  private initializeModelMetrics(modelName: string, provider: string): void {
    const initialMetrics: ModelHealthMetrics = {
      modelName,
      provider,
      availability: 1.0,
      avgLatency: 0,
      errorRate: 0,
      costPerToken: 0,
      qualityScore: 0.8, // Default starting score
      throughput: 0,
      lastUpdated: new Date(),
      trends: {
        latency: 'stable',
        cost: 'stable',
        quality: 'stable'
      }
    };

    this.modelMetrics.set(modelName, initialMetrics);
    this.qualityHistory.set(modelName, []);
  }

  /**
   * Update model metrics based on recent performance data
   */
  async updateModelMetrics(
    modelName: string,
    latency: number,
    success: boolean,
    cost: number,
    qualityMetrics?: QualityMetrics
  ): Promise<void> {
    const existing = this.modelMetrics.get(modelName);
    if (!existing) {
      Logger.warn(`Unknown model: ${modelName}`);
      return;
    }

    const now = new Date();
    
    // Update basic metrics with exponential moving average
    const alpha = 0.1; // Smoothing factor
    
    existing.avgLatency = existing.avgLatency * (1 - alpha) + latency * alpha;
    existing.costPerToken = cost;
    existing.lastUpdated = now;

    // Update error rate (over last 100 requests)
    const recentErrors = await this.getRecentErrorCount(modelName);
    existing.errorRate = recentErrors / 100;

    // Update quality score if provided
    if (qualityMetrics) {
      existing.qualityScore = qualityMetrics.overall;
      await this.updateQualityHistory(modelName, qualityMetrics);
    }

    // Update throughput (tokens per second estimate)
    existing.throughput = this.estimateThroughput(existing.avgLatency);

    // Analyze trends
    existing.trends = await this.analyzeTrends(modelName);

    this.modelMetrics.set(modelName, existing);

    // Emit events for significant changes
    await this.checkForSignificantChanges(modelName, existing);

    Logger.debug(`Updated metrics for ${modelName}`);
  }

  /**
   * Get current health metrics for a model
   */
  getModelMetrics(modelName: string): ModelHealthMetrics | null {
    return this.modelMetrics.get(modelName) || null;
  }

  /**
   * Get quality score for a model
   */
  async getQualityScore(modelName: string): Promise<number> {
    const metrics = this.modelMetrics.get(modelName);
    if (!metrics) return 0;

    // If we have recent quality history, use more sophisticated calculation
    const history = this.qualityHistory.get(modelName) || [];
    if (history.length === 0) return metrics.qualityScore;

    // Calculate weighted average of recent quality scores
    const recent = history.slice(-10); // Last 10 measurements
    const weights = recent.map((_, i) => i + 1); // Linear weighting
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    const weightedScore = recent.reduce((sum, quality, i) => 
      sum + quality.overall * weights[i], 0
    ) / totalWeight;

    return weightedScore;
  }

  /**
   * Analyze performance trends for a model
   */
  async getPerformanceTrends(modelName: string): Promise<PerformanceTrend[]> {
    const trends: PerformanceTrend[] = [];
    
    // Analyze latency trend
    const latencyTrend = await this.analyzeMetricTrend(modelName, 'latency');
    trends.push(latencyTrend);

    // Analyze quality trend
    const qualityTrend = await this.analyzeMetricTrend(modelName, 'quality');
    trends.push(qualityTrend);

    // Analyze cost trend
    const costTrend = await this.analyzeMetricTrend(modelName, 'cost');
    trends.push(costTrend);

    // Analyze error rate trend
    const errorTrend = await this.analyzeMetricTrend(modelName, 'errorRate');
    trends.push(errorTrend);

    return trends;
  }

  /**
   * Get model reliability statistics
   */
  async getModelReliability(modelName: string): Promise<ModelReliability | null> {
    return this.reliabilityData.get(modelName) || null;
  }

  /**
   * Update model reliability data
   */
  async updateReliability(
    modelName: string,
    isAvailable: boolean,
    timestamp: Date = new Date()
  ): Promise<void> {
    let reliability = this.reliabilityData.get(modelName);
    
    if (!reliability) {
      reliability = {
        modelName,
        uptimePercentage: 100,
        mtbf: 0,
        mttr: 0,
        failurePattern: {
          timeOfDay: {},
          dayOfWeek: {},
          loadBased: false
        },
        slaCompliance: 100
      };
      this.reliabilityData.set(modelName, reliability);
    }

    // Update availability tracking
    await this.updateAvailabilityTracking(modelName, isAvailable, timestamp);
    
    // Recalculate reliability metrics
    reliability.uptimePercentage = await this.calculateUptimePercentage(modelName);
    reliability.mtbf = await this.calculateMTBF(modelName);
    reliability.mttr = await this.calculateMTTR(modelName);
    reliability.slaCompliance = await this.calculateSLACompliance(modelName);

    this.reliabilityData.set(modelName, reliability);
  }

  /**
   * Run benchmarks for all models
   */
  async runBenchmarks(taskType: string = 'general'): Promise<ModelBenchmark[]> {
    const modelNames = Array.from(this.modelMetrics.keys());
    const benchmarks: ModelBenchmark[] = [];

    for (const modelName of modelNames) {
      try {
        const benchmark = await this.runModelBenchmark(modelName, taskType);
        benchmarks.push(benchmark);
      } catch (error) {
        Logger.error(`Benchmark failed for ${modelName}:`, error);
      }
    }

    // Sort by score and assign ranks
    benchmarks.sort((a, b) => b.score - a.score);
    benchmarks.forEach((benchmark, index) => {
      benchmark.comparisonRank = index + 1;
    });

    // Store benchmarks
    benchmarks.forEach(benchmark => {
      const existing = this.benchmarks.get(benchmark.modelName) || [];
      existing.push(benchmark);
      
      // Keep only last 10 benchmarks per model
      if (existing.length > 10) {
        existing.splice(0, existing.length - 10);
      }
      
      this.benchmarks.set(benchmark.modelName, existing);
    });

    Logger.info(`Completed benchmarks for ${benchmarks.length} models`);
    return benchmarks;
  }

  /**
   * Get benchmark history for a model
   */
  getBenchmarkHistory(modelName: string): ModelBenchmark[] {
    return this.benchmarks.get(modelName) || [];
  }

  /**
   * Compare models for a specific task
   */
  async compareModels(taskType: string, metrics: string[] = ['quality', 'latency', 'cost']): Promise<any[]> {
    const modelNames = Array.from(this.modelMetrics.keys());
    const comparisons = [];

    for (const modelName of modelNames) {
      const modelMetrics = this.modelMetrics.get(modelName);
      const benchmarks = this.benchmarks.get(modelName) || [];
      const relevantBenchmark = benchmarks.find(b => b.taskType === taskType);

      if (!modelMetrics) continue;

      const comparison = {
        modelName,
        provider: modelMetrics.provider,
        overallScore: 0,
        details: {} as any
      };

      // Calculate scores for each metric
      let totalScore = 0;
      let weightSum = 0;

      if (metrics.includes('quality')) {
        const weight = 0.4;
        comparison.details.quality = modelMetrics.qualityScore * 100;
        totalScore += comparison.details.quality * weight;
        weightSum += weight;
      }

      if (metrics.includes('latency')) {
        const weight = 0.3;
        const latencyScore = Math.max(0, 100 - (modelMetrics.avgLatency / 100));
        comparison.details.latency = {
          ms: modelMetrics.avgLatency,
          score: latencyScore
        };
        totalScore += latencyScore * weight;
        weightSum += weight;
      }

      if (metrics.includes('cost')) {
        const weight = 0.2;
        const costScore = Math.max(0, 100 - (modelMetrics.costPerToken * 10000));
        comparison.details.cost = {
          perToken: modelMetrics.costPerToken,
          score: costScore
        };
        totalScore += costScore * weight;
        weightSum += weight;
      }

      if (metrics.includes('reliability')) {
        const weight = 0.1;
        const availabilityScore = modelMetrics.availability * 100;
        comparison.details.reliability = {
          availability: modelMetrics.availability,
          score: availabilityScore
        };
        totalScore += availabilityScore * weight;
        weightSum += weight;
      }

      comparison.overallScore = weightSum > 0 ? totalScore / weightSum : 0;
      comparisons.push(comparison);
    }

    return comparisons.sort((a, b) => b.overallScore - a.overallScore);
  }

  // Private helper methods

  private async updateQualityHistory(modelName: string, qualityMetrics: QualityMetrics): Promise<void> {
    const history = this.qualityHistory.get(modelName) || [];
    history.push({
      ...qualityMetrics,
      timestamp: new Date()
    } as any);

    // Keep only last 100 quality measurements
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.qualityHistory.set(modelName, history);
  }

  private async analyzeTrends(modelName: string): Promise<ModelHealthMetrics['trends']> {
    const metrics = this.modelMetrics.get(modelName);
    if (!metrics) {
      return { latency: 'stable', cost: 'stable', quality: 'stable' };
    }

    // Simplified trend analysis - in production, this would use more sophisticated algorithms
    const latencyTrend = await this.calculateTrendDirection(modelName, 'latency');
    const costTrendRaw = await this.calculateTrendDirection(modelName, 'cost');
    const qualityTrend = await this.calculateTrendDirection(modelName, 'quality');

    return {
      latency: latencyTrend,
      cost: costTrendRaw,
      quality: qualityTrend
    };
  }

  private async calculateTrendDirection(modelName: string, metric: string): Promise<'improving' | 'degrading' | 'stable'> {
    // This would analyze historical data points to determine trend
    // For now, return stable as default
    return 'stable';
  }

  private estimateThroughput(avgLatency: number): number {
    if (avgLatency === 0) return 0;
    
    // Rough estimate based on average latency
    // Assumes ~100 tokens per request
    const requestsPerSecond = 1000 / avgLatency;
    return Math.round(requestsPerSecond * 100); // tokens per second
  }

  private async checkForSignificantChanges(modelName: string, metrics: ModelHealthMetrics): Promise<void> {
    // Check for significant degradation
    if (metrics.availability < 0.9) {
      this.emit('availabilityDegraded', modelName, metrics.availability);
    }

    if (metrics.errorRate > 0.05) {
      this.emit('errorRateIncreased', modelName, metrics.errorRate);
    }

    if (metrics.avgLatency > 10000) {
      this.emit('latencyIncreased', modelName, metrics.avgLatency);
    }

    if (metrics.qualityScore < 0.6) {
      this.emit('qualityDegraded', modelName, metrics.qualityScore);
    }
  }

  private async getRecentErrorCount(modelName: string): Promise<number> {
    // This would query actual error logs
    // For now, return a simulated value
    return Math.floor(Math.random() * 5);
  }

  private async analyzeMetricTrend(modelName: string, metric: string): Promise<PerformanceTrend> {
    // Simplified trend analysis
    return {
      metric,
      direction: 'stable',
      magnitude: 0,
      confidence: 0.8,
      timeframe: '24h',
      dataPoints: 100
    };
  }

  private async updateAvailabilityTracking(modelName: string, isAvailable: boolean, timestamp: Date): Promise<void> {
    // Store availability data points for reliability calculations
    // This would typically use a time-series database
    Logger.debug(`Availability update for ${modelName}: ${isAvailable}`);
  }

  private async calculateUptimePercentage(modelName: string): Promise<number> {
    // Calculate uptime percentage over the last 24 hours
    // This would query actual availability data
    return 99.5; // Simulated value
  }

  private async calculateMTBF(modelName: string): Promise<number> {
    // Mean Time Between Failures calculation
    return 720; // 12 hours (simulated)
  }

  private async calculateMTTR(modelName: string): Promise<number> {
    // Mean Time To Recovery calculation
    return 15; // 15 minutes (simulated)
  }

  private async calculateSLACompliance(modelName: string): Promise<number> {
    // SLA compliance percentage
    return 99.9; // Simulated value
  }

  private async runModelBenchmark(modelName: string, taskType: string): Promise<ModelBenchmark> {
    const metrics = this.modelMetrics.get(modelName);
    if (!metrics) {
      throw new Error(`Model ${modelName} not found`);
    }

    // Simulate benchmark run
    const startTime = Date.now();
    
    // This would run actual benchmark tests
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const endTime = Date.now();
    const benchmarkLatency = endTime - startTime;

    // Calculate benchmark score based on multiple factors
    const latencyScore = Math.max(0, 100 - (benchmarkLatency / 10));
    const qualityScore = metrics.qualityScore * 100;
    const reliabilityScore = metrics.availability * 100;
    const costScore = Math.max(0, 100 - (metrics.costPerToken * 10000));

    const overallScore = (latencyScore * 0.3 + qualityScore * 0.4 + reliabilityScore * 0.2 + costScore * 0.1);

    return {
      modelName,
      taskType,
      score: Math.round(overallScore),
      timestamp: new Date(),
      details: {
        latency: benchmarkLatency,
        accuracy: metrics.qualityScore,
        cost: metrics.costPerToken,
        throughput: metrics.throughput
      },
      comparisonRank: 0 // Will be set when comparing with others
    };
  }
}

// Export singleton instance
export const modelTracker = new ModelTracker();