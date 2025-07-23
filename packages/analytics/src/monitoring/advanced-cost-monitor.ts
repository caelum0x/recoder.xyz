/**
 * Advanced Cost Monitor with Real-time Tracking & Predictions
 * 
 * Comprehensive cost monitoring system with user attribution, predictive analytics,
 * and real-time budget enforcement for AI model usage optimization.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface CostMetrics {
  totalSpend: number;         // Total $ spent in timeframe
  costPerUser: number;        // Average cost per user
  costPerToken: number;       // Current average token pricing
  projectedMonthly: number;   // Projected monthly cost based on trends
  budgetUtilization: number;  // % of budget used
  costByModel: Record<string, number>;
  costByUser: Record<string, number>;
  costByProject: Record<string, number>;
  costByTaskType: Record<string, number>;
  trends: {
    daily: number[];          // Last 30 days spending
    hourly: number[];         // Last 24 hours spending
    weekly: number[];         // Last 12 weeks spending
  };
  efficiency: {
    costPerQualityPoint: number;     // Cost efficiency metric
    avgTokensPerRequest: number;     // Token usage efficiency
    modelEfficiencyRanking: Array<{
      model: string;
      costEfficiency: number;        // Lower is better
      qualityScore: number;
      usage: number;
    }>;
  };
  anomalies: CostAnomaly[];
}

export interface CostEvent {
  id: string;
  timestamp: Date;
  userId: string;
  projectId?: string;
  modelName: string;
  provider: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  qualityScore?: number;        // If available from quality assessment
  latency: number;
  region?: string;
  metadata: {
    requestId: string;
    agentType?: string;
    promptComplexity?: 'simple' | 'medium' | 'complex';
    cacheHit?: boolean;
    retryCount?: number;
  };
}

export interface CostAnomaly {
  id: string;
  type: 'spike' | 'unusual_pattern' | 'user_anomaly' | 'model_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  affectedEntity: {
    type: 'user' | 'model' | 'project' | 'system';
    id: string;
    name?: string;
  };
  metrics: {
    currentValue: number;
    expectedValue: number;
    deviation: number;        // Standard deviations from normal
    confidence: number;       // 0-1 confidence in anomaly
  };
  impact: {
    costImpact: number;       // Additional cost in USD
    timeframe: string;        // How long the anomaly has been occurring
    affectedRequests: number;
  };
  recommendations: string[];
  resolved: boolean;
  resolvedAt?: Date;
}

export interface UserSpendingProfile {
  userId: string;
  userName?: string;
  timeframe: string;
  totalSpend: number;
  averageRequestCost: number;
  requestCount: number;
  favoriteModels: Array<{
    model: string;
    usage: number;
    cost: number;
  }>;
  spendingPattern: {
    peakHours: number[];      // Hours of day with highest usage
    peakDays: number[];       // Days of week with highest usage
    seasonality: 'stable' | 'growing' | 'declining';
  };
  efficiency: {
    costPerQualityPoint: number;
    tokensPerDollar: number;
    avgLatency: number;
  };
  alerts: {
    budgetWarnings: number;
    anomalies: number;
    lastAlertDate?: Date;
  };
}

export interface ProjectCostBreakdown {
  projectId: string;
  projectName?: string;
  timeframe: string;
  totalCost: number;
  modelBreakdown: Record<string, {
    cost: number;
    requests: number;
    tokens: number;
    avgCostPerRequest: number;
  }>;
  userBreakdown: Record<string, {
    cost: number;
    requests: number;
    percentage: number;
  }>;
  taskBreakdown: Record<string, {
    cost: number;
    requests: number;
    avgCost: number;
  }>;
  trends: {
    dailySpend: number[];
    growth: number;           // % change from previous period
    forecast: number;         // Projected next period cost
  };
}

export class AdvancedCostMonitor extends EventEmitter {
  private costEvents: Map<string, CostEvent[]> = new Map(); // By user
  private userProfiles: Map<string, UserSpendingProfile> = new Map();
  private projectCosts: Map<string, ProjectCostBreakdown> = new Map();
  private anomalies: Map<string, CostAnomaly> = new Map();
  private modelPricing: Map<string, { input: number; output: number; lastUpdated: Date }> = new Map();
  
  private config = {
    maxEventsPerUser: 10000,    // Maximum events to store per user
    anomalyDetectionWindow: 3600000, // 1 hour window for anomaly detection
    anomalyThreshold: 2.0,      // Standard deviations for anomaly
    profileUpdateInterval: 300000, // 5 minutes
    forecastingWindow: 30,      // Days for forecasting
    qualityWeightInEfficiency: 0.4, // Weight of quality in efficiency calculation
  };

  private profileUpdateTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializePricing();
  }

  private initializePricing(): void {
    // Initialize with current model pricing
    this.modelPricing.set('claude-sonnet-4', { 
      input: 0.000003, output: 0.000015, lastUpdated: new Date() 
    });
    this.modelPricing.set('claude-haiku-3', { 
      input: 0.00000025, output: 0.00000125, lastUpdated: new Date() 
    });
    this.modelPricing.set('gpt-4-turbo', { 
      input: 0.00001, output: 0.00003, lastUpdated: new Date() 
    });
    this.modelPricing.set('gpt-4o', { 
      input: 0.000005, output: 0.000015, lastUpdated: new Date() 
    });
    this.modelPricing.set('gemini-2.5-pro', { 
      input: 0.00000125, output: 0.000005, lastUpdated: new Date() 
    });
    this.modelPricing.set('deepseek-v3', { 
      input: 0.00000027, output: 0.0000011, lastUpdated: new Date() 
    });

    Logger.info(`Initialized pricing for ${this.modelPricing.size} models`);
  }

  /**
   * Start advanced cost monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Advanced cost monitor is already running');
      return;
    }

    Logger.info('Starting advanced cost monitoring...');

    // Start profile updates
    this.profileUpdateTimer = setInterval(() => {
      this.updateUserProfiles();
      this.detectAnomalies();
    }, this.config.profileUpdateInterval);

    this.isRunning = true;
    this.emit('monitoringStarted');

    Logger.info('Advanced cost monitoring started successfully');
  }

  /**
   * Stop advanced cost monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping advanced cost monitoring...');

    if (this.profileUpdateTimer) {
      clearInterval(this.profileUpdateTimer);
      this.profileUpdateTimer = null;
    }

    this.isRunning = false;
    this.emit('monitoringStopped');

    Logger.info('Advanced cost monitoring stopped');
  }

  /**
   * Track usage with comprehensive attribution
   */
  async trackUsage(
    userId: string,
    modelName: string,
    inputTokens: number,
    outputTokens: number,
    options: {
      projectId?: string;
      taskType: string;
      qualityScore?: number;
      latency: number;
      requestId: string;
      agentType?: string;
      promptComplexity?: 'simple' | 'medium' | 'complex';
      region?: string;
      cacheHit?: boolean;
      retryCount?: number;
    }
  ): Promise<{ cost: number; efficiency: number }> {
    const pricing = this.modelPricing.get(modelName);
    if (!pricing) {
      Logger.warn(`No pricing data for model: ${modelName}`);
      return { cost: 0, efficiency: 0 };
    }

    const inputCost = inputTokens * pricing.input;
    const outputCost = outputTokens * pricing.output;
    const totalCost = inputCost + outputCost;

    const costEvent: CostEvent = {
      id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userId,
      projectId: options.projectId,
      modelName,
      provider: this.getProviderFromModel(modelName),
      taskType: options.taskType,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost,
      qualityScore: options.qualityScore,
      latency: options.latency,
      region: options.region,
      metadata: {
        requestId: options.requestId,
        agentType: options.agentType,
        promptComplexity: options.promptComplexity,
        cacheHit: options.cacheHit,
        retryCount: options.retryCount
      }
    };

    // Store the event
    const userEvents = this.costEvents.get(userId) || [];
    userEvents.push(costEvent);

    // Maintain event limit per user
    if (userEvents.length > this.config.maxEventsPerUser) {
      userEvents.splice(0, userEvents.length - this.config.maxEventsPerUser);
    }

    this.costEvents.set(userId, userEvents);

    // Calculate efficiency
    const efficiency = this.calculateEfficiency(costEvent);

    // Real-time anomaly detection for this event
    await this.checkEventForAnomalies(costEvent);

    // Emit cost tracking event
    this.emit('costTracked', {
      userId,
      modelName,
      cost: totalCost,
      efficiency,
      event: costEvent
    });

    Logger.debug(`Tracked usage: ${userId} - ${modelName} - $${totalCost.toFixed(4)}`);

    return { cost: totalCost, efficiency };
  }

  /**
   * Get comprehensive cost metrics
   */
  async getCostMetrics(timeRange: string = '24h'): Promise<CostMetrics> {
    const cutoff = this.getTimeRangeCutoff(timeRange);
    const allEvents = this.getAllEventsInRange(cutoff);

    if (allEvents.length === 0) {
      return this.getEmptyCostMetrics(timeRange);
    }

    // Calculate basic metrics
    const totalSpend = allEvents.reduce((sum, event) => sum + event.totalCost, 0);
    const uniqueUsers = new Set(allEvents.map(e => e.userId)).size;
    const costPerUser = uniqueUsers > 0 ? totalSpend / uniqueUsers : 0;
    const totalTokens = allEvents.reduce((sum, event) => sum + event.totalTokens, 0);
    const costPerToken = totalTokens > 0 ? totalSpend / totalTokens : 0;

    // Calculate cost breakdowns
    const costByModel = this.calculateCostByModel(allEvents);
    const costByUser = this.calculateCostByUser(allEvents);
    const costByProject = this.calculateCostByProject(allEvents);
    const costByTaskType = this.calculateCostByTaskType(allEvents);

    // Calculate trends
    const trends = await this.calculateCostTrends(timeRange);

    // Calculate efficiency metrics
    const efficiency = await this.calculateEfficiencyMetrics(allEvents);

    // Get current anomalies
    const anomalies = Array.from(this.anomalies.values())
      .filter(a => !a.resolved && Date.now() - a.detectedAt.getTime() < 24 * 60 * 60 * 1000);

    // Project monthly spending
    const projectedMonthly = await this.predictMonthlySpend();

    // Calculate budget utilization (would need budget data)
    const budgetUtilization = 0.75; // Placeholder

    return {
      totalSpend,
      costPerUser,
      costPerToken,
      projectedMonthly,
      budgetUtilization,
      costByModel,
      costByUser,
      costByProject,
      costByTaskType,
      trends,
      efficiency,
      anomalies
    };
  }

  /**
   * Predict monthly spending with trend analysis
   */
  async predictMonthlySpend(): Promise<number> {
    const last30Days = this.getAllEventsInRange(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    if (last30Days.length === 0) return 0;

    // Group by day
    const dailySpend = new Map<string, number>();
    last30Days.forEach(event => {
      const day = event.timestamp.toDateString();
      dailySpend.set(day, (dailySpend.get(day) || 0) + event.totalCost);
    });

    const spendingArray = Array.from(dailySpend.values());
    
    // Simple linear regression for trend
    const n = spendingArray.length;
    if (n < 7) {
      // Not enough data, use average
      const avgDaily = spendingArray.reduce((sum, val) => sum + val, 0) / n;
      return avgDaily * 30; // 30 days
    }

    // Calculate trend
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = spendingArray.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * spendingArray[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Project 30 days from the last data point
    const lastIndex = n - 1;
    const projectedDaily = intercept + slope * (lastIndex + 15); // Mid-month projection
    const projectedMonthly = Math.max(0, projectedDaily * 30);

    // Add seasonal adjustments (placeholder - would use historical data)
    const seasonalMultiplier = 1.1; // 10% seasonal increase
    
    return projectedMonthly * seasonalMultiplier;
  }

  /**
   * Optimize model selection for cost efficiency
   */
  async optimizeForCost(maxBudget: number): Promise<Array<{
    currentModel: string;
    recommendedModel: string;
    costSavings: number;
    qualityImpact: number;
    confidence: number;
  }>> {
    const recommendations = [];
    const recentEvents = this.getAllEventsInRange(
      new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    );

    // Group by model
    const modelUsage = new Map<string, CostEvent[]>();
    recentEvents.forEach(event => {
      const events = modelUsage.get(event.modelName) || [];
      events.push(event);
      modelUsage.set(event.modelName, events);
    });

    // Analyze each model for optimization opportunities
    for (const [modelName, events] of modelUsage) {
      const totalCost = events.reduce((sum, e) => sum + e.totalCost, 0);
      const avgQuality = events
        .filter(e => e.qualityScore !== undefined)
        .reduce((sum, e, _, arr) => sum + (e.qualityScore! / arr.length), 0) || 0.8;

      // Find cheaper alternatives
      const alternatives = await this.findCheaperAlternatives(modelName, avgQuality);
      
      for (const alt of alternatives) {
        if (alt.costSavings > 0 && alt.qualityImpact < 0.1) { // Less than 10% quality loss
          recommendations.push({
            currentModel: modelName,
            recommendedModel: alt.model,
            costSavings: alt.costSavings * events.length, // Total savings for this usage
            qualityImpact: alt.qualityImpact,
            confidence: alt.confidence
          });
        }
      }
    }

    return recommendations.sort((a, b) => b.costSavings - a.costSavings);
  }

  /**
   * Get detailed user spending profile
   */
  async getUserSpendingProfile(userId: string, timeframe: string = '30d'): Promise<UserSpendingProfile | null> {
    const cached = this.userProfiles.get(userId);
    if (cached && cached.timeframe === timeframe) {
      return cached;
    }

    const cutoff = this.getTimeRangeCutoff(timeframe);
    const userEvents = (this.costEvents.get(userId) || [])
      .filter(event => event.timestamp >= cutoff);

    if (userEvents.length === 0) {
      return null;
    }

    const profile = await this.buildUserProfile(userId, userEvents, timeframe);
    this.userProfiles.set(userId, profile);
    
    return profile;
  }

  /**
   * Get project cost breakdown
   */
  async getProjectCostBreakdown(projectId: string, timeframe: string = '30d'): Promise<ProjectCostBreakdown | null> {
    const cutoff = this.getTimeRangeCutoff(timeframe);
    const projectEvents = this.getAllEventsInRange(cutoff)
      .filter(event => event.projectId === projectId);

    if (projectEvents.length === 0) {
      return null;
    }

    return this.buildProjectBreakdown(projectId, projectEvents, timeframe);
  }

  /**
   * Alert on budget threshold
   */
  async alertOnBudgetThreshold(threshold: number, timeframe: string = '24h'): Promise<void> {
    const metrics = await this.getCostMetrics(timeframe);
    
    if (metrics.totalSpend >= threshold) {
      const alert = {
        type: 'budget_threshold',
        severity: 'high' as const,
        message: `Budget threshold of $${threshold} exceeded. Current spend: $${metrics.totalSpend.toFixed(2)}`,
        timeframe,
        currentSpend: metrics.totalSpend,
        threshold,
        overage: metrics.totalSpend - threshold
      };

      this.emit('budgetAlert', alert);
      Logger.warn(`Budget threshold alert: $${metrics.totalSpend.toFixed(2)} >= $${threshold}`);
    }
  }

  // Private helper methods

  private calculateEfficiency(event: CostEvent): number {
    const baseEfficiency = event.totalTokens / event.totalCost; // tokens per dollar
    
    // Adjust for quality if available
    if (event.qualityScore) {
      const qualityWeight = this.config.qualityWeightInEfficiency;
      return baseEfficiency * (1 + qualityWeight * (event.qualityScore - 0.5));
    }
    
    return baseEfficiency;
  }

  private async checkEventForAnomalies(event: CostEvent): Promise<void> {
    // Check for unusually high cost per request
    const userEvents = this.costEvents.get(event.userId) || [];
    const recentEvents = userEvents.filter(e => 
      Date.now() - e.timestamp.getTime() < this.config.anomalyDetectionWindow
    );

    if (recentEvents.length < 10) return; // Need baseline data

    const costs = recentEvents.map(e => e.totalCost);
    const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - mean, 2), 0) / costs.length;
    const stdDev = Math.sqrt(variance);

    const deviation = Math.abs(event.totalCost - mean) / stdDev;

    if (deviation > this.config.anomalyThreshold) {
      const anomaly: CostAnomaly = {
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: event.totalCost > mean * 2 ? 'spike' : 'unusual_pattern',
        severity: deviation > 4 ? 'critical' : deviation > 3 ? 'high' : 'medium',
        description: `Unusual cost detected for user ${event.userId}: $${event.totalCost.toFixed(4)} (${deviation.toFixed(1)}σ from normal)`,
        detectedAt: new Date(),
        affectedEntity: {
          type: 'user',
          id: event.userId
        },
        metrics: {
          currentValue: event.totalCost,
          expectedValue: mean,
          deviation: deviation,
          confidence: Math.min(0.99, deviation / 5)
        },
        impact: {
          costImpact: event.totalCost - mean,
          timeframe: '5m',
          affectedRequests: 1
        },
        recommendations: [
          'Review request parameters and input size',
          'Check for model selection appropriateness',
          'Investigate potential prompt injection or misuse'
        ],
        resolved: false
      };

      this.anomalies.set(anomaly.id, anomaly);
      this.emit('anomalyDetected', anomaly);
    }
  }

  private getTimeRangeCutoff(timeRange: string): Date {
    const now = new Date();
    const match = timeRange.match(/^(\d+)([mhd])$/);
    
    if (!match) return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default 24h

    const value = parseInt(match[1]);
    const unit = match[2];
    let milliseconds = 0;

    switch (unit) {
      case 'm': milliseconds = value * 60 * 1000; break;
      case 'h': milliseconds = value * 60 * 60 * 1000; break;
      case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
    }

    return new Date(now.getTime() - milliseconds);
  }

  private getAllEventsInRange(cutoff: Date): CostEvent[] {
    const allEvents: CostEvent[] = [];
    
    for (const events of this.costEvents.values()) {
      allEvents.push(...events.filter(event => event.timestamp >= cutoff));
    }
    
    return allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateCostByModel(events: CostEvent[]): Record<string, number> {
    const costs: Record<string, number> = {};
    events.forEach(event => {
      costs[event.modelName] = (costs[event.modelName] || 0) + event.totalCost;
    });
    return costs;
  }

  private calculateCostByUser(events: CostEvent[]): Record<string, number> {
    const costs: Record<string, number> = {};
    events.forEach(event => {
      costs[event.userId] = (costs[event.userId] || 0) + event.totalCost;
    });
    return costs;
  }

  private calculateCostByProject(events: CostEvent[]): Record<string, number> {
    const costs: Record<string, number> = {};
    events.forEach(event => {
      if (event.projectId) {
        costs[event.projectId] = (costs[event.projectId] || 0) + event.totalCost;
      }
    });
    return costs;
  }

  private calculateCostByTaskType(events: CostEvent[]): Record<string, number> {
    const costs: Record<string, number> = {};
    events.forEach(event => {
      costs[event.taskType] = (costs[event.taskType] || 0) + event.totalCost;
    });
    return costs;
  }

  private async calculateCostTrends(timeRange: string): Promise<{
    daily: number[];
    hourly: number[];
    weekly: number[];
  }> {
    // Get last 30 days for daily trend
    const last30Days = this.getAllEventsInRange(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    const dailyTrend = new Array(30).fill(0);
    last30Days.forEach(event => {
      const daysAgo = Math.floor((Date.now() - event.timestamp.getTime()) / (24 * 60 * 60 * 1000));
      if (daysAgo < 30) {
        dailyTrend[29 - daysAgo] += event.totalCost;
      }
    });

    // Get last 24 hours for hourly trend
    const last24Hours = this.getAllEventsInRange(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    
    const hourlyTrend = new Array(24).fill(0);
    last24Hours.forEach(event => {
      const hoursAgo = Math.floor((Date.now() - event.timestamp.getTime()) / (60 * 60 * 1000));
      if (hoursAgo < 24) {
        hourlyTrend[23 - hoursAgo] += event.totalCost;
      }
    });

    // Get last 12 weeks for weekly trend
    const last12Weeks = this.getAllEventsInRange(
      new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000)
    );
    
    const weeklyTrend = new Array(12).fill(0);
    last12Weeks.forEach(event => {
      const weeksAgo = Math.floor((Date.now() - event.timestamp.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksAgo < 12) {
        weeklyTrend[11 - weeksAgo] += event.totalCost;
      }
    });

    return {
      daily: dailyTrend,
      hourly: hourlyTrend,
      weekly: weeklyTrend
    };
  }

  private async calculateEfficiencyMetrics(events: CostEvent[]): Promise<CostMetrics['efficiency']> {
    const qualityEvents = events.filter(e => e.qualityScore !== undefined);
    const avgQuality = qualityEvents.length > 0
      ? qualityEvents.reduce((sum, e) => sum + e.qualityScore!, 0) / qualityEvents.length
      : 0.8;

    const totalCost = events.reduce((sum, e) => sum + e.totalCost, 0);
    const costPerQualityPoint = totalCost / (avgQuality * events.length);

    const avgTokensPerRequest = events.length > 0
      ? events.reduce((sum, e) => sum + e.totalTokens, 0) / events.length
      : 0;

    // Calculate model efficiency ranking
    const modelStats = new Map<string, { cost: number; quality: number; usage: number }>();
    events.forEach(event => {
      const existing = modelStats.get(event.modelName) || { cost: 0, quality: 0, usage: 0 };
      existing.cost += event.totalCost;
      existing.quality += event.qualityScore || 0.8;
      existing.usage += 1;
      modelStats.set(event.modelName, existing);
    });

    const modelEfficiencyRanking = Array.from(modelStats.entries())
      .map(([model, stats]) => ({
        model,
        costEfficiency: stats.cost / (stats.quality / stats.usage), // Lower is better
        qualityScore: stats.quality / stats.usage,
        usage: stats.usage
      }))
      .sort((a, b) => a.costEfficiency - b.costEfficiency);

    return {
      costPerQualityPoint,
      avgTokensPerRequest,
      modelEfficiencyRanking
    };
  }

  private getEmptyCostMetrics(timeRange: string): CostMetrics {
    return {
      totalSpend: 0,
      costPerUser: 0,
      costPerToken: 0,
      projectedMonthly: 0,
      budgetUtilization: 0,
      costByModel: {},
      costByUser: {},
      costByProject: {},
      costByTaskType: {},
      trends: {
        daily: new Array(30).fill(0),
        hourly: new Array(24).fill(0),
        weekly: new Array(12).fill(0)
      },
      efficiency: {
        costPerQualityPoint: 0,
        avgTokensPerRequest: 0,
        modelEfficiencyRanking: []
      },
      anomalies: []
    };
  }

  private async findCheaperAlternatives(modelName: string, targetQuality: number): Promise<Array<{
    model: string;
    costSavings: number;
    qualityImpact: number;
    confidence: number;
  }>> {
    const alternatives = [];
    const currentPricing = this.modelPricing.get(modelName);
    if (!currentPricing) return alternatives;

    const currentAvgCost = (currentPricing.input + currentPricing.output) / 2;

    for (const [altModel, altPricing] of this.modelPricing) {
      if (altModel === modelName) continue;

      const altAvgCost = (altPricing.input + altPricing.output) / 2;
      const costSavings = currentAvgCost - altAvgCost;

      if (costSavings > 0) {
        // Estimate quality impact (this would use actual quality data in production)
        const qualityImpact = this.estimateQualityImpact(modelName, altModel);
        const confidence = this.calculateAlternativeConfidence(modelName, altModel);

        alternatives.push({
          model: altModel,
          costSavings,
          qualityImpact,
          confidence
        });
      }
    }

    return alternatives.sort((a, b) => b.costSavings - a.costSavings);
  }

  private estimateQualityImpact(currentModel: string, alternativeModel: string): number {
    // Simplified quality impact estimation
    const qualityTiers = new Map([
      ['claude-sonnet-4', 5],
      ['gpt-4-turbo', 5],
      ['gpt-4o', 4.5],
      ['gemini-2.5-pro', 4],
      ['claude-haiku-3', 3.5],
      ['deepseek-v3', 4.5], // High for coding tasks
    ]);

    const currentTier = qualityTiers.get(currentModel) || 3;
    const altTier = qualityTiers.get(alternativeModel) || 3;

    return Math.max(0, (currentTier - altTier) / currentTier);
  }

  private calculateAlternativeConfidence(currentModel: string, alternativeModel: string): number {
    // Confidence based on usage patterns and model characteristics
    const confidenceMap = new Map([
      ['claude-sonnet-4_claude-haiku-3', 0.8],
      ['gpt-4-turbo_gpt-4o', 0.9],
      ['claude-sonnet-4_deepseek-v3', 0.7], // For coding tasks
    ]);

    const key = `${currentModel}_${alternativeModel}`;
    return confidenceMap.get(key) || 0.6;
  }

  private async buildUserProfile(userId: string, events: CostEvent[], timeframe: string): Promise<UserSpendingProfile> {
    const totalSpend = events.reduce((sum, e) => sum + e.totalCost, 0);
    const requestCount = events.length;
    const averageRequestCost = requestCount > 0 ? totalSpend / requestCount : 0;

    // Favorite models
    const modelUsage = new Map<string, { usage: number; cost: number }>();
    events.forEach(event => {
      const existing = modelUsage.get(event.modelName) || { usage: 0, cost: 0 };
      existing.usage += 1;
      existing.cost += event.totalCost;
      modelUsage.set(event.modelName, existing);
    });

    const favoriteModels = Array.from(modelUsage.entries())
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);

    // Spending patterns
    const hourlyUsage = new Array(24).fill(0);
    const dailyUsage = new Array(7).fill(0);
    
    events.forEach(event => {
      hourlyUsage[event.timestamp.getHours()]++;
      dailyUsage[event.timestamp.getDay()]++;
    });

    const peakHours = hourlyUsage
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.hour);

    const peakDays = dailyUsage
      .map((count, day) => ({ day, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map(item => item.day);

    // Efficiency metrics
    const qualityEvents = events.filter(e => e.qualityScore !== undefined);
    const avgQuality = qualityEvents.length > 0
      ? qualityEvents.reduce((sum, e) => sum + e.qualityScore!, 0) / qualityEvents.length
      : 0.8;

    const costPerQualityPoint = totalSpend / (avgQuality * requestCount);
    const tokensPerDollar = totalSpend > 0 
      ? events.reduce((sum, e) => sum + e.totalTokens, 0) / totalSpend 
      : 0;
    const avgLatency = events.reduce((sum, e) => sum + e.latency, 0) / requestCount;

    return {
      userId,
      timeframe,
      totalSpend,
      averageRequestCost,
      requestCount,
      favoriteModels,
      spendingPattern: {
        peakHours,
        peakDays,
        seasonality: 'stable' // Would analyze historical data
      },
      efficiency: {
        costPerQualityPoint,
        tokensPerDollar,
        avgLatency
      },
      alerts: {
        budgetWarnings: 0, // Would track from budget system
        anomalies: Array.from(this.anomalies.values())
          .filter(a => a.affectedEntity.id === userId && !a.resolved).length,
        lastAlertDate: undefined
      }
    };
  }

  private async buildProjectBreakdown(projectId: string, events: CostEvent[], timeframe: string): Promise<ProjectCostBreakdown> {
    const totalCost = events.reduce((sum, e) => sum + e.totalCost, 0);

    // Model breakdown
    const modelBreakdown: Record<string, any> = {};
    events.forEach(event => {
      if (!modelBreakdown[event.modelName]) {
        modelBreakdown[event.modelName] = {
          cost: 0,
          requests: 0,
          tokens: 0,
          avgCostPerRequest: 0
        };
      }
      const model = modelBreakdown[event.modelName];
      model.cost += event.totalCost;
      model.requests += 1;
      model.tokens += event.totalTokens;
      model.avgCostPerRequest = model.cost / model.requests;
    });

    // User breakdown
    const userCosts = new Map<string, { cost: number; requests: number }>();
    events.forEach(event => {
      const existing = userCosts.get(event.userId) || { cost: 0, requests: 0 };
      existing.cost += event.totalCost;
      existing.requests += 1;
      userCosts.set(event.userId, existing);
    });

    const userBreakdown: Record<string, any> = {};
    userCosts.forEach((stats, userId) => {
      userBreakdown[userId] = {
        ...stats,
        percentage: (stats.cost / totalCost) * 100
      };
    });

    // Task breakdown
    const taskBreakdown: Record<string, any> = {};
    events.forEach(event => {
      if (!taskBreakdown[event.taskType]) {
        taskBreakdown[event.taskType] = {
          cost: 0,
          requests: 0,
          avgCost: 0
        };
      }
      const task = taskBreakdown[event.taskType];
      task.cost += event.totalCost;
      task.requests += 1;
      task.avgCost = task.cost / task.requests;
    });

    // Daily spending trend
    const dailySpend = new Array(30).fill(0);
    events.forEach(event => {
      const daysAgo = Math.floor((Date.now() - event.timestamp.getTime()) / (24 * 60 * 60 * 1000));
      if (daysAgo < 30) {
        dailySpend[29 - daysAgo] += event.totalCost;
      }
    });

    return {
      projectId,
      timeframe,
      totalCost,
      modelBreakdown,
      userBreakdown,
      taskBreakdown,
      trends: {
        dailySpend,
        growth: 0, // Would calculate from historical data
        forecast: totalCost * 1.1 // Simple 10% growth projection
      }
    };
  }

  private async updateUserProfiles(): Promise<void> {
    // Update profiles for active users
    for (const [userId] of this.costEvents) {
      await this.getUserSpendingProfile(userId, '30d');
    }
  }

  private async detectAnomalies(): Promise<void> {
    // System-wide anomaly detection
    const recentEvents = this.getAllEventsInRange(
      new Date(Date.now() - this.config.anomalyDetectionWindow)
    );

    // Detect spending spikes
    await this.detectSpendingSpikes(recentEvents);
    
    // Detect unusual model usage patterns
    await this.detectModelUsageAnomalies(recentEvents);
    
    // Detect user behavior anomalies
    await this.detectUserBehaviorAnomalies(recentEvents);
  }

  private async detectSpendingSpikes(events: CostEvent[]): Promise<void> {
    // Implementation for system-wide spending spike detection
    const totalSpend = events.reduce((sum, e) => sum + e.totalCost, 0);
    const hourlySpend = totalSpend / (this.config.anomalyDetectionWindow / 3600000);
    
    // Would compare against historical hourly spend patterns
    Logger.debug(`Current hourly spend rate: $${hourlySpend.toFixed(4)}`);
  }

  private async detectModelUsageAnomalies(events: CostEvent[]): Promise<void> {
    // Implementation for model usage anomaly detection
    const modelUsage = new Map<string, number>();
    events.forEach(event => {
      modelUsage.set(event.modelName, (modelUsage.get(event.modelName) || 0) + 1);
    });
    
    Logger.debug(`Model usage distribution:`, Object.fromEntries(modelUsage));
  }

  private async detectUserBehaviorAnomalies(events: CostEvent[]): Promise<void> {
    // Implementation for user behavior anomaly detection
    const userActivity = new Map<string, number>();
    events.forEach(event => {
      userActivity.set(event.userId, (userActivity.get(event.userId) || 0) + event.totalCost);
    });
    
    // Find users with unusually high activity
    const sortedUsers = Array.from(userActivity.entries())
      .sort((a, b) => b[1] - a[1]);
    
    if (sortedUsers.length > 0) {
      const topUser = sortedUsers[0];
      const totalSystemSpend = events.reduce((sum, e) => sum + e.totalCost, 0);
      
      if (topUser[1] / totalSystemSpend > 0.5) { // Single user > 50% of spend
        Logger.debug(`High-spend user detected: ${topUser[0]} ($${topUser[1].toFixed(4)})`);
      }
    }
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
export const advancedCostMonitor = new AdvancedCostMonitor();