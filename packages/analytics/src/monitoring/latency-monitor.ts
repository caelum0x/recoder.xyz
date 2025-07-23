/**
 * Latency Monitoring & Optimization with Percentile Tracking
 * 
 * Comprehensive latency tracking with percentile calculations, spike detection,
 * trend analysis, and performance optimization recommendations.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface LatencyMetrics {
  p50: number;    // 50th percentile response time
  p95: number;    // 95th percentile response time  
  p99: number;    // 99th percentile response time
  avg: number;    // Average response time
  min: number;    // Minimum response time
  max: number;    // Maximum response time
  trend: 'improving' | 'degrading' | 'stable';
  sampleCount: number;
  timeframe: string;
  timestamp: Date;
}

export interface LatencyEvent {
  modelName: string;
  provider: string;
  latency: number;
  timestamp: Date;
  requestId?: string;
  taskType?: string;
  tokenCount?: number;
  region?: string;
  success: boolean;
}

export interface LatencySpike {
  modelName: string;
  startTime: Date;
  endTime?: Date;
  peakLatency: number;
  averageLatency: number;
  affectedRequests: number;
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  possibleCause?: string;
  resolved: boolean;
}

export interface LatencyTrend {
  modelName: string;
  timeframe: string;
  isIncreasing: boolean;
  changeRate: number;      // % change per hour
  confidence: number;      // Statistical confidence (0-1)
  dataPoints: number;
  predictedLatency?: number; // Predicted latency in next hour
}

export interface PerformanceBenchmark {
  modelName: string;
  taskType: string;
  expectedLatency: {
    p50: number;
    p95: number;
    p99: number;
  };
  tolerance: number;       // Allowed deviation %
  lastUpdated: Date;
}

export interface OptimizationRecommendation {
  modelName: string;
  type: 'model_switch' | 'request_optimization' | 'regional_routing' | 'load_balancing';
  description: string;
  expectedImprovement: number; // % latency reduction
  confidence: number;
  implementation: string;
}

export class LatencyMonitor extends EventEmitter {
  private latencyData: Map<string, LatencyEvent[]> = new Map();
  private activeSpikes: Map<string, LatencySpike> = new Map();
  private spikeHistory: Map<string, LatencySpike[]> = new Map();
  private benchmarks: Map<string, PerformanceBenchmark[]> = new Map();
  
  private config = {
    maxDataPoints: 10000,      // Maximum events to store per model
    spikeThresholdMultiplier: 3, // Latency spike = 3x average
    trendAnalysisWindow: 3600,   // 1 hour in seconds
    percentileCalculationWindow: 1800, // 30 minutes
    cleanupInterval: 300000,     // 5 minutes
  };

  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeModels();
  }

  private initializeModels(): void {
    const knownModels = [
      'claude-sonnet-4', 'claude-haiku-3', 'gpt-4-turbo', 'gpt-4o',
      'gemini-2.5-pro', 'mistral-large-2407', 'deepseek-v3', 'llama-3.3-70b'
    ];

    knownModels.forEach(modelName => {
      this.latencyData.set(modelName, []);
      this.spikeHistory.set(modelName, []);
      this.benchmarks.set(modelName, []);
    });

    Logger.info(`Initialized latency monitoring for ${knownModels.length} models`);
  }

  /**
   * Start latency monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Latency monitor is already running');
      return;
    }

    Logger.info('Starting latency monitoring...');

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldData();
    }, this.config.cleanupInterval);

    this.isRunning = true;
    this.emit('monitoringStarted');

    Logger.info('Latency monitoring started successfully');
  }

  /**
   * Stop latency monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping latency monitoring...');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isRunning = false;
    this.emit('monitoringStopped');

    Logger.info('Latency monitoring stopped');
  }

  /**
   * Track a request's latency
   */
  async trackRequest(
    modelName: string,
    startTime: number,
    endTime: number,
    options?: {
      requestId?: string;
      taskType?: string;
      tokenCount?: number;
      region?: string;
      success?: boolean;
    }
  ): Promise<void> {
    const latency = endTime - startTime;
    
    const event: LatencyEvent = {
      modelName,
      provider: this.getProviderFromModel(modelName),
      latency,
      timestamp: new Date(endTime),
      success: options?.success ?? true,
      ...options
    };

    // Store the event
    const modelData = this.latencyData.get(modelName) || [];
    modelData.push(event);

    // Maintain data limit
    if (modelData.length > this.config.maxDataPoints) {
      modelData.splice(0, modelData.length - this.config.maxDataPoints);
    }

    this.latencyData.set(modelName, modelData);

    // Check for spikes
    await this.checkForSpikes(modelName, latency);

    // Emit events for high latency
    if (latency > 10000) { // 10 seconds
      this.emit('highLatency', modelName, latency, event);
    }

    Logger.debug(`Tracked latency for ${modelName}: ${latency}ms`);
  }

  /**
   * Get latency metrics for a model over a time range
   */
  async getLatencyMetrics(modelName: string, timeRange: string = '1h'): Promise<LatencyMetrics> {
    const events = this.getRecentEvents(modelName, timeRange);
    
    if (events.length === 0) {
      return {
        p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0,
        trend: 'stable', sampleCount: 0, timeframe: timeRange,
        timestamp: new Date()
      };
    }

    const latencies = events.map(e => e.latency).sort((a, b) => a - b);
    const sampleCount = latencies.length;

    // Calculate percentiles
    const p50 = this.calculatePercentile(latencies, 50);
    const p95 = this.calculatePercentile(latencies, 95);
    const p99 = this.calculatePercentile(latencies, 99);

    // Calculate basic statistics
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    const avg = sum / sampleCount;
    const min = latencies[0];
    const max = latencies[sampleCount - 1];

    // Analyze trend
    const trend = await this.analyzeTrend(modelName, timeRange);

    return {
      p50, p95, p99, avg, min, max,
      trend: trend.isIncreasing ? 'degrading' : 'improving',
      sampleCount,
      timeframe: timeRange,
      timestamp: new Date()
    };
  }

  /**
   * Detect latency spikes above threshold
   */
  async detectLatencySpikes(threshold: number = 5000): Promise<LatencySpike[]> {
    const activeSpikes: LatencySpike[] = [];

    for (const [modelName] of this.latencyData) {
      const recentEvents = this.getRecentEvents(modelName, '15m');
      
      if (recentEvents.length < 10) continue;

      const recentLatencies = recentEvents.map(e => e.latency);
      const avgLatency = recentLatencies.reduce((sum, lat) => sum + lat, 0) / recentLatencies.length;
      const maxLatency = Math.max(...recentLatencies);

      // Check if we have a spike
      if (maxLatency > threshold || maxLatency > avgLatency * this.config.spikeThresholdMultiplier) {
        const existingSpike = this.activeSpikes.get(modelName);
        
        if (!existingSpike) {
          // New spike detected
          const spike: LatencySpike = {
            modelName,
            startTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
            peakLatency: maxLatency,
            averageLatency: avgLatency,
            affectedRequests: recentEvents.length,
            severity: this.calculateSpikeSeverity(maxLatency, avgLatency),
            possibleCause: await this.identifySpikeCause(modelName, recentEvents),
            resolved: false
          };

          this.activeSpikes.set(modelName, spike);
          this.emit('latencySpike', modelName, maxLatency);
          activeSpikes.push(spike);
        } else {
          // Update existing spike
          existingSpike.peakLatency = Math.max(existingSpike.peakLatency, maxLatency);
          existingSpike.affectedRequests += recentEvents.length;
          activeSpikes.push(existingSpike);
        }
      } else {
        // Check if an active spike has resolved
        const existingSpike = this.activeSpikes.get(modelName);
        if (existingSpike && !existingSpike.resolved) {
          existingSpike.endTime = new Date();
          existingSpike.resolved = true;
          
          // Move to history
          const history = this.spikeHistory.get(modelName) || [];
          history.push(existingSpike);
          this.spikeHistory.set(modelName, history);
          
          this.activeSpikes.delete(modelName);
          this.emit('latencySpikeResolved', modelName, existingSpike);
        }
      }
    }

    return activeSpikes;
  }

  /**
   * Analyze latency trends for a model
   */
  async getLatencyTrend(modelName: string, timeRange: string = '1h'): Promise<LatencyTrend> {
    return this.analyzeTrend(modelName, timeRange);
  }

  /**
   * Get models optimized for latency
   */
  async optimizeForLatency(): Promise<string[]> {
    const modelMetrics = new Map<string, number>();

    // Calculate recent average latency for all models
    for (const [modelName] of this.latencyData) {
      const metrics = await this.getLatencyMetrics(modelName, '1h');
      if (metrics.sampleCount > 0) {
        modelMetrics.set(modelName, metrics.p95); // Use 95th percentile for reliability
      }
    }

    // Sort by latency (ascending) and return fastest models
    return Array.from(modelMetrics.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([modelName]) => modelName);
  }

  /**
   * Get optimization recommendations for a model
   */
  async getOptimizationRecommendations(modelName: string): Promise<OptimizationRecommendation[]> {
    const metrics = await this.getLatencyMetrics(modelName, '1h');
    const recommendations: OptimizationRecommendation[] = [];

    // High latency recommendations
    if (metrics.p95 > 8000) { // 8 seconds
      const fasterModels = await this.optimizeForLatency();
      const currentIndex = fasterModels.indexOf(modelName);
      
      if (currentIndex > 0) {
        recommendations.push({
          modelName,
          type: 'model_switch',
          description: `Switch to ${fasterModels[0]} for better latency performance`,
          expectedImprovement: 40,
          confidence: 0.8,
          implementation: `Update model selection to prefer ${fasterModels[0]}`
        });
      }
    }

    // Inconsistent latency recommendations
    if (metrics.p99 > metrics.p50 * 3) {
      recommendations.push({
        modelName,
        type: 'request_optimization',
        description: 'High latency variance detected - optimize request complexity',
        expectedImprovement: 25,
        confidence: 0.7,
        implementation: 'Reduce prompt complexity and implement request batching'
      });
    }

    // Regional routing recommendations
    const regionalData = await this.getRegionalLatencyData(modelName);
    if (regionalData.length > 1) {
      const bestRegion = regionalData.sort((a, b) => a.avgLatency - b.avgLatency)[0];
      if (bestRegion.avgLatency < metrics.avg * 0.7) {
        recommendations.push({
          modelName,
          type: 'regional_routing',
          description: `Route requests to ${bestRegion.region} for better performance`,
          expectedImprovement: 30,
          confidence: 0.8,
          implementation: `Configure regional routing to prefer ${bestRegion.region}`
        });
      }
    }

    return recommendations;
  }

  /**
   * Set performance benchmarks for a model
   */
  async setBenchmark(
    modelName: string,
    taskType: string,
    expectedLatency: { p50: number; p95: number; p99: number },
    tolerance: number = 20
  ): Promise<void> {
    const benchmark: PerformanceBenchmark = {
      modelName,
      taskType,
      expectedLatency,
      tolerance,
      lastUpdated: new Date()
    };

    const modelBenchmarks = this.benchmarks.get(modelName) || [];
    
    // Update existing or add new benchmark
    const existingIndex = modelBenchmarks.findIndex(b => b.taskType === taskType);
    if (existingIndex >= 0) {
      modelBenchmarks[existingIndex] = benchmark;
    } else {
      modelBenchmarks.push(benchmark);
    }

    this.benchmarks.set(modelName, modelBenchmarks);
    Logger.info(`Set latency benchmark for ${modelName} (${taskType})`);
  }

  /**
   * Check if current performance meets benchmarks
   */
  async checkBenchmarkCompliance(modelName: string, taskType?: string): Promise<{
    compliant: boolean;
    violations: Array<{
      taskType: string;
      metric: string;
      expected: number;
      actual: number;
      deviation: number;
    }>;
  }> {
    const benchmarks = this.benchmarks.get(modelName) || [];
    const relevantBenchmarks = taskType 
      ? benchmarks.filter(b => b.taskType === taskType)
      : benchmarks;

    if (relevantBenchmarks.length === 0) {
      return { compliant: true, violations: [] };
    }

    const violations: any[] = [];
    
    for (const benchmark of relevantBenchmarks) {
      const metrics = await this.getLatencyMetrics(modelName, '1h');
      
      // Check each percentile
      const checks = [
        { metric: 'p50', expected: benchmark.expectedLatency.p50, actual: metrics.p50 },
        { metric: 'p95', expected: benchmark.expectedLatency.p95, actual: metrics.p95 },
        { metric: 'p99', expected: benchmark.expectedLatency.p99, actual: metrics.p99 }
      ];

      for (const check of checks) {
        const deviation = ((check.actual - check.expected) / check.expected) * 100;
        
        if (deviation > benchmark.tolerance) {
          violations.push({
            taskType: benchmark.taskType,
            metric: check.metric,
            expected: check.expected,
            actual: check.actual,
            deviation
          });
        }
      }
    }

    return {
      compliant: violations.length === 0,
      violations
    };
  }

  // Private helper methods

  private getRecentEvents(modelName: string, timeRange: string): LatencyEvent[] {
    const events = this.latencyData.get(modelName) || [];
    const cutoff = this.getTimeRangeCutoff(timeRange);
    
    return events.filter(event => event.timestamp >= cutoff);
  }

  private getTimeRangeCutoff(timeRange: string): Date {
    const now = new Date();
    const minutes = this.parseTimeRange(timeRange);
    return new Date(now.getTime() - (minutes * 60 * 1000));
  }

  private parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([mhd])$/);
    if (!match) return 60; // Default to 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'm': return value;
      case 'h': return value * 60;
      case 'd': return value * 60 * 24;
      default: return 60;
    }
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    return sortedArray[lower] + (sortedArray[upper] - sortedArray[lower]) * (index - lower);
  }

  private async analyzeTrend(modelName: string, timeRange: string): Promise<LatencyTrend> {
    const events = this.getRecentEvents(modelName, timeRange);
    
    if (events.length < 10) {
      return {
        modelName,
        timeframe: timeRange,
        isIncreasing: false,
        changeRate: 0,
        confidence: 0,
        dataPoints: events.length
      };
    }

    // Simple linear regression to detect trend
    const dataPoints = events.map((event, index) => ({
      x: index,
      y: event.latency
    }));

    const { slope, confidence } = this.calculateLinearRegression(dataPoints);
    
    // Convert slope to hourly change rate
    const hoursInRange = this.parseTimeRange(timeRange) / 60;
    const changeRate = (slope * events.length) / hoursInRange;

    return {
      modelName,
      timeframe: timeRange,
      isIncreasing: slope > 0,
      changeRate: Math.abs(changeRate / events[0]?.latency || 1) * 100, // Percentage change
      confidence,
      dataPoints: events.length,
      predictedLatency: this.predictLatency(events, 60) // 1 hour ahead
    };
  }

  private calculateLinearRegression(points: Array<{x: number, y: number}>): { slope: number, confidence: number } {
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const totalSumSquares = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
    const predictedValues = points.map(p => (sumY - slope * sumX) / n + slope * p.x);
    const residualSumSquares = points.reduce((sum, p, i) => sum + Math.pow(p.y - predictedValues[i], 2), 0);
    
    const rSquared = 1 - (residualSumSquares / totalSumSquares);
    
    return {
      slope,
      confidence: Math.max(0, Math.min(1, rSquared))
    };
  }

  private predictLatency(events: LatencyEvent[], minutesAhead: number): number {
    if (events.length < 5) return 0;

    const recentEvents = events.slice(-10);
    const avgLatency = recentEvents.reduce((sum, e) => sum + e.latency, 0) / recentEvents.length;
    
    // Simple prediction based on recent trend
    return avgLatency;
  }

  private async checkForSpikes(modelName: string, currentLatency: number): Promise<void> {
    const recentEvents = this.getRecentEvents(modelName, '10m');
    
    if (recentEvents.length < 5) return;

    const avgLatency = recentEvents.reduce((sum, e) => sum + e.latency, 0) / recentEvents.length;
    
    if (currentLatency > avgLatency * this.config.spikeThresholdMultiplier) {
      Logger.warn(`Latency spike detected for ${modelName}: ${currentLatency}ms (avg: ${avgLatency}ms)`);
      this.emit('latencySpike', modelName, currentLatency);
    }
  }

  private calculateSpikeSeverity(peakLatency: number, avgLatency: number): LatencySpike['severity'] {
    const ratio = peakLatency / avgLatency;
    
    if (ratio >= 10) return 'critical';
    if (ratio >= 5) return 'severe';
    if (ratio >= 3) return 'moderate';
    return 'minor';
  }

  private async identifySpikeCause(modelName: string, events: LatencyEvent[]): Promise<string> {
    // Simple cause identification based on patterns
    const highLatencyEvents = events.filter(e => e.latency > 5000);
    const errorEvents = events.filter(e => !e.success);
    
    if (errorEvents.length / events.length > 0.3) {
      return 'High error rate detected';
    }
    
    if (highLatencyEvents.length === events.length) {
      return 'Sustained high latency across all requests';
    }
    
    return 'Unknown cause - requires investigation';
  }

  private async getRegionalLatencyData(modelName: string): Promise<Array<{
    region: string;
    avgLatency: number;
    sampleCount: number;
  }>> {
    const events = this.getRecentEvents(modelName, '1h');
    const regionalData = new Map<string, number[]>();

    events.forEach(event => {
      if (event.region) {
        const existing = regionalData.get(event.region) || [];
        existing.push(event.latency);
        regionalData.set(event.region, existing);
      }
    });

    return Array.from(regionalData.entries()).map(([region, latencies]) => ({
      region,
      avgLatency: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      sampleCount: latencies.length
    }));
  }

  private cleanupOldData(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [modelName, events] of this.latencyData) {
      const filteredEvents = events.filter(event => event.timestamp >= cutoff);
      this.latencyData.set(modelName, filteredEvents);
    }

    // Clean up old spikes
    for (const [modelName, spikes] of this.spikeHistory) {
      const filteredSpikes = spikes.filter(spike => spike.startTime >= cutoff);
      this.spikeHistory.set(modelName, filteredSpikes);
    }

    Logger.debug('Cleaned up old latency data');
  }

  private getProviderFromModel(modelName: string): string {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    if (modelName.includes('mistral')) return 'mistral';
    if (modelName.includes('deepseek')) return 'deepseek';
    if (modelName.includes('llama')) return 'ollama';
    return 'unknown';
  }
}

// Export singleton instance
export const latencyMonitor = new LatencyMonitor();