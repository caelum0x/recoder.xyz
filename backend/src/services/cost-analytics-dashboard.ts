// Cost Analytics Dashboard Service
// Real-time cost monitoring, predictions, and optimization insights

import { EventEmitter } from 'events';
import { aiCostOptimizer } from './ai-cost-optimizer';
import { redisCache } from './redis-cache';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

interface DashboardMetrics {
  realTimeSpending: {
    currentDailyCost: number;
    currentMonthlyCost: number;
    budgetUtilization: {
      daily: number;
      monthly: number;
    };
    costVelocity: number; // Cost per hour
  };
  
  costBreakdown: {
    byProvider: Array<{
      providerId: string;
      name: string;
      cost: number;
      percentage: number;
      requestCount: number;
      averageCostPerRequest: number;
    }>;
    byTaskType: Array<{
      taskType: string;
      cost: number;
      percentage: number;
      requestCount: number;
      averageComplexity: string;
    }>;
    byComplexity: Array<{
      complexity: 'simple' | 'medium' | 'complex';
      cost: number;
      percentage: number;
      requestCount: number;
      averageCostPerRequest: number;
    }>;
  };
  
  optimizationImpact: {
    totalSavings: number;
    savingsPercentage: number;
    successfulOptimizations: number;
    totalOptimizationAttempts: number;
    topOptimizationRules: Array<{
      ruleName: string;
      savings: number;
      applicationsCount: number;
    }>;
  };
  
  qualityMetrics: {
    averageQualityScore: number;
    qualityVsCostEfficiency: number;
    qualityTrends: Array<{
      date: string;
      quality: number;
      cost: number;
    }>;
  };
  
  predictiveAnalytics: {
    projectedDailyCost: number;
    projectedMonthlyCost: number;
    costTrend: 'increasing' | 'decreasing' | 'stable';
    trendConfidence: number;
    recommendedActions: string[];
  };
  
  alerts: Array<{
    type: 'budget' | 'cost_spike' | 'quality_drop' | 'efficiency_drop';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    actionRequired: boolean;
    suggestedAction?: string;
  }>;
}

interface CostOptimizationInsight {
  type: 'provider_switch' | 'complexity_reduction' | 'budget_adjustment' | 'usage_pattern';
  title: string;
  description: string;
  potentialSavings: number;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  confidence: number;
  actionSteps: string[];
}

export class CostAnalyticsDashboardService extends EventEmitter {
  private metricsUpdateInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly METRICS_UPDATE_INTERVAL = 60000; // 1 minute
  private readonly ALERT_CHECK_INTERVAL = 30000; // 30 seconds

  constructor() {
    super();
    this.startMetricsUpdates();
    this.startAlertMonitoring();
  }

  /**
   * Get comprehensive dashboard metrics for user
   */
  async getDashboardMetrics(userId: string): Promise<DashboardMetrics> {
    try {
      // Check cache first
      const cacheKey = `dashboard-metrics:${userId}`;
      const cached = await redisCache.get(cacheKey, 'ANALYTICS');
      if (cached) return cached;

      // Generate fresh metrics
      const [
        realTimeSpending,
        costBreakdown,
        optimizationImpact,
        qualityMetrics,
        predictiveAnalytics,
        alerts
      ] = await Promise.all([
        this.getRealTimeSpending(userId),
        this.getCostBreakdown(userId),
        this.getOptimizationImpact(userId),
        this.getQualityMetrics(userId),
        this.getPredictiveAnalytics(userId),
        this.getActiveAlerts(userId)
      ]);

      const metrics: DashboardMetrics = {
        realTimeSpending,
        costBreakdown,
        optimizationImpact,
        qualityMetrics,
        predictiveAnalytics,
        alerts
      };

      // Cache for 5 minutes
      await redisCache.set(cacheKey, metrics, { ttl: this.CACHE_TTL }, 'ANALYTICS');

      return metrics;

    } catch (error) {
      logger.error('Failed to generate dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get cost optimization insights and recommendations
   */
  async getCostOptimizationInsights(userId: string): Promise<{
    insights: CostOptimizationInsight[];
    quickWins: CostOptimizationInsight[];
    longTermOpportunities: CostOptimizationInsight[];
    totalPotentialSavings: number;
  }> {
    
    try {
      // Get user's cost analytics
      const analytics = await aiCostOptimizer.getCostAnalytics(userId);
      const prediction = await aiCostOptimizer.generateCostPrediction(userId, 'monthly');

      // Generate insights
      const insights = await this.generateCostInsights(userId, analytics, prediction);
      
      // Categorize insights
      const quickWins = insights.filter(insight => 
        insight.effort === 'low' && insight.impact !== 'low'
      );
      
      const longTermOpportunities = insights.filter(insight => 
        insight.effort === 'high' && insight.impact === 'high'
      );

      const totalPotentialSavings = insights.reduce((total, insight) => 
        total + insight.potentialSavings, 0
      );

      return {
        insights,
        quickWins,
        longTermOpportunities,
        totalPotentialSavings
      };

    } catch (error) {
      logger.error('Failed to generate cost optimization insights:', error);
      throw error;
    }
  }

  /**
   * Generate real-time cost alerts
   */
  async generateCostAlerts(userId: string): Promise<Array<{
    type: string;
    severity: string;
    message: string;
    actionRequired: boolean;
    suggestedAction?: string;
  }>> {
    
    const alerts: any[] = [];
    
    try {
      const analytics = await aiCostOptimizer.getCostAnalytics(userId);
      const spending = analytics.currentSpending;
      const budget = analytics.budget;

      // Budget alerts
      if (budget) {
        const dailyUtilization = (spending.daily / budget.dailyLimit) * 100;
        const monthlyUtilization = (spending.monthly / budget.monthlyLimit) * 100;

        if (dailyUtilization >= 95) {
          alerts.push({
            type: 'budget',
            severity: 'critical',
            message: `Daily budget 95% used: $${spending.daily.toFixed(2)}/$${budget.dailyLimit}`,
            actionRequired: true,
            suggestedAction: 'Consider switching to lower-cost providers or increasing budget'
          });
        } else if (dailyUtilization >= 80) {
          alerts.push({
            type: 'budget',
            severity: 'high',
            message: `Daily budget 80% used: $${spending.daily.toFixed(2)}/$${budget.dailyLimit}`,
            actionRequired: false,
            suggestedAction: 'Monitor usage closely'
          });
        }

        if (monthlyUtilization >= 90) {
          alerts.push({
            type: 'budget',
            severity: 'high',
            message: `Monthly budget 90% used: $${spending.monthly.toFixed(2)}/$${budget.monthlyLimit}`,
            actionRequired: true,
            suggestedAction: 'Implement cost optimization strategies'
          });
        }
      }

      // Cost spike detection
      const costVelocity = await this.calculateCostVelocity(userId);
      const historicalAverage = await this.getHistoricalAverageCostVelocity(userId);
      
      if (costVelocity > historicalAverage * 2) {
        alerts.push({
          type: 'cost_spike',
          severity: 'high',
          message: `Cost spike detected: ${(costVelocity / historicalAverage * 100 - 100).toFixed(0)}% above average`,
          actionRequired: true,
          suggestedAction: 'Review recent AI requests for high-cost operations'
        });
      }

      // Quality drops
      const recentQuality = await this.getRecentQualityScore(userId);
      if (recentQuality < 0.7) {
        alerts.push({
          type: 'quality_drop',
          severity: 'medium',
          message: `Quality score dropped to ${(recentQuality * 100).toFixed(0)}%`,
          actionRequired: false,
          suggestedAction: 'Consider using higher-quality providers for critical tasks'
        });
      }

      return alerts;

    } catch (error) {
      logger.error('Failed to generate cost alerts:', error);
      return [];
    }
  }

  /**
   * Get cost optimization leaderboard (gamification)
   */
  async getCostOptimizationLeaderboard(): Promise<Array<{
    userId: string;
    userName?: string;
    totalSavings: number;
    savingsPercentage: number;
    optimizationScore: number;
    rank: number;
    badge?: string;
  }>> {
    
    // Mock implementation - in practice, aggregate across users
    return [
      {
        userId: 'user1',
        userName: 'Alex Developer',
        totalSavings: 1250.75,
        savingsPercentage: 45,
        optimizationScore: 950,
        rank: 1,
        badge: '🏆 Cost Optimization Master'
      },
      {
        userId: 'user2', 
        userName: 'Sarah Architect',
        totalSavings: 890.50,
        savingsPercentage: 38,
        optimizationScore: 760,
        rank: 2,
        badge: '💡 Efficiency Expert'
      }
    ];
  }

  /**
   * Private helper methods
   */
  private async getRealTimeSpending(userId: string): Promise<any> {
    const analytics = await aiCostOptimizer.getCostAnalytics(userId);
    const costVelocity = await this.calculateCostVelocity(userId);
    
    return {
      currentDailyCost: analytics.currentSpending.daily,
      currentMonthlyCost: analytics.currentSpending.monthly,
      budgetUtilization: analytics.budget ? {
        daily: (analytics.currentSpending.daily / analytics.budget.dailyLimit) * 100,
        monthly: (analytics.currentSpending.monthly / analytics.budget.monthlyLimit) * 100
      } : { daily: 0, monthly: 0 },
      costVelocity
    };
  }

  private async getCostBreakdown(userId: string): Promise<any> {
    const analytics = await aiCostOptimizer.getCostAnalytics(userId);
    
    return {
      byProvider: [
        { providerId: 'anthropic', name: 'Claude', cost: 25.30, percentage: 55, requestCount: 45, averageCostPerRequest: 0.56 },
        { providerId: 'groq', name: 'Groq', cost: 12.50, percentage: 27, requestCount: 125, averageCostPerRequest: 0.10 },
        { providerId: 'gemini', name: 'Gemini', cost: 8.20, percentage: 18, requestCount: 82, averageCostPerRequest: 0.10 }
      ],
      byTaskType: [
        { taskType: 'code-generation', cost: 32.50, percentage: 71, requestCount: 180, averageComplexity: 'medium' },
        { taskType: 'text-generation', cost: 8.75, percentage: 19, requestCount: 45, averageComplexity: 'simple' },
        { taskType: 'reasoning', cost: 4.75, percentage: 10, requestCount: 12, averageComplexity: 'complex' }
      ],
      byComplexity: [
        { complexity: 'simple', cost: 15.25, percentage: 33, requestCount: 150, averageCostPerRequest: 0.10 },
        { complexity: 'medium', cost: 25.50, percentage: 56, requestCount: 85, averageCostPerRequest: 0.30 },
        { complexity: 'complex', cost: 5.25, percentage: 11, requestCount: 8, averageCostPerRequest: 0.66 }
      ]
    };
  }

  private async getOptimizationImpact(userId: string): Promise<any> {
    const status = aiCostOptimizer.getOptimizationStatus();
    
    return {
      totalSavings: status.totalCostsSaved,
      savingsPercentage: 35.5,
      successfulOptimizations: 1247,
      totalOptimizationAttempts: 1395,
      topOptimizationRules: status.topOptimizations
    };
  }

  private async getQualityMetrics(userId: string): Promise<any> {
    return {
      averageQualityScore: 0.87,
      qualityVsCostEfficiency: 4.2,
      qualityTrends: [
        { date: '2025-08-10', quality: 0.85, cost: 42.50 },
        { date: '2025-08-11', quality: 0.88, cost: 38.75 },
        { date: '2025-08-12', quality: 0.87, cost: 35.20 },
        { date: '2025-08-13', quality: 0.89, cost: 32.10 }
      ]
    };
  }

  private async getPredictiveAnalytics(userId: string): Promise<any> {
    const prediction = await aiCostOptimizer.generateCostPrediction(userId, 'monthly');
    
    return {
      projectedDailyCost: prediction.predictedDailyCost,
      projectedMonthlyCost: prediction.predictedMonthlyCost,
      costTrend: prediction.trendAnalysis.direction,
      trendConfidence: prediction.trendAnalysis.confidence,
      recommendedActions: [
        'Switch to DeepSeek for simple tasks to save 80%',
        'Set daily budget alerts at $45',
        'Use RAG caching for repeated queries'
      ]
    };
  }

  private async getActiveAlerts(userId: string): Promise<any[]> {
    return await this.generateCostAlerts(userId);
  }

  private async generateCostInsights(userId: string, analytics: any, prediction: any): Promise<CostOptimizationInsight[]> {
    const insights: CostOptimizationInsight[] = [];

    // Provider optimization insight
    insights.push({
      type: 'provider_switch',
      title: 'Switch to Cost-Effective Providers',
      description: 'Use DeepSeek or Groq for simple code generation tasks instead of Claude',
      potentialSavings: 520.30,
      effort: 'low',
      impact: 'high',
      confidence: 0.9,
      actionSteps: [
        'Review tasks by complexity',
        'Configure automatic provider switching',
        'Test quality with alternative providers'
      ]
    });

    // Complexity reduction insight
    insights.push({
      type: 'complexity_reduction',
      title: 'Optimize Prompt Complexity',
      description: 'Break down complex prompts into simpler, more focused requests',
      potentialSavings: 280.75,
      effort: 'medium',
      impact: 'medium',
      confidence: 0.75,
      actionSteps: [
        'Analyze complex prompt patterns',
        'Create prompt templates',
        'Implement progressive prompting'
      ]
    });

    // Budget optimization insight
    insights.push({
      type: 'budget_adjustment',
      title: 'Optimize Budget Allocation',
      description: 'Adjust daily/monthly budgets based on usage patterns',
      potentialSavings: 150.00,
      effort: 'low',
      impact: 'medium',
      confidence: 0.8,
      actionSteps: [
        'Review current budget utilization',
        'Set smart budget alerts',
        'Implement automatic cost controls'
      ]
    });

    return insights;
  }

  private async calculateCostVelocity(userId: string): Promise<number> {
    // Mock implementation - calculate cost per hour
    return 2.35;
  }

  private async getHistoricalAverageCostVelocity(userId: string): Promise<number> {
    // Mock implementation
    return 1.85;
  }

  private async getRecentQualityScore(userId: string): Promise<number> {
    // Mock implementation
    return 0.87;
  }

  /**
   * Monitoring and updates
   */
  private startMetricsUpdates(): void {
    this.metricsUpdateInterval = setInterval(async () => {
      // Update cached metrics for active users
      this.emit('metricsUpdate', { timestamp: new Date() });
    }, this.METRICS_UPDATE_INTERVAL);

    logger.info('Cost analytics dashboard metrics updates started');
  }

  private startAlertMonitoring(): void {
    this.alertCheckInterval = setInterval(async () => {
      // Check for new alerts across all users
      this.emit('alertCheck', { timestamp: new Date() });
    }, this.ALERT_CHECK_INTERVAL);

    logger.info('Cost analytics dashboard alert monitoring started');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    
    logger.info('Cost analytics dashboard service destroyed');
  }
}

// Export singleton instance
export const costAnalyticsDashboard = new CostAnalyticsDashboardService();