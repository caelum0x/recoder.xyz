/**
 * Usage Tracker for Real-time Cost Monitoring
 * 
 * Tracks AI usage, costs, and provides optimization insights
 * Integrates with the cost monitoring dashboard
 */

import { EventEmitter } from 'events';
import { AIRequest, AIResponse } from '../ai/providers/base-provider';

export interface UsageEvent {
  id: string;
  userId: string;
  timestamp: Date;
  model: string;
  provider: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  requestType: string;
  complexity: 'low' | 'medium' | 'high';
  cached: boolean;
  responseTime: number;
}

export interface UsageAnalytics {
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  averageCostPerRequest: number;
  averageTokensPerRequest: number;
  costByModel: Map<string, number>;
  costByProvider: Map<string, number>;
  costByComplexity: Map<string, number>;
  cacheHitRate: number;
  topExpensiveRequests: UsageEvent[];
  recommendations: OptimizationRecommendation[];
}

export interface OptimizationRecommendation {
  type: 'model_switch' | 'context_caching' | 'batch_processing' | 'complexity_reduction';
  title: string;
  description: string;
  potentialSavings: number;
  implementationComplexity: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high';
}

export interface CostThresholds {
  dailyWarning: number;
  dailyLimit: number;
  monthlyWarning: number;
  monthlyLimit: number;
  perRequestLimit: number;
}

export class UsageTracker extends EventEmitter {
  private events: UsageEvent[] = [];
  private analytics: UsageAnalytics | null = null;
  private lastAnalyticsUpdate: Date = new Date(0);
  private analyticsUpdateInterval = 5 * 60 * 1000; // 5 minutes

  private defaultThresholds: CostThresholds = {
    dailyWarning: 1.0,  // $1 daily warning
    dailyLimit: 2.0,    // $2 daily limit  
    monthlyWarning: 10.0, // $10 monthly warning
    monthlyLimit: 13.0,   // $13 monthly limit (target for $20 plan)
    perRequestLimit: 0.50 // $0.50 per request limit
  };

  constructor(private thresholds: CostThresholds = {}) {
    super();
    this.thresholds = { ...this.defaultThresholds, ...thresholds };
    
    // Cleanup old events every hour
    setInterval(() => this.cleanupOldEvents(), 60 * 60 * 1000);
  }

  /**
   * Track a new usage event
   */
  async trackUsage(
    request: AIRequest,
    response: AIResponse,
    userId: string
  ): Promise<void> {
    const event: UsageEvent = {
      id: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      timestamp: new Date(),
      model: response.metadata.model || 'unknown',
      provider: response.metadata.provider || 'unknown',
      cost: response.usage.cost || 0,
      tokens: {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
        total: response.usage.totalTokens
      },
      requestType: request.metadata.taskType || 'general',
      complexity: this.assessComplexity(request, response),
      cached: response.metadata.cached || false,
      responseTime: response.metadata.responseTime || 0
    };

    this.events.push(event);
    
    // Emit event for real-time monitoring
    this.emit('usage_tracked', event);
    
    // Check thresholds
    await this.checkThresholds(userId, event);
    
    // Update analytics if needed
    this.maybeUpdateAnalytics();
  }

  /**
   * Get usage analytics for a user
   */
  getAnalytics(
    userId: string,
    timeframe: '24h' | '7d' | '30d' = '30d'
  ): UsageAnalytics {
    const userEvents = this.getUserEvents(userId, timeframe);
    return this.calculateAnalytics(userEvents);
  }

  /**
   * Get real-time cost summary
   */
  getCostSummary(userId: string): {
    daily: number;
    weekly: number;
    monthly: number;
    currentMargin: number;
    isOverBudget: boolean;
  } {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const userEvents = this.events.filter(e => e.userId === userId);
    
    const daily = userEvents
      .filter(e => e.timestamp >= dayAgo)
      .reduce((sum, e) => sum + e.cost, 0);
    
    const weekly = userEvents
      .filter(e => e.timestamp >= weekAgo)
      .reduce((sum, e) => sum + e.cost, 0);
    
    const monthly = userEvents
      .filter(e => e.timestamp >= monthAgo)
      .reduce((sum, e) => sum + e.cost, 0);

    // Assuming $20 monthly plan
    const monthlyRevenue = 20;
    const currentMargin = Math.max(0, (monthlyRevenue - monthly) / monthlyRevenue);
    const isOverBudget = monthly > this.thresholds.monthlyLimit;

    return {
      daily,
      weekly,
      monthly,
      currentMargin,
      isOverBudget
    };
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(userId: string): OptimizationRecommendation[] {
    const userEvents = this.getUserEvents(userId, '30d');
    const analytics = this.calculateAnalytics(userEvents);
    
    const recommendations: OptimizationRecommendation[] = [];
    
    // High-cost model recommendations
    const expensiveModels = Array.from(analytics.costByModel.entries())
      .filter(([model, cost]) => cost > analytics.totalCost * 0.3)
      .sort((a, b) => b[1] - a[1]);

    if (expensiveModels.length > 0) {
      const [model, cost] = expensiveModels[0];
      recommendations.push({
        type: 'model_switch',
        title: 'Switch to Cost-Effective Model',
        description: `${model} accounts for ${((cost / analytics.totalCost) * 100).toFixed(1)}% of costs. Consider using Qwen 3 Coder or Llama 3.3 for similar tasks.`,
        potentialSavings: cost * 0.6, // Estimate 60% savings
        implementationComplexity: 'low',
        priority: 'high'
      });
    }

    // Context caching recommendations
    if (analytics.cacheHitRate < 0.3 && analytics.totalRequests > 50) {
      recommendations.push({
        type: 'context_caching',
        title: 'Enable Context Caching',
        description: `Current cache hit rate is ${(analytics.cacheHitRate * 100).toFixed(1)}%. Implementing better caching could save 50-90% on repeated queries.`,
        potentialSavings: analytics.totalCost * 0.4,
        implementationComplexity: 'medium',
        priority: 'high'
      });
    }

    // Complexity reduction recommendations
    const highComplexityCost = analytics.costByComplexity.get('high') || 0;
    if (highComplexityCost > analytics.totalCost * 0.4) {
      recommendations.push({
        type: 'complexity_reduction',
        title: 'Optimize Complex Requests',
        description: 'High complexity requests account for a large portion of costs. Consider breaking them into smaller, simpler requests.',
        potentialSavings: highComplexityCost * 0.3,
        implementationComplexity: 'medium',
        priority: 'medium'
      });
    }

    // Batch processing recommendations
    if (analytics.totalRequests > 200) {
      const avgCost = analytics.averageCostPerRequest;
      if (avgCost < 0.01) { // Many small requests
        recommendations.push({
          type: 'batch_processing',
          title: 'Batch Small Requests',
          description: 'You have many small requests. Batching them could reduce API overhead and costs.',
          potentialSavings: analytics.totalCost * 0.15,
          implementationComplexity: 'medium',
          priority: 'low'
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Export usage data for external analysis
   */
  exportUsageData(
    userId: string,
    timeframe: '24h' | '7d' | '30d' = '30d',
    format: 'json' | 'csv' = 'json'
  ): string {
    const userEvents = this.getUserEvents(userId, timeframe);
    
    if (format === 'csv') {
      const headers = [
        'timestamp', 'model', 'provider', 'cost', 'input_tokens', 
        'output_tokens', 'total_tokens', 'request_type', 'complexity', 
        'cached', 'response_time'
      ];
      
      const rows = userEvents.map(event => [
        event.timestamp.toISOString(),
        event.model,
        event.provider,
        event.cost.toString(),
        event.tokens.input.toString(),
        event.tokens.output.toString(),
        event.tokens.total.toString(),
        event.requestType,
        event.complexity,
        event.cached.toString(),
        event.responseTime.toString()
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    return JSON.stringify(userEvents, null, 2);
  }

  /**
   * Clear usage data (for privacy compliance)
   */
  clearUserData(userId: string): void {
    this.events = this.events.filter(event => event.userId !== userId);
    this.emit('user_data_cleared', { userId });
  }

  private getUserEvents(
    userId: string,
    timeframe: '24h' | '7d' | '30d'
  ): UsageEvent[] {
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeframe) {
      case '24h':
        cutoff.setTime(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoff.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoff.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
    
    return this.events.filter(
      event => event.userId === userId && event.timestamp >= cutoff
    );
  }

  private calculateAnalytics(events: UsageEvent[]): UsageAnalytics {
    const totalCost = events.reduce((sum, e) => sum + e.cost, 0);
    const totalRequests = events.length;
    const totalTokens = events.reduce((sum, e) => sum + e.tokens.total, 0);
    
    const costByModel = new Map<string, number>();
    const costByProvider = new Map<string, number>();
    const costByComplexity = new Map<string, number>();
    
    let cachedRequests = 0;
    
    events.forEach(event => {
      // Cost by model
      const modelCost = costByModel.get(event.model) || 0;
      costByModel.set(event.model, modelCost + event.cost);
      
      // Cost by provider
      const providerCost = costByProvider.get(event.provider) || 0;
      costByProvider.set(event.provider, providerCost + event.cost);
      
      // Cost by complexity
      const complexityCost = costByComplexity.get(event.complexity) || 0;
      costByComplexity.set(event.complexity, complexityCost + event.cost);
      
      if (event.cached) cachedRequests++;
    });
    
    const cacheHitRate = totalRequests > 0 ? cachedRequests / totalRequests : 0;
    const averageCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;
    const averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;
    
    // Top expensive requests
    const topExpensiveRequests = events
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
    
    return {
      totalCost,
      totalRequests,
      totalTokens,
      averageCostPerRequest,
      averageTokensPerRequest,
      costByModel,
      costByProvider,
      costByComplexity,
      cacheHitRate,
      topExpensiveRequests,
      recommendations: [] // Will be filled by getOptimizationRecommendations
    };
  }

  private assessComplexity(request: AIRequest, response: AIResponse): 'low' | 'medium' | 'high' {
    const tokenCount = response.usage.totalTokens;
    const promptLength = request.prompt.length;
    
    if (tokenCount > 3000 || promptLength > 5000) return 'high';
    if (tokenCount > 1000 || promptLength > 1500) return 'medium';
    return 'low';
  }

  private async checkThresholds(userId: string, event: UsageEvent): Promise<void> {
    const summary = this.getCostSummary(userId);
    
    // Check per-request limit
    if (event.cost > this.thresholds.perRequestLimit) {
      this.emit('threshold_exceeded', {
        userId,
        type: 'per_request',
        threshold: this.thresholds.perRequestLimit,
        actual: event.cost,
        event
      });
    }
    
    // Check daily thresholds
    if (summary.daily > this.thresholds.dailyWarning) {
      this.emit('threshold_warning', {
        userId,
        type: 'daily',
        threshold: this.thresholds.dailyWarning,
        actual: summary.daily
      });
    }
    
    if (summary.daily > this.thresholds.dailyLimit) {
      this.emit('threshold_exceeded', {
        userId,
        type: 'daily',
        threshold: this.thresholds.dailyLimit,
        actual: summary.daily
      });
    }
    
    // Check monthly thresholds
    if (summary.monthly > this.thresholds.monthlyWarning) {
      this.emit('threshold_warning', {
        userId,
        type: 'monthly',
        threshold: this.thresholds.monthlyWarning,
        actual: summary.monthly
      });
    }
    
    if (summary.monthly > this.thresholds.monthlyLimit) {
      this.emit('threshold_exceeded', {
        userId,
        type: 'monthly',
        threshold: this.thresholds.monthlyLimit,
        actual: summary.monthly
      });
    }
  }

  private maybeUpdateAnalytics(): void {
    const now = new Date();
    if (now.getTime() - this.lastAnalyticsUpdate.getTime() > this.analyticsUpdateInterval) {
      this.analytics = this.calculateAnalytics(this.events);
      this.lastAnalyticsUpdate = now;
      this.emit('analytics_updated', this.analytics);
    }
  }

  private cleanupOldEvents(): void {
    const cutoff = new Date();
    cutoff.setTime(cutoff.getTime() - 90 * 24 * 60 * 60 * 1000); // Keep 90 days
    
    const initialCount = this.events.length;
    this.events = this.events.filter(event => event.timestamp >= cutoff);
    
    const removedCount = initialCount - this.events.length;
    if (removedCount > 0) {
      this.emit('cleanup_completed', { removedEvents: removedCount });
    }
  }
}

export default UsageTracker;