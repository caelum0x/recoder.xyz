import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('LLMAnalytics');
/**
 * LLM Analytics and Cost Tracking System
 */

export interface PromptUsageMetrics {
  strategy: string;
  originalEstimate: number;
  actualTokens: number;
  savings: number;
  savingsPercentage: number;
  timestamp: number;
  userMessageLength: number;
  conversationLength: number;
}

export interface OptimizationMetrics {
  strategy: 'template-based' | 'model-routed' | 'standard';
  model: string;
  estimatedCost: number;
  savings: number;
  savingsPercent: number;
  templateUsed?: string;
  taskComplexity?: string;
  timestamp: number;
}

export interface CostAnalytics {
  totalRequests: number;
  totalTokensSaved: number;
  totalCostSaved: number; // in USD
  averageSavingsPercentage: number;
  strategyEffectiveness: Record<string, {
    uses: number;
    avgSavings: number;
    avgSavingsPercentage: number;
  }>;
  dailyMetrics: Record<string, {
    requests: number;
    tokensSaved: number;
    costSaved: number;
  }>;
}

class LLMAnalytics {
  private metrics: PromptUsageMetrics[] = [];
  private optimizationMetrics: OptimizationMetrics[] = [];
  private readonly CLAUDE_COST_PER_MTOKEN = 3.0; // USD per million tokens

  // Token estimation for different prompt types
  private readonly PROMPT_TOKEN_ESTIMATES = {
    original: 2800,
    optimized: 1400,
    minimal: 400,
    template: 300,
    smart: 1000,
    'context-aware': 800
  };

  trackOptimization(metrics: OptimizationMetrics): void {
    this.optimizationMetrics.push(metrics);

    // Keep only last 1000 metrics
    if (this.optimizationMetrics.length > 1000) {
      this.optimizationMetrics = this.optimizationMetrics.slice(-1000);
    }

    logger.info('📊 Optimization tracked:', {
      strategy: metrics.strategy,
      model: metrics.model,
      savings: `${metrics.savingsPercent.toFixed(1)}%`,
      cost: `$${metrics.estimatedCost.toFixed(4)}`
    });
  }

  getOptimizationStats(): {
    templateBasedSavings: number;
    modelRoutedSavings: number;
    freeModelUsage: number;
    averageCost: number;
    templateUsageCount: number;
    templateUsagePercent: number;
    topTemplates: Array<{ template: string; uses: number; avgSavings: number }>;
  } {
    if (this.optimizationMetrics.length === 0) {
      return {
        templateBasedSavings: 0,
        modelRoutedSavings: 0,
        freeModelUsage: 0,
        averageCost: 0,
        templateUsageCount: 0,
        templateUsagePercent: 0,
        topTemplates: []
      };
    }

    const templateBased = this.optimizationMetrics.filter(m => m.strategy === 'template-based');
    const modelRouted = this.optimizationMetrics.filter(m => m.strategy === 'model-routed');
    const freeModels = this.optimizationMetrics.filter(m => m.estimatedCost === 0);

    // Template-specific analytics
    const templateUsageCount = templateBased.length;
    const templateUsagePercent = (templateUsageCount / this.optimizationMetrics.length) * 100;

    // Top templates by usage
    const templateGroups = this.groupBy(
      templateBased.filter(m => m.templateUsed),
      'templateUsed' as keyof OptimizationMetrics
    );

    const topTemplates = Object.entries(templateGroups)
      .map(([template, metrics]) => ({
        template,
        uses: metrics.length,
        avgSavings: metrics.reduce((sum, m) => sum + m.savingsPercent, 0) / metrics.length
      }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 10);

    return {
      templateBasedSavings: templateBased.reduce((sum, m) => sum + m.savingsPercent, 0) / (templateBased.length || 1),
      modelRoutedSavings: modelRouted.reduce((sum, m) => sum + m.savingsPercent, 0) / (modelRouted.length || 1),
      freeModelUsage: (freeModels.length / this.optimizationMetrics.length) * 100,
      averageCost: this.optimizationMetrics.reduce((sum, m) => sum + m.estimatedCost, 0) / this.optimizationMetrics.length,
      templateUsageCount,
      templateUsagePercent,
      topTemplates
    };
  }

  trackPromptUsage(
    strategy: string,
    userMessage: string,
    conversationLength: number,
    actualTokens?: number
  ): void {
    const originalEstimate = this.PROMPT_TOKEN_ESTIMATES.original;
    const optimizedEstimate = this.PROMPT_TOKEN_ESTIMATES[strategy as keyof typeof this.PROMPT_TOKEN_ESTIMATES] || 1000;

    const savings = originalEstimate - optimizedEstimate;
    const savingsPercentage = (savings / originalEstimate) * 100;

    const metric: PromptUsageMetrics = {
      strategy,
      originalEstimate,
      actualTokens: actualTokens || optimizedEstimate,
      savings,
      savingsPercentage,
      timestamp: Date.now(),
      userMessageLength: userMessage.length,
      conversationLength
    };

    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory bloat
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  getCostAnalytics(): CostAnalytics {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        totalTokensSaved: 0,
        totalCostSaved: 0,
        averageSavingsPercentage: 0,
        strategyEffectiveness: {},
        dailyMetrics: {}
      };
    }

    const totalRequests = this.metrics.length;
    const totalTokensSaved = this.metrics.reduce((sum, m) => sum + m.savings, 0);
    const totalCostSaved = (totalTokensSaved / 1000000) * this.CLAUDE_COST_PER_MTOKEN;
    const averageSavingsPercentage = this.metrics.reduce((sum, m) => sum + m.savingsPercentage, 0) / totalRequests;

    // Strategy effectiveness
    const strategyEffectiveness: Record<string, any> = {};
    const strategyGroups = this.groupBy(this.metrics, 'strategy');

    for (const [strategy, metrics] of Object.entries(strategyGroups)) {
      strategyEffectiveness[strategy] = {
        uses: metrics.length,
        avgSavings: metrics.reduce((sum, m) => sum + m.savings, 0) / metrics.length,
        avgSavingsPercentage: metrics.reduce((sum, m) => sum + m.savingsPercentage, 0) / metrics.length
      };
    }

    // Daily metrics
    const dailyMetrics: Record<string, any> = {};
    const today = new Date().toISOString().split('T')[0];
    const todayMetrics = this.metrics.filter(m => {
      const metricDate = new Date(m.timestamp).toISOString().split('T')[0];
      return metricDate === today;
    });

    dailyMetrics[today] = {
      requests: todayMetrics.length,
      tokensSaved: todayMetrics.reduce((sum, m) => sum + m.savings, 0),
      costSaved: (todayMetrics.reduce((sum, m) => sum + m.savings, 0) / 1000000) * this.CLAUDE_COST_PER_MTOKEN
    };

    return {
      totalRequests,
      totalTokensSaved,
      totalCostSaved,
      averageSavingsPercentage,
      strategyEffectiveness,
      dailyMetrics
    };
  }

  getPromptEffectiveness(): Record<string, number> {
    const analytics = this.getCostAnalytics();
    const effectiveness: Record<string, number> = {};

    for (const [strategy, data] of Object.entries(analytics.strategyEffectiveness)) {
      effectiveness[strategy] = data.avgSavingsPercentage;
    }

    return effectiveness;
  }

  getRecommendedStrategy(userMessage: string, conversationLength: number): string {
    const effectiveness = this.getPromptEffectiveness();

    // If we have data, recommend the most effective strategy for similar contexts
    if (Object.keys(effectiveness).length > 0) {
      const sortedStrategies = Object.entries(effectiveness)
        .sort(([,a], [,b]) => b - a);

      return sortedStrategies[0][0];
    }

    // Fallback to smart selection
    return 'smart';
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const group = item[key] as string;
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  // Export analytics for monitoring
  exportMetrics(): string {
    const analytics = this.getCostAnalytics();
    return JSON.stringify({
      ...analytics,
      exportDate: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  }

  // Clear old metrics
  clearOldMetrics(daysToKeep: number = 7): void {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoffTime);
  }
}

// Global analytics instance
export const llmAnalytics = new LLMAnalytics();

// Utility functions for cost calculation
export const estimateTokenCount = (text: string): number => {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
};

export const calculateMonthlySavings = (dailyCostSaved: number): number => {
  return dailyCostSaved * 30;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4
  }).format(amount);
};