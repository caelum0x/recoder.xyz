/**
 * Real-time Cost Monitoring & Budget Management
 * 
 * Tracks AI model costs in real-time, monitors pricing changes, enforces budgets,
 * and provides cost optimization recommendations.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface CostMetrics {
  modelName: string;
  provider: string;
  currentRate: number;        // Cost per token
  totalCost: number;          // Total cost in timeframe
  requestCount: number;       // Number of requests
  tokenCount: number;         // Total tokens processed
  averageCostPerRequest: number;
  costTrend: 'increasing' | 'decreasing' | 'stable';
  timeframe: string;
  lastUpdated: Date;
}

export interface CostEvent {
  modelName: string;
  provider: string;
  requestId: string;
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  rateUsed: number;           // Rate at time of request
  taskType?: string;
  userId?: string;
  region?: string;
}

export interface BudgetAlert {
  type: 'budget_exceeded' | 'budget_warning' | 'rate_increase' | 'usage_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  modelName?: string;
  threshold: number;
  current: number;
  timeframe: string;
  timestamp: Date;
  message: string;
  recommendedActions: string[];
}

export interface BudgetConfiguration {
  modelName?: string;         // Specific model or null for overall
  provider?: string;          // Specific provider or null for overall
  budgetType: 'daily' | 'weekly' | 'monthly' | 'per_request';
  amount: number;             // Budget amount in USD
  warningThreshold: number;   // Warning at % of budget (0.8 = 80%)
  hardLimit: boolean;         // Stop requests when exceeded
  rollover: boolean;          // Roll unused budget to next period
  notifications: string[];    // Email addresses for alerts
  active: boolean;
}

export interface PricingData {
  modelName: string;
  provider: string;
  inputTokenPrice: number;    // Price per input token
  outputTokenPrice: number;   // Price per output token
  minimumCharge?: number;
  batchDiscount?: number;
  effectiveDate: Date;
  source: 'api' | 'manual' | 'estimated';
}

export interface CostOptimization {
  currentModel: string;
  recommendation: string;
  alternativeModel?: string;
  estimatedSavings: number;   // USD per day
  savingsPercentage: number;  // % cost reduction
  tradeoffs: string[];        // What you might lose
  confidence: number;         // 0-1 confidence in recommendation
}

export class CostTracker extends EventEmitter {
  private costEvents: Map<string, CostEvent[]> = new Map();
  private budgetConfigs: Map<string, BudgetConfiguration> = new Map();
  private pricingData: Map<string, PricingData> = new Map();
  private activeAlerts: Map<string, BudgetAlert> = new Map();
  
  private config = {
    maxEventHistory: 50000,     // Maximum cost events to store
    budgetCheckInterval: 60000, // Check budgets every minute
    pricingUpdateInterval: 3600000, // Update pricing every hour
    costAggregationWindow: 86400000, // 24 hours for daily metrics
  };

  private budgetCheckTimer: NodeJS.Timeout | null = null;
  private pricingUpdateTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializePricing();
    this.initializeDefaultBudgets();
  }

  private initializePricing(): void {
    // Initialize with current known pricing (as of implementation)
    const initialPricing: PricingData[] = [
      {
        modelName: 'claude-sonnet-4',
        provider: 'anthropic',
        inputTokenPrice: 0.000003,   // $3 per million tokens
        outputTokenPrice: 0.000015,  // $15 per million tokens
        effectiveDate: new Date(),
        source: 'manual'
      },
      {
        modelName: 'claude-haiku-3',
        provider: 'anthropic',
        inputTokenPrice: 0.00000025, // $0.25 per million tokens
        outputTokenPrice: 0.00000125, // $1.25 per million tokens
        effectiveDate: new Date(),
        source: 'manual'
      },
      {
        modelName: 'gpt-4-turbo',
        provider: 'openai',
        inputTokenPrice: 0.00001,    // $10 per million tokens
        outputTokenPrice: 0.00003,   // $30 per million tokens
        effectiveDate: new Date(),
        source: 'manual'
      },
      {
        modelName: 'gpt-4o',
        provider: 'openai',
        inputTokenPrice: 0.000005,   // $5 per million tokens
        outputTokenPrice: 0.000015,  // $15 per million tokens
        effectiveDate: new Date(),
        source: 'manual'
      },
      {
        modelName: 'gemini-2.5-pro',
        provider: 'google',
        inputTokenPrice: 0.00000125, // $1.25 per million tokens
        outputTokenPrice: 0.000005,  // $5 per million tokens
        effectiveDate: new Date(),
        source: 'manual'
      },
      {
        modelName: 'deepseek-v3',
        provider: 'deepseek',
        inputTokenPrice: 0.00000027, // $0.27 per million tokens
        outputTokenPrice: 0.0000011,  // $1.1 per million tokens
        effectiveDate: new Date(),
        source: 'manual'
      }
    ];

    initialPricing.forEach(pricing => {
      this.pricingData.set(pricing.modelName, pricing);
    });

    Logger.info(`Initialized pricing data for ${initialPricing.length} models`);
  }

  private initializeDefaultBudgets(): void {
    // Set default budgets
    const defaultBudgets: BudgetConfiguration[] = [
      {
        budgetType: 'daily',
        amount: 100, // $100 per day total
        warningThreshold: 0.8,
        hardLimit: false,
        rollover: true,
        notifications: [],
        active: true
      },
      {
        budgetType: 'monthly',
        amount: 2000, // $2000 per month total
        warningThreshold: 0.9,
        hardLimit: true,
        rollover: false,
        notifications: [],
        active: true
      }
    ];

    defaultBudgets.forEach((budget, index) => {
      this.budgetConfigs.set(`default_${index}`, budget);
    });

    Logger.info(`Initialized ${defaultBudgets.length} default budget configurations`);
  }

  /**
   * Start cost tracking and monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Cost tracker is already running');
      return;
    }

    Logger.info('Starting cost tracking...');

    // Start budget monitoring
    this.budgetCheckTimer = setInterval(() => {
      this.checkBudgets();
    }, this.config.budgetCheckInterval);

    // Start pricing updates
    this.pricingUpdateTimer = setInterval(() => {
      this.updatePricing();
    }, this.config.pricingUpdateInterval);

    this.isRunning = true;
    this.emit('trackingStarted');

    // Perform initial checks
    await this.checkBudgets();
    await this.updatePricing();

    Logger.info('Cost tracking started successfully');
  }

  /**
   * Stop cost tracking
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping cost tracking...');

    if (this.budgetCheckTimer) {
      clearInterval(this.budgetCheckTimer);
      this.budgetCheckTimer = null;
    }

    if (this.pricingUpdateTimer) {
      clearInterval(this.pricingUpdateTimer);
      this.pricingUpdateTimer = null;
    }

    this.isRunning = false;
    this.emit('trackingStopped');

    Logger.info('Cost tracking stopped');
  }

  /**
   * Track a cost event from a model request
   */
  async trackCost(
    modelName: string,
    requestId: string,
    inputTokens: number,
    outputTokens: number,
    options?: {
      taskType?: string;
      userId?: string;
      region?: string;
    }
  ): Promise<number> {
    const pricing = this.pricingData.get(modelName);
    if (!pricing) {
      Logger.warn(`No pricing data for model: ${modelName}`);
      return 0;
    }

    const inputCost = inputTokens * pricing.inputTokenPrice;
    const outputCost = outputTokens * pricing.outputTokenPrice;
    const totalCost = inputCost + outputCost;

    const costEvent: CostEvent = {
      modelName,
      provider: pricing.provider,
      requestId,
      timestamp: new Date(),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost: totalCost,
      rateUsed: (inputCost + outputCost) / (inputTokens + outputTokens),
      ...options
    };

    // Store the event
    const modelEvents = this.costEvents.get(modelName) || [];
    modelEvents.push(costEvent);

    // Maintain history limit
    if (modelEvents.length > this.config.maxEventHistory) {
      modelEvents.splice(0, modelEvents.length - this.config.maxEventHistory);
    }

    this.costEvents.set(modelName, modelEvents);

    // Check for budget alerts
    await this.checkCostThresholds(modelName, totalCost);

    Logger.debug(`Tracked cost for ${modelName}: $${totalCost.toFixed(4)}`);
    
    return totalCost;
  }

  /**
   * Get cost metrics for a model over a time period
   */
  async getCostMetrics(modelName: string, timeframe: string = '24h'): Promise<CostMetrics> {
    const events = this.getRecentCostEvents(modelName, timeframe);
    
    if (events.length === 0) {
      const pricing = this.pricingData.get(modelName);
      return {
        modelName,
        provider: pricing?.provider || 'unknown',
        currentRate: pricing?.inputTokenPrice || 0,
        totalCost: 0,
        requestCount: 0,
        tokenCount: 0,
        averageCostPerRequest: 0,
        costTrend: 'stable',
        timeframe,
        lastUpdated: new Date()
      };
    }

    const totalCost = events.reduce((sum, event) => sum + event.cost, 0);
    const tokenCount = events.reduce((sum, event) => sum + event.totalTokens, 0);
    const requestCount = events.length;
    const averageCostPerRequest = totalCost / requestCount;
    const currentRate = events[events.length - 1]?.rateUsed || 0;

    // Analyze cost trend
    const costTrend = await this.analyzeCostTrend(events);

    return {
      modelName,
      provider: events[0].provider,
      currentRate,
      totalCost,
      requestCount,
      tokenCount,
      averageCostPerRequest,
      costTrend,
      timeframe,
      lastUpdated: new Date()
    };
  }

  /**
   * Get comprehensive cost report across all models
   */
  async getCostReport(timeframe: string = '24h'): Promise<{
    totalCost: number;
    modelBreakdown: CostMetrics[];
    topCostModels: Array<{ modelName: string; cost: number; percentage: number }>;
    budgetStatus: Array<{ budgetId: string; used: number; remaining: number; status: string }>;
  }> {
    const modelNames = Array.from(this.costEvents.keys());
    const modelMetrics = await Promise.all(
      modelNames.map(name => this.getCostMetrics(name, timeframe))
    );

    const totalCost = modelMetrics.reduce((sum, metrics) => sum + metrics.totalCost, 0);

    // Sort by cost descending
    const topCostModels = modelMetrics
      .filter(m => m.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .map(metrics => ({
        modelName: metrics.modelName,
        cost: metrics.totalCost,
        percentage: totalCost > 0 ? (metrics.totalCost / totalCost) * 100 : 0
      }));

    // Budget status
    const budgetStatus = await this.getBudgetStatus();

    return {
      totalCost,
      modelBreakdown: modelMetrics,
      topCostModels,
      budgetStatus
    };
  }

  /**
   * Set or update a budget configuration
   */
  async setBudget(budgetId: string, config: BudgetConfiguration): Promise<void> {
    this.budgetConfigs.set(budgetId, { ...config, active: true });
    Logger.info(`Set budget ${budgetId}: ${config.budgetType} $${config.amount}`);
    
    // Immediate budget check
    await this.checkBudgets();
  }

  /**
   * Get current budget status
   */
  async getBudgetStatus(): Promise<Array<{
    budgetId: string;
    config: BudgetConfiguration;
    used: number;
    remaining: number;
    percentage: number;
    status: 'ok' | 'warning' | 'exceeded';
  }>> {
    const statuses = [];

    for (const [budgetId, config] of this.budgetConfigs) {
      if (!config.active) continue;

      const used = await this.calculateBudgetUsage(config);
      const remaining = Math.max(0, config.amount - used);
      const percentage = (used / config.amount) * 100;

      let status: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (percentage >= 100) status = 'exceeded';
      else if (percentage >= config.warningThreshold * 100) status = 'warning';

      statuses.push({
        budgetId,
        config,
        used,
        remaining,
        percentage,
        status
      });
    }

    return statuses;
  }

  /**
   * Get cost optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<CostOptimization[]> {
    const recommendations: CostOptimization[] = [];
    const modelMetrics = await Promise.all(
      Array.from(this.costEvents.keys()).map(name => this.getCostMetrics(name, '24h'))
    );

    // Sort by daily cost to focus on highest impact
    const highCostModels = modelMetrics
      .filter(m => m.totalCost > 5) // Focus on models costing >$5/day
      .sort((a, b) => b.totalCost - a.totalCost);

    for (const metrics of highCostModels) {
      const alternatives = await this.findCostEffectiveAlternatives(metrics.modelName);
      
      for (const alternative of alternatives) {
        const currentDailyCost = metrics.totalCost;
        const alternativeCost = await this.estimateAlternativeCost(
          metrics.modelName,
          alternative.modelName,
          metrics.tokenCount
        );
        
        if (alternativeCost < currentDailyCost * 0.8) { // 20% savings threshold
          const savings = currentDailyCost - alternativeCost;
          const savingsPercentage = (savings / currentDailyCost) * 100;

          recommendations.push({
            currentModel: metrics.modelName,
            recommendation: `Switch to ${alternative.modelName} for similar performance at lower cost`,
            alternativeModel: alternative.modelName,
            estimatedSavings: savings,
            savingsPercentage,
            tradeoffs: alternative.tradeoffs,
            confidence: alternative.confidence
          });
        }
      }

      // Check for usage optimization
      if (metrics.averageCostPerRequest > 0.10) { // $0.10 per request threshold
        recommendations.push({
          currentModel: metrics.modelName,
          recommendation: 'Optimize request complexity to reduce token usage',
          estimatedSavings: metrics.totalCost * 0.3, // Estimated 30% reduction
          savingsPercentage: 30,
          tradeoffs: ['May require prompt engineering', 'Possible slight quality reduction'],
          confidence: 0.7
        });
      }
    }

    return recommendations.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  }

  /**
   * Update pricing data from external sources
   */
  async updatePricing(): Promise<void> {
    try {
      // In a real implementation, this would fetch from provider APIs
      Logger.debug('Updating pricing data from external sources...');
      
      // For now, just log that we checked
      this.emit('pricingUpdated', new Date());
    } catch (error) {
      Logger.error('Failed to update pricing data:', error);
    }
  }

  // Private helper methods

  private getRecentCostEvents(modelName: string, timeframe: string): CostEvent[] {
    const events = this.costEvents.get(modelName) || [];
    const cutoff = this.getTimeframeCutoff(timeframe);
    
    return events.filter(event => event.timestamp >= cutoff);
  }

  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    const match = timeframe.match(/^(\d+)([mhd])$/);
    
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

  private async analyzeCostTrend(events: CostEvent[]): Promise<'increasing' | 'decreasing' | 'stable'> {
    if (events.length < 10) return 'stable';

    // Simple trend analysis based on cost per token over time
    const first10 = events.slice(0, 10).map(e => e.rateUsed);
    const last10 = events.slice(-10).map(e => e.rateUsed);

    const firstAvg = first10.reduce((sum, rate) => sum + rate, 0) / first10.length;
    const lastAvg = last10.reduce((sum, rate) => sum + rate, 0) / last10.length;

    const change = (lastAvg - firstAvg) / firstAvg;

    if (change > 0.05) return 'increasing';
    if (change < -0.05) return 'decreasing';
    return 'stable';
  }

  private async calculateBudgetUsage(config: BudgetConfiguration): Promise<number> {
    const now = new Date();
    let cutoff: Date;

    switch (config.budgetType) {
      case 'daily':
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        cutoff = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        cutoff.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    let totalCost = 0;

    for (const [modelName, events] of this.costEvents) {
      // Filter by model/provider if specified
      if (config.modelName && modelName !== config.modelName) continue;
      if (config.provider) {
        const pricing = this.pricingData.get(modelName);
        if (pricing?.provider !== config.provider) continue;
      }

      const relevantEvents = events.filter(event => event.timestamp >= cutoff);
      totalCost += relevantEvents.reduce((sum, event) => sum + event.cost, 0);
    }

    return totalCost;
  }

  private async checkBudgets(): Promise<void> {
    const budgetStatuses = await this.getBudgetStatus();

    for (const status of budgetStatuses) {
      const alertKey = `budget_${status.budgetId}`;

      if (status.status === 'exceeded' && !this.activeAlerts.has(alertKey)) {
        const alert: BudgetAlert = {
          type: 'budget_exceeded',
          severity: 'critical',
          threshold: status.config.amount,
          current: status.used,
          timeframe: status.config.budgetType,
          timestamp: new Date(),
          message: `Budget exceeded: $${status.used.toFixed(2)} / $${status.config.amount}`,
          recommendedActions: [
            'Review recent high-cost requests',
            'Consider switching to more cost-effective models',
            'Implement request rate limiting'
          ]
        };

        this.activeAlerts.set(alertKey, alert);
        this.emit('budgetAlert', alert);

      } else if (status.status === 'warning' && !this.activeAlerts.has(alertKey)) {
        const alert: BudgetAlert = {
          type: 'budget_warning',
          severity: 'medium',
          threshold: status.config.amount * status.config.warningThreshold,
          current: status.used,
          timeframe: status.config.budgetType,
          timestamp: new Date(),
          message: `Budget warning: ${status.percentage.toFixed(1)}% of ${status.config.budgetType} budget used`,
          recommendedActions: [
            'Monitor usage closely',
            'Consider cost optimization strategies'
          ]
        };

        this.activeAlerts.set(alertKey, alert);
        this.emit('budgetAlert', alert);
      }
    }
  }

  private async checkCostThresholds(modelName: string, cost: number): Promise<void> {
    // Check for unusually high single request cost
    if (cost > 1.0) { // $1 per request threshold
      const alert: BudgetAlert = {
        type: 'usage_spike',
        severity: 'high',
        modelName,
        threshold: 1.0,
        current: cost,
        timeframe: 'request',
        timestamp: new Date(),
        message: `High cost request detected: $${cost.toFixed(4)} for ${modelName}`,
        recommendedActions: [
          'Review request complexity',
          'Check for excessive token usage',
          'Consider breaking down large requests'
        ]
      };

      this.emit('costAlert', modelName, cost);
      this.emit('budgetAlert', alert);
    }
  }

  private async findCostEffectiveAlternatives(modelName: string): Promise<Array<{
    modelName: string;
    confidence: number;
    tradeoffs: string[];
  }>> {
    const alternatives = [];
    const currentPricing = this.pricingData.get(modelName);
    if (!currentPricing) return alternatives;

    // Find models with lower cost per token
    for (const [altModelName, altPricing] of this.pricingData) {
      if (altModelName === modelName) continue;

      const currentAvgCost = (currentPricing.inputTokenPrice + currentPricing.outputTokenPrice) / 2;
      const altAvgCost = (altPricing.inputTokenPrice + altPricing.outputTokenPrice) / 2;

      if (altAvgCost < currentAvgCost * 0.8) { // At least 20% cheaper
        alternatives.push({
          modelName: altModelName,
          confidence: this.calculateAlternativeConfidence(modelName, altModelName),
          tradeoffs: this.getModelTradeoffs(modelName, altModelName)
        });
      }
    }

    return alternatives.sort((a, b) => b.confidence - a.confidence);
  }

  private calculateAlternativeConfidence(current: string, alternative: string): number {
    // Simple confidence calculation based on model characteristics
    // This would be more sophisticated in production
    const confidenceMap: Record<string, Record<string, number>> = {
      'claude-sonnet-4': {
        'claude-haiku-3': 0.8,
        'deepseek-v3': 0.7,
        'gemini-2.5-pro': 0.75
      },
      'gpt-4-turbo': {
        'gpt-4o': 0.9,
        'deepseek-v3': 0.7,
        'claude-haiku-3': 0.6
      }
    };

    return confidenceMap[current]?.[alternative] || 0.5;
  }

  private getModelTradeoffs(current: string, alternative: string): string[] {
    // Define known tradeoffs between models
    const tradeoffMap: Record<string, string[]> = {
      'claude-haiku-3': ['Faster but potentially lower quality for complex tasks'],
      'deepseek-v3': ['Excellent for coding, may be less capable for general tasks'],
      'gemini-2.5-pro': ['Good general performance, different reasoning style']
    };

    return tradeoffMap[alternative] || ['May have different performance characteristics'];
  }

  private async estimateAlternativeCost(
    currentModel: string,
    alternativeModel: string,
    tokenCount: number
  ): Promise<number> {
    const altPricing = this.pricingData.get(alternativeModel);
    if (!altPricing) return 0;

    // Estimate cost assuming similar token distribution
    const avgCost = (altPricing.inputTokenPrice + altPricing.outputTokenPrice) / 2;
    return tokenCount * avgCost;
  }
}

// Export singleton instance
export const costTracker = new CostTracker();